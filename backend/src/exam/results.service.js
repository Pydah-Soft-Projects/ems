'use strict';

const { AppError } = require('../common/errors');
const { ExamStatus } = require('./schemas/exam.enums');

/** Grades that always mean fail, even without an explicit P/F column. */
const FAIL_GRADES = new Set(['F', 'AB', 'ABSENT', 'FAIL', 'WH', 'MP']);

function normalizeResultFlag(raw, grade) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (['P', 'PASS', 'PASSED', 'Y', 'YES', 'TRUE'].includes(v)) return true;
  if (['F', 'FAIL', 'FAILED', 'N', 'NO', 'FALSE', 'AB', 'ABSENT'].includes(v)) {
    return false;
  }
  if (v !== '') return null; // unrecognised value — row error
  // No P/F given: infer from the grade
  return !FAIL_GRADES.has(String(grade ?? '').trim().toUpperCase());
}

class ResultsService {
  constructor(resultUploadRepo, subjectResultRepo, examRepo, applicationRepo, sdms, markRepo, subjectRepo) {
    this.uploadRepo = resultUploadRepo;
    this.resultRepo = subjectResultRepo;
    this.examRepo = examRepo;
    this.applicationRepo = applicationRepo;
    this.sdms = sdms;
    this.markRepo = markRepo;
    this.subjectRepo = subjectRepo;
  }

  async getExam(examId) {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw AppError.notFound('Examination not found');
    return exam;
  }

  /**
   * Post results for an exam from a parsed sheet.
   * Rows: { rollNumber, subjectCode, subjectName?, grade, gradePoints?,
   * result?, credits? }.
   * Validation is atomic — nothing is saved unless every row is valid.
   * Re-uploading corrects existing rows in place (same attempt); results for
   * the same subject from a different exam become the next attempt.
   */
  async uploadResults(examId, dto, uploadedBy) {
    const exam = await this.getExam(examId);
    if (exam.status !== ExamStatus.PUBLISHED) {
      throw AppError.badRequest('Results can only be posted for published examinations');
    }
    const rows = Array.isArray(dto?.rows) ? dto.rows : [];
    if (rows.length === 0) {
      throw AppError.badRequest('No result rows to post');
    }
    if (rows.length > 5000) {
      throw AppError.badRequest('Too many rows in one upload (max 5000)');
    }

    // Valid subject codes on this exam (papers may repeat per branch group)
    const subjectByCode = new Map();
    for (const es of exam.examSubjects ?? []) {
      const code = es.subject?.code?.trim();
      if (code && !subjectByCode.has(code.toLowerCase())) {
        subjectByCode.set(code.toLowerCase(), {
          subjectId: es.subjectId,
          code,
          name: es.subject?.name ?? '',
        });
      }
    }

    // Students who actually enrolled on this exam, with their selected papers
    const applications = await this.applicationRepo.find({ where: { examId } });
    const appsByRoll = new Map();
    for (const a of applications) {
      const key = a.studentRollNumber.trim().toLowerCase();
      const entry = appsByRoll.get(key) ?? {
        roll: a.studentRollNumber.trim(),
        name: a.studentName,
        examTypes: [],
        subjectIds: new Set(),
      };
      entry.examTypes.push(a.examType);
      for (const sid of a.selectedSubjectIds ?? []) entry.subjectIds.add(sid);
      appsByRoll.set(key, entry);
    }

    const errors = [];
    const normalized = [];
    const seen = new Set();
    rows.forEach((row, idx) => {
      const line = idx + 2; // 1-based + header row, matches the sheet
      const roll = String(row.rollNumber ?? '').trim();
      const code = String(row.subjectCode ?? '').trim();
      const grade = String(row.grade ?? '').trim().toUpperCase();
      if (!roll) {
        errors.push({ row: line, message: 'Roll number / PIN is missing' });
        return;
      }
      if (!code) {
        errors.push({ row: line, message: `Subject code is missing (${roll})` });
        return;
      }
      if (!grade) {
        errors.push({ row: line, message: `Grade is missing (${roll} / ${code})` });
        return;
      }
      const subject = subjectByCode.get(code.toLowerCase());
      if (!subject) {
        errors.push({
          row: line,
          message: `Subject code "${code}" is not a paper of this examination`,
        });
        return;
      }
      const app = appsByRoll.get(roll.toLowerCase());
      const studentName = app ? app.name : String(row.studentName || row.name || '').trim() || null;
      const examType = app && app.examTypes.length === 1 ? app.examTypes[0] : null;
      const passed = normalizeResultFlag(row.result, grade);
      if (passed === null) {
        errors.push({
          row: line,
          message: `Result "${row.result}" must be P or F (${roll} / ${code})`,
        });
        return;
      }
      let credits = 0;
      if (row.credits !== undefined && row.credits !== null && String(row.credits).trim() !== '') {
        credits = Number(row.credits);
        if (Number.isNaN(credits) || credits < 0) {
          errors.push({
            row: line,
            message: `Credits must be a non-negative number (${roll} / ${code})`,
          });
          return;
        }
      }
      let gradePoints = null;
      if (
        row.gradePoints !== undefined &&
        row.gradePoints !== null &&
        String(row.gradePoints).trim() !== ''
      ) {
        gradePoints = Number(row.gradePoints);
        if (Number.isNaN(gradePoints) || gradePoints < 0) {
          errors.push({
            row: line,
            message: `Grade points must be a non-negative number (${roll} / ${code})`,
          });
          return;
        }
      }
      const dupKey = `${roll.toLowerCase()}|${code.toLowerCase()}`;
      if (seen.has(dupKey)) {
        errors.push({
          row: line,
          message: `Duplicate row for ${roll} / ${code} in this sheet`,
        });
        return;
      }
      seen.add(dupKey);
      normalized.push({
        roll,
        studentName,
        examType,
        subject,
        subjectName: String(row.subjectName ?? '').trim() || subject.name,
        grade,
        gradePoints,
        passed,
        credits,
      });
    });

    if (errors.length > 0) {
      return { success: false, errors, validRows: normalized.length };
    }

    // Existing rows of THIS exam (re-upload → correction, same attempt)
    const existing = await this.resultRepo.find({ where: { examId } });
    const existingByKey = new Map(
      existing.map((r) => [
        `${r.studentRollNumber.toLowerCase()}|${r.subjectCode.toLowerCase()}`,
        r,
      ]),
    );

    // Attempt numbers come from OTHER exams' history for the same subject
    const rolls = [...new Set(normalized.map((n) => n.roll))];
    const history = rolls.length
      ? await this.resultRepo
          .createQueryBuilder('r')
          .where('r.examId != :examId', { examId })
          .andWhere('LOWER(r.studentRollNumber) IN (:...rolls)', {
            rolls: rolls.map((r) => r.toLowerCase()),
          })
          .getMany()
      : [];
    const attemptsByKey = new Map();
    for (const h of history) {
      const key = `${h.studentRollNumber.toLowerCase()}|${h.subjectCode.toLowerCase()}`;
      attemptsByKey.set(key, Math.max(attemptsByKey.get(key) ?? 0, h.attemptNumber));
    }

    const upload = await this.uploadRepo.save(
      this.uploadRepo.create({
        examId,
        fileName: dto.fileName ?? null,
        uploadedBy: uploadedBy ?? null,
        rowCount: normalized.length,
        studentCount: rolls.length,
      }),
    );

    let inserted = 0;
    let updated = 0;
    const toSave = normalized.map((n) => {
      const key = `${n.roll.toLowerCase()}|${n.subject.code.toLowerCase()}`;
      const prior = existingByKey.get(key);
      if (prior) {
        updated += 1;
        return this.resultRepo.merge(prior, {
          uploadId: upload.id,
          subjectName: n.subjectName,
          grade: n.grade,
          gradePoints: n.gradePoints,
          passed: n.passed,
          credits: n.credits,
          studentName: n.studentName ?? prior.studentName,
          examType: n.examType ?? prior.examType,
        });
      }
      inserted += 1;
      return this.resultRepo.create({
        uploadId: upload.id,
        examId,
        studentRollNumber: n.roll,
        studentName: n.studentName ?? null,
        subjectCode: n.subject.code,
        subjectName: n.subjectName,
        grade: n.grade,
        gradePoints: n.gradePoints,
        passed: n.passed,
        credits: n.credits,
        examType: n.examType,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        attemptNumber: (attemptsByKey.get(key) ?? 0) + 1,
      });
    });
    await this.resultRepo.save(toSave, { chunk: 200 });

    const passCount = normalized.filter((n) => n.passed).length;
    return {
      success: true,
      uploadId: upload.id,
      inserted,
      updated,
      students: rolls.length,
      passCount,
      failCount: normalized.length - passCount,
    };
  }

  /** Admin view: everything posted for one exam, grouped per student. */
  async getExamResults(examId) {
    const exam = await this.getExam(examId);
    const [uploads, results] = await Promise.all([
      this.uploadRepo.find({ where: { examId }, order: { createdAt: 'DESC' } }),
      this.resultRepo.find({
        where: { examId },
        order: { studentRollNumber: 'ASC', subjectCode: 'ASC' },
      }),
    ]);
    const students = new Map();
    for (const r of results) {
      const key = r.studentRollNumber.toLowerCase();
      const s = students.get(key) ?? {
        rollNumber: r.studentRollNumber,
        studentName: r.studentName,
        examType: r.examType,
        subjects: [],
        allPassed: true,
      };
      s.subjects.push({
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        grade: r.grade,
        gradePoints: r.gradePoints == null ? null : Number(r.gradePoints),
        passed: !!r.passed,
        credits: Number(r.credits),
        attemptNumber: r.attemptNumber,
      });
      if (!r.passed) s.allPassed = false;
      students.set(key, s);
    }
    const subjectStats = new Map();
    for (const r of results) {
      const key = r.subjectCode.toLowerCase();
      const st = subjectStats.get(key) ?? {
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        appeared: 0,
        passed: 0,
        failed: 0,
      };
      st.appeared += 1;
      if (r.passed) st.passed += 1;
      else st.failed += 1;
      subjectStats.set(key, st);
    }
    const studentList = [...students.values()].sort((a, b) =>
      a.rollNumber.localeCompare(b.rollNumber),
    );
    return {
      exam: {
        id: exam.id,
        name: exam.name,
        status: exam.status,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
      },
      uploads: uploads.map((u) => ({
        id: u.id,
        fileName: u.fileName,
        uploadedBy: u.uploadedBy,
        rowCount: u.rowCount,
        studentCount: u.studentCount,
        createdAt: u.createdAt,
      })),
      totals: {
        students: studentList.length,
        allClear: studentList.filter((s) => s.allPassed).length,
        withFailures: studentList.filter((s) => !s.allPassed).length,
        rows: results.length,
      },
      subjectStats: [...subjectStats.values()].sort((a, b) =>
        a.subjectCode.localeCompare(b.subjectCode),
      ),
      students: studentList,
    };
  }

  /**
   * A student's full result history grouped by semester.
   * Per subject: every attempt (regular + supply) in order; the LATEST
   * attempt decides the subject's current status. A semester is passed
   * only when every subject's latest attempt is a pass.
   */
  async getStudentResultsByRoll(rollNumber) {
    const roll = String(rollNumber ?? '').trim();
    if (!roll) throw AppError.badRequest('Roll number is required');

    // 1. Published results from subject_results table
    const results = await this.resultRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.exam', 'exam')
      .where('LOWER(r.studentRollNumber) = LOWER(:roll)', { roll })
      .orderBy('r.yearOfStudy', 'ASC')
      .addOrderBy('r.semester', 'ASC')
      .addOrderBy('r.subjectCode', 'ASC')
      .addOrderBy('r.attemptNumber', 'ASC')
      .getMany();

    // 2. Internal marks directly written/forwarded into student_marks table
    let markRecords = [];
    try {
      const mRepo = this.markRepo || (this.resultRepo?.manager?.getRepository('StudentMark'));
      if (mRepo) {
        markRecords = await mRepo
          .createQueryBuilder('m')
          .where('LOWER(m.studentRollNumber) = LOWER(:roll)', { roll })
          .getMany();
      }
    } catch (err) {
      console.warn('Could not fetch student_marks in getStudentResultsByRoll:', err.message);
    }

    const internalMarksMap = new Map();
    for (const m of markRecords) {
      const sCode = String(m.subjectCode ?? '').trim().toLowerCase();
      if (!sCode) continue;

      const cat = String(m.category ?? '').toLowerCase();
      const intVal = m.internalMarks != null ? Number(m.internalMarks) : null;
      const maxIntVal = m.maxInternalMarks != null ? Number(m.maxInternalMarks) : 30;

      if (!internalMarksMap.has(sCode) || cat === 'internal' || intVal != null) {
        internalMarksMap.set(sCode, {
          subjectCode: m.subjectCode,
          subjectName: m.subjectName || null,
          internalMarks: intVal,
          maxInternalMarks: maxIntVal,
          status: m.status ?? 'synced',
          remarks: m.remarks ?? null,
          uploadedBy: m.uploadedBy ?? null,
          updatedAt: m.updatedAt ?? null,
        });
      }
    }

    const semesters = new Map();
    const seenSubjectCodes = new Set();

    for (const r of results) {
      const semKey = `${r.yearOfStudy}-${r.semester}`;
      const sem = semesters.get(semKey) ?? {
        yearOfStudy: r.yearOfStudy,
        semester: r.semester,
        subjects: new Map(),
      };
      const subKey = r.subjectCode.toLowerCase();
      seenSubjectCodes.add(subKey);

      const sub = sem.subjects.get(subKey) ?? {
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        attempts: [],
      };
      sub.attempts.push({
        attemptNumber: r.attemptNumber,
        grade: r.grade,
        gradePoints: r.gradePoints == null ? null : Number(r.gradePoints),
        passed: !!r.passed,
        credits: Number(r.credits),
        examId: r.examId,
        examName: r.exam?.name ?? null,
        examType: r.examType,
        postedAt: r.createdAt,
      });
      // keep the most descriptive name
      if (r.subjectName?.length > (sub.subjectName?.length ?? 0)) {
        sub.subjectName = r.subjectName;
      }
      sem.subjects.set(subKey, sub);
      semesters.set(semKey, sem);
    }

    // Include internal-only subjects from student_marks if not yet published in subject_results
    for (const [subKey, intInfo] of internalMarksMap.entries()) {
      if (!seenSubjectCodes.has(subKey)) {
        let yearOfStudy = 1;
        let semester = 1;
        let dbSubjectName = intInfo.subjectName;

        try {
          const sRepo = this.subjectRepo || (this.resultRepo?.manager?.getRepository('Subject'));
          if (sRepo) {
            const dbSub = await sRepo
              .createQueryBuilder('s')
              .where('LOWER(s.code) = LOWER(:code)', { code: intInfo.subjectCode })
              .getOne();

            if (dbSub) {
              yearOfStudy = dbSub.yearOfStudy || 1;
              semester = dbSub.semester || 1;
              if (!dbSubjectName && dbSub.name) dbSubjectName = dbSub.name;
            }
          }
        } catch (subErr) {
          // ignore lookup error
        }

        const semKey = `${yearOfStudy}-${semester}`;
        const sem = semesters.get(semKey) ?? {
          yearOfStudy,
          semester,
          subjects: new Map(),
        };

        sem.subjects.set(subKey, {
          subjectCode: intInfo.subjectCode,
          subjectName: dbSubjectName || intInfo.subjectCode,
          attempts: [],
          isInternalOnly: true,
        });
        semesters.set(semKey, sem);
      }
    }

    let totalCreditsEarned = 0;
    let totalBacklogs = 0;
    const semesterList = [...semesters.values()]
      .sort((a, b) => a.yearOfStudy - b.yearOfStudy || a.semester - b.semester)
      .map((sem) => {
        const subjects = [...sem.subjects.values()].map((sub) => {
          const subKey = sub.subjectCode.toLowerCase();
          const intInfo = internalMarksMap.get(subKey);

          if (sub.isInternalOnly) {
            return {
              subjectCode: sub.subjectCode,
              subjectName: sub.subjectName,
              grade: 'Internal Only',
              gradePoints: null,
              passed: null,
              credits: 0,
              attemptCount: 0,
              attempts: [],
              internalMarks: intInfo?.internalMarks ?? null,
              maxInternalMarks: intInfo?.maxInternalMarks ?? 30,
              internalStatus: intInfo?.status ?? 'synced',
              remarks: intInfo?.remarks ?? 'Internal Marks Forwarded',
              isInternalOnly: true,
            };
          }

          const attempts = [...sub.attempts].sort(
            (a, b) => a.attemptNumber - b.attemptNumber,
          );
          const latest = attempts[attempts.length - 1];
          return {
            subjectCode: sub.subjectCode,
            subjectName: sub.subjectName,
            grade: latest.grade,
            gradePoints: latest.gradePoints,
            passed: latest.passed,
            credits: latest.credits,
            attemptCount: attempts.length,
            attempts,
            internalMarks: intInfo?.internalMarks ?? null,
            maxInternalMarks: intInfo?.maxInternalMarks ?? 30,
            internalStatus: intInfo?.status ?? null,
            remarks: intInfo?.remarks ?? null,
          };
        });

        const publishedSubjects = subjects.filter((s) => !s.isInternalOnly);
        const cleared = publishedSubjects.filter((s) => s.passed);
        const backlogs = publishedSubjects.length - cleared.length;
        const creditsEarned = cleared.reduce((sum, s) => sum + s.credits, 0);
        totalCreditsEarned += creditsEarned;
        totalBacklogs += backlogs;

        return {
          yearOfStudy: sem.yearOfStudy,
          semester: sem.semester,
          status: publishedSubjects.length > 0 ? (backlogs === 0 ? 'passed' : 'backlogs') : 'passed',
          totalSubjects: subjects.length,
          cleared: cleared.length,
          backlogs,
          creditsEarned,
          subjects: subjects.sort((a, b) =>
            a.subjectCode.localeCompare(b.subjectCode),
          ),
        };
      });

    const studentNameFromResults = results.find((r) => r.studentName)?.studentName ?? null;
    const studentNameFromMarks = markRecords.find((m) => m.studentName)?.studentName ?? null;

    return {
      rollNumber: roll,
      studentName: studentNameFromResults || studentNameFromMarks || null,
      summary: {
        semesters: semesterList.length,
        semestersPassed: semesterList.filter((s) => s.status === 'passed').length,
        totalBacklogs,
        totalCreditsEarned,
      },
      semesters: semesterList,
    };
  }

  /** Student-portal entry point: resolve the SDMS student → roll. */
  async getStudentResults(studentId) {
    const student = await this.sdms.getStudent(studentId);
    const roll = (student.pinNo || student.admissionNumber || '').trim();
    if (!roll) throw AppError.badRequest('Student has no PIN / roll number');
    const payload = await this.getStudentResultsByRoll(roll);
    return {
      ...payload,
      studentName: payload.studentName ?? student.studentName ?? null,
      student: {
        id: student.id,
        name: student.studentName,
        pinNo: student.pinNo,
        college: student.college,
        course: student.course,
        branch: student.branch,
        batch: student.batch,
      },
    };
  }
}

module.exports = { ResultsService };
