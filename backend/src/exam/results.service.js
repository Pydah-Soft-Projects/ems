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
  constructor(resultUploadRepo, subjectResultRepo, examRepo, applicationRepo, sdms) {
    this.uploadRepo = resultUploadRepo;
    this.resultRepo = subjectResultRepo;
    this.examRepo = examRepo;
    this.applicationRepo = applicationRepo;
    this.sdms = sdms;
  }

  async getExam(examId) {
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) throw AppError.notFound('Examination not found');
    return exam;
  }

  /**
   * Post results for an exam from a parsed sheet.
   * Rows: { rollNumber, subjectCode, subjectName?, grade, result?, credits? }.
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
      if (!app) {
        errors.push({
          row: line,
          message: `${roll} has no application on this examination`,
        });
        return;
      }
      if (app.subjectIds.size > 0 && !app.subjectIds.has(subject.subjectId)) {
        errors.push({
          row: line,
          message: `${roll} did not apply for subject ${subject.code}`,
        });
        return;
      }
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
        studentName: app.name,
        examType: app.examTypes.length === 1 ? app.examTypes[0] : null,
        subject,
        subjectName: String(row.subjectName ?? '').trim() || subject.name,
        grade,
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
    const results = await this.resultRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.exam', 'exam')
      .where('LOWER(r.studentRollNumber) = LOWER(:roll)', { roll })
      .orderBy('r.yearOfStudy', 'ASC')
      .addOrderBy('r.semester', 'ASC')
      .addOrderBy('r.subjectCode', 'ASC')
      .addOrderBy('r.attemptNumber', 'ASC')
      .getMany();

    const semesters = new Map();
    for (const r of results) {
      const semKey = `${r.yearOfStudy}-${r.semester}`;
      const sem = semesters.get(semKey) ?? {
        yearOfStudy: r.yearOfStudy,
        semester: r.semester,
        subjects: new Map(),
      };
      const subKey = r.subjectCode.toLowerCase();
      const sub = sem.subjects.get(subKey) ?? {
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        attempts: [],
      };
      sub.attempts.push({
        attemptNumber: r.attemptNumber,
        grade: r.grade,
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

    let totalCreditsEarned = 0;
    let totalBacklogs = 0;
    const semesterList = [...semesters.values()]
      .sort((a, b) => a.yearOfStudy - b.yearOfStudy || a.semester - b.semester)
      .map((sem) => {
        const subjects = [...sem.subjects.values()].map((sub) => {
          const attempts = [...sub.attempts].sort(
            (a, b) => a.attemptNumber - b.attemptNumber,
          );
          const latest = attempts[attempts.length - 1];
          return {
            subjectCode: sub.subjectCode,
            subjectName: sub.subjectName,
            grade: latest.grade,
            passed: latest.passed,
            credits: latest.credits,
            attemptCount: attempts.length,
            attempts,
          };
        });
        const cleared = subjects.filter((s) => s.passed);
        const backlogs = subjects.length - cleared.length;
        const creditsEarned = cleared.reduce((sum, s) => sum + s.credits, 0);
        totalCreditsEarned += creditsEarned;
        totalBacklogs += backlogs;
        return {
          yearOfStudy: sem.yearOfStudy,
          semester: sem.semester,
          // passed ONLY when every subject's latest attempt is a pass
          status: backlogs === 0 ? 'passed' : 'backlogs',
          totalSubjects: subjects.length,
          cleared: cleared.length,
          backlogs,
          creditsEarned,
          subjects: subjects.sort((a, b) =>
            a.subjectCode.localeCompare(b.subjectCode),
          ),
        };
      });

    return {
      rollNumber: roll,
      studentName:
        results.find((r) => r.studentName)?.studentName ?? null,
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
