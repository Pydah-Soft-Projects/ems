'use strict';

const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const { IsNull } = require('typeorm');
const { AppError } = require('../common/errors');
const { ExamStatus } = require('./schemas/exam.enums');

const FAIL_GRADES = new Set(['F', 'AB', 'ABSENT', 'FAIL', 'WH', 'MP']);

function normalizeResultFlag(raw, grade) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (['P', 'PASS', 'PASSED', 'Y', 'YES', 'TRUE'].includes(v)) return true;
  if (['F', 'FAIL', 'FAILED', 'N', 'NO', 'FALSE', 'AB', 'ABSENT'].includes(v)) return false;
  if (v !== '') return null;
  return !FAIL_GRADES.has(String(grade ?? '').trim().toUpperCase());
}

/** Utility to clean and extract key-value mappings from headers */
function normalizeHeaderName(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function extractTextFromPdfBuffer(buffer) {
  if (!buffer || buffer.length === 0) return '';
  const pdfParsePkg = require('pdf-parse');

  if (typeof pdfParsePkg === 'function') {
    const res = await pdfParsePkg(buffer);
    return typeof res === 'string' ? res : res?.text || '';
  }

  const PDFParseClass = pdfParsePkg.PDFParse || pdfParsePkg.default || pdfParsePkg;
  if (typeof PDFParseClass === 'function') {
    const parser = new PDFParseClass({ data: buffer });
    try {
      const parsed = await parser.getText();
      return typeof parsed === 'string' ? parsed : String(parsed?.text || '');
    } finally {
      await parser.destroy?.().catch?.(() => undefined);
    }
  }

  const raw = buffer.toString('utf8');
  if (raw.includes('PIN:') || raw.includes('JAWAHARLAL') || raw.includes('SubCode')) {
    return raw;
  }

  throw new Error('PDF parser engine could not be initialized');
}

class MarksService {
  constructor(
    studentMarkRepo,
    examRepo,
    revalNotificationRepo,
    applicationRepo,
    subjectResultRepo,
    resultUploadRepo,
    feeRecordRepo,
    sdms,
    internalMarksLockRepo = null,
    examSubjectRepo = null,
    emsAuditLogRepo = null,
    regInternalSettings = null,
    subjectMappingRepo = null,
    regulationRepo = null,
  ) {
    this.markRepo = studentMarkRepo;
    this.examRepo = examRepo;
    this.revalRepo = revalNotificationRepo;
    this.applicationRepo = applicationRepo;
    this.subjectResultRepo = subjectResultRepo;
    this.resultUploadRepo = resultUploadRepo;
    this.feeRecordRepo = feeRecordRepo;
    this.sdms = sdms;
    this.lockRepo = internalMarksLockRepo;
    this.examSubjectRepo = examSubjectRepo;
    this.auditRepo = emsAuditLogRepo;
    this.regInternalSettings = regInternalSettings;
    this.subjectMappingRepo = subjectMappingRepo;
    this.regulationRepo = regulationRepo;
  }

  /**
   * List all examination notifications (Regular/Supply) and Revaluation notifications
   * to select on the marks upload page.
   */
  async getNotifications(actor) {
    const [exams, revaluations] = await Promise.all([
      this.examRepo.find({
        relations: ['regulation', 'examSubjects', 'examSubjects.subject', 'scopes'],
        order: { createdAt: 'DESC' },
      }),
      this.revalRepo ? this.revalRepo.find({ order: { createdAt: 'DESC' } }) : [],
    ]);

    let filteredExams = exams;
    let filteredRevals = revaluations || [];

    if (actor && !actor.isSuperAdmin) {
      const collegeNames = Array.isArray(actor.collegeNames) ? actor.collegeNames.filter(Boolean) : [];
      if (collegeNames.length > 0) {
        filteredExams = filteredExams.filter((e) => {
          const colleges = new Set([e.college, ...(e.scopes || []).map((s) => s.college)].filter(Boolean));
          return colleges.size === 0 || collegeNames.some((c) => colleges.has(c));
        });
        filteredRevals = filteredRevals.filter((r) => {
          return !r.college || collegeNames.includes(r.college);
        });
      }
      const courseNames = Array.isArray(actor.courseNames) ? actor.courseNames.filter(Boolean) : [];
      if (courseNames.length > 0) {
        filteredExams = filteredExams.filter((e) => {
          const courses = new Set([e.course, ...(e.scopes || []).map((s) => s.course)].filter(Boolean));
          return courses.size === 0 || courseNames.some((c) => courses.has(c));
        });
      }
    }

    const examNotifications = filteredExams.map((e) => ({
      id: e.id,
      notificationType: 'EXAM',
      examCategory: e.examCategory ?? 'EXTERNAL',
      title: e.name,
      type: e.type, // REGULAR / SUPPLEMENTARY
      college: e.college || null,
      course: e.course,
      branch: e.branch,
      batch: e.batch,
      academicYear: e.batch,
      yearOfStudy: e.yearOfStudy,
      semester: e.semester,
      regulationId: e.regulationId,
      regulationCode: e.regulation?.code ?? null,
      regulationName: e.regulation?.name ?? null,
      status: e.status,
      examinationStartDate: e.examinationStartDate,
      examinationEndDate: e.examinationEndDate,
      subjectCount: e.examSubjects?.length ?? 0,
      createdAt: e.createdAt,
    }));

    const revalNotifications = (revaluations || []).map((r) => ({
      id: r.id,
      notificationType: 'REVALUATION',
      title: r.title,
      type: 'REVALUATION',
      regulationCode: r.regulationCode,
      academicYear: r.academicYear,
      semester: r.semester,
      status: r.status,
      subjectCount: r.scopes?.length ?? 0,
      createdAt: r.createdAt,
    }));

    return {
      exams: examNotifications,
      revaluations: revalNotifications,
    };
  }

  /**
   * Get enrolled students, branches, and paper subjects for a given notification ID
   */
  async getNotificationDetails(notificationType, id) {
    const isReval = String(notificationType).toUpperCase() === 'REVALUATION';
    if (isReval) {
      const reval = await this.revalRepo.findOne({ where: { id } });
      if (!reval) throw AppError.notFound('Revaluation notification not found');

      // Fetch students from mark records or reval scope
      const revalMarks = await this.markRepo.find({ where: { revaluationId: id } });
      const studentMapByRoll = new Map();
      const branchesSet = new Set();

      for (const m of revalMarks) {
        const roll = m.studentRollNumber?.trim();
        if (!roll) continue;
        const rKey = roll.toLowerCase();
        const b = m.studentBranch || 'GENERAL';
        branchesSet.add(b);

        if (!studentMapByRoll.has(rKey)) {
          studentMapByRoll.set(rKey, {
            rollNumber: roll,
            name: m.studentName || '',
            examType: 'REVALUATION',
            branch: b,
            section: null,
            feeStatus: 'paid',
          });
        }
      }

      return {
        notification: {
          id: reval.id,
          notificationType: 'REVALUATION',
          title: reval.title,
          regulationCode: reval.regulationCode,
          academicYear: reval.academicYear,
          semester: reval.semester,
        },
        branches: [...branchesSet],
        subjects: (reval.scopes || []).map((s) => ({
          code: s.subjectCode || `SUB-${s.id}`,
          name: s.subjectName || 'Revaluation Subject',
          type: 'THEORY',
        })),
        students: [...studentMapByRoll.values()],
      };
    }

    const exam = await this.examRepo.findOne({
      where: { id },
      relations: ['examSubjects', 'examSubjects.subject', 'scopes'],
    });
    if (!exam) throw AppError.notFound('Examination not found');
    if (!Array.isArray(exam.scopes) || exam.scopes.length === 0) {
      if (exam.branch || exam.course) {
        exam.scopes = [
          {
            examId: exam.id,
            college: exam.college || null,
            course: exam.course || 'B.Tech',
            branch: exam.branch || 'ALL',
            batch: exam.batch || null,
            yearOfStudy: exam.yearOfStudy || 1,
            semester: exam.semester || 1,
            section: null,
          },
        ];
      } else {
        exam.scopes = [];
      }
    }

    const subjectsMap = new Map();
    for (const es of exam.examSubjects || []) {
      const code = es.subject?.code?.trim() || `SUB-${es.subjectId}`;
      if (code && !subjectsMap.has(code.toLowerCase())) {
        const rawType = String(es.subject?.type || '').toLowerCase();
        const rawName = String(es.subject?.name || '').toLowerCase();
        const rawCode = String(code).toLowerCase();
        const isLab =
          ['lab', 'laboratory', 'practical', 'p'].includes(rawType) ||
          rawName.includes('lab') ||
          rawName.includes('practical') ||
          rawName.includes('workshop') ||
          rawName.includes('seminar') ||
          rawName.includes('project') ||
          rawCode.endsWith('l') ||
          rawCode.endsWith('p');

        subjectsMap.set(code.toLowerCase(), {
          id: es.subjectId,
          code,
          name: es.subject?.name || '',
          type: es.subject?.type || (isLab ? 'LAB' : 'THEORY'),
          internalMarks: Number(es.subject?.internalMarks ?? 30),
          externalMarks: Number(es.subject?.externalMarks ?? 70),
          totalMarks: Number(es.subject?.totalMarks ?? 100),
          examDate: es.examDate || exam.examinationStartDate || null,
          branch: es.branch || null,
          section: es.section || null,
        });
      }
    }
    const subjects = [...subjectsMap.values()];

    const applications = await this.applicationRepo.find({ where: { examId: id } });
    const feeRecords = this.feeRecordRepo ? await this.feeRecordRepo.find({ where: { examId: id } }) : [];
    const markRecords = await this.markRepo.find({ where: { examId: id } });

    const studentMapByRoll = new Map();
    const branchesSet = new Set();

    const addBranch = (b) => {
      if (!b) return;
      const parts = String(b).split(',').map((x) => x.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.toUpperCase() !== 'ALL') branchesSet.add(p);
      }
    };

    addBranch(exam.branch);
    if (exam.scopes) {
      for (const s of exam.scopes) {
        addBranch(s.branch);
      }
    }

    // 1. Applications
    for (const a of applications) {
      const roll = a.studentRollNumber?.trim();
      if (!roll) continue;
      const rKey = roll.toLowerCase();
      const b = a.studentBranch || (exam.branch && !exam.branch.includes(',') ? exam.branch : 'GENERAL');
      addBranch(b);

      studentMapByRoll.set(rKey, {
        rollNumber: roll,
        name: a.studentName || '',
        examType: a.examType,
        branch: b,
        section: a.studentSection || null,
        feeStatus: 'paid',
      });
    }

    // 2. Fee Records
    for (const f of feeRecords) {
      const roll = f.studentRollNumber?.trim();
      if (!roll) continue;
      const rKey = roll.toLowerCase();
      const existing = studentMapByRoll.get(rKey);
      const b = (exam.branch && !exam.branch.includes(',') ? exam.branch : 'GENERAL');
      addBranch(b);

      if (existing) {
        existing.feeStatus = f.status || existing.feeStatus;
      } else {
        studentMapByRoll.set(rKey, {
          rollNumber: roll,
          name: f.studentName || '',
          examType: f.examType || 'REGULAR',
          branch: b,
          section: null,
          feeStatus: f.status || 'pending',
        });
      }
    }

    // 3. Mark Records (Previously added/uploaded marks)
    for (const m of markRecords) {
      const roll = m.studentRollNumber?.trim();
      if (!roll) continue;
      const rKey = roll.toLowerCase();
      const existing = studentMapByRoll.get(rKey);
      const b = (exam.branch && !exam.branch.includes(',') ? exam.branch : 'GENERAL');
      addBranch(b);

      if (!existing) {
        studentMapByRoll.set(rKey, {
          rollNumber: roll,
          name: m.studentName || '',
          examType: 'REGULAR',
          branch: b,
          section: null,
          feeStatus: 'paid',
        });
      } else if (!existing.name && m.studentName) {
        existing.name = m.studentName;
      }
    }

    // 4. SDMS Students Database (Enrolled / Registered students matching this Exam scope)
    if (this.sdms) {
      try {
        const targetBranches = new Set();
        const targetBatches = new Set();
        const targetCourses = new Set();
        const targetColleges = new Set();

        const addBranchName = (b) => {
          if (!b) return;
          String(b)
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x && x.toUpperCase() !== 'ALL')
            .forEach((x) => targetBranches.add(x));
        };

        addBranchName(exam.branch);
        if (exam.batch) targetBatches.add(exam.batch.trim());
        if (exam.course) targetCourses.add(exam.course.trim());
        if (exam.college) targetColleges.add(exam.college.trim());

        if (Array.isArray(exam.scopes)) {
          for (const sc of exam.scopes) {
            addBranchName(sc.branch);
            if (sc.batch) targetBatches.add(sc.batch.trim());
            if (sc.course) targetCourses.add(sc.course.trim());
            if (sc.college) targetColleges.add(sc.college.trim());
          }
        }

        let sdmsStudents = [];

        if (this.sdms.studentRepo) {
          const qb = this.sdms.studentRepo
            .createQueryBuilder('s')
            .select([
              's.id',
              's.pinNo',
              's.admissionNumber',
              's.studentName',
              's.college',
              's.course',
              's.branch',
              's.batch',
              's.section',
              's.currentYear',
              's.currentSemester',
              's.studentStatus',
            ]);

          if (targetCourses.size > 0) {
            qb.andWhere('s.course IN (:...courses)', { courses: Array.from(targetCourses) });
          }
          if (targetBranches.size > 0) {
            qb.andWhere('s.branch IN (:...branches)', { branches: Array.from(targetBranches) });
          }
          if (targetBatches.size > 0) {
            qb.andWhere('s.batch IN (:...batches)', { batches: Array.from(targetBatches) });
          }
          if (targetColleges.size > 0) {
            qb.andWhere('s.college IN (:...colleges)', { colleges: Array.from(targetColleges) });
          }

          sdmsStudents = await qb.orderBy('s.pinNo', 'ASC').getMany();

          // Fallback if 0 found with specific batch (e.g. unassigned batch) but year/sem matches
          if (sdmsStudents.length === 0 && targetCourses.size > 0 && targetBranches.size > 0) {
            const fallbackQb = this.sdms.studentRepo
              .createQueryBuilder('s')
              .select([
                's.id',
                's.pinNo',
                's.admissionNumber',
                's.studentName',
                's.college',
                's.course',
                's.branch',
                's.batch',
                's.section',
                's.currentYear',
                's.currentSemester',
                's.studentStatus',
              ])
              .where('s.course IN (:...courses)', { courses: Array.from(targetCourses) })
              .andWhere('s.branch IN (:...branches)', { branches: Array.from(targetBranches) });

            if (targetColleges.size > 0) {
              fallbackQb.andWhere('s.college IN (:...colleges)', { colleges: Array.from(targetColleges) });
            }
            if (exam.yearOfStudy) {
              fallbackQb.andWhere('s.current_year = :year', { year: exam.yearOfStudy });
            }
            if (exam.semester) {
              fallbackQb.andWhere('s.current_semester = :sem', { sem: exam.semester });
            }

            const fallbackList = await fallbackQb.orderBy('s.pinNo', 'ASC').getMany();
            if (fallbackList.length > 0) {
              sdmsStudents = fallbackList;
            }
          }
        } else if (typeof this.sdms.listStudents === 'function') {
          if (exam.examCategory === 'INTERNAL') {
            for (const scope of exam.scopes) {
              const res = await this.sdms.listStudents({
                college: scope.college,
                course: scope.course,
                branch: scope.branch,
                batch: scope.batch,
                currentYear: scope.yearOfStudy,
                currentSemester: scope.semester,
                ...(scope.section ? { section: scope.section } : {}),
                limit: 500,
              });
              const items = res?.items || (Array.isArray(res) ? res : []);
              sdmsStudents.push(...items);
            }
          } else {
            for (const b of targetBranches) {
              const res = await this.sdms.listStudents({
                course: exam.course,
                branch: b,
                batch: exam.batch,
                limit: 500,
              });
              const items = res?.items || (Array.isArray(res) ? res : []);
              sdmsStudents.push(...items);
            }
          }
        }

        if (Array.isArray(sdmsStudents)) {
          for (const s of sdmsStudents) {
            const roll = (s.pinNo || s.admissionNumber || '').trim();
            if (!roll) continue;
            if (
              exam.examCategory === 'INTERNAL' &&
              !exam.scopes.some((scope) => {
                const matchesText = (studentValue, scopeValue) =>
                  !scopeValue ||
                  String(studentValue || '').trim().toLowerCase() === String(scopeValue).trim().toLowerCase();

                return (
                  matchesText(s.college, scope.college) &&
                  matchesText(s.course, scope.course) &&
                  matchesText(s.branch, scope.branch) &&
                  matchesText(s.batch, scope.batch) &&
                  Number(s.currentYear) === Number(scope.yearOfStudy) &&
                  Number(s.currentSemester) === Number(scope.semester) &&
                  matchesText(s.section, scope.section)
                );
              })
            ) {
              continue;
            }
            const rKey = roll.toLowerCase();
            const existing = studentMapByRoll.get(rKey);
            const b = s.branch || (targetBranches.size === 1 ? Array.from(targetBranches)[0] : exam.branch) || 'GENERAL';
            addBranch(b);

            if (!existing) {
              studentMapByRoll.set(rKey, {
                rollNumber: roll,
                name: s.studentName || '',
                examType: 'REGULAR',
                branch: b,
                section: s.section || null,
                feeStatus: 'unpaid',
              });
            } else {
              if (!existing.name && s.studentName) {
                existing.name = s.studentName;
              }
              if ((!existing.branch || existing.branch === 'GENERAL') && s.branch) {
                existing.branch = s.branch;
              }
              if (!existing.section && s.section) {
                existing.section = s.section;
              }
            }
          }
        }
      } catch (sdmsErr) {
        console.warn('SDMS student roster note:', sdmsErr.message);
      }
    }

    const students = [...studentMapByRoll.values()];

    return {
      notification: {
        id: exam.id,
        notificationType: 'EXAM',
        title: exam.name,
        type: exam.type,
        course: exam.course,
        branch: exam.branch,
        batch: exam.batch,
        semester: exam.semester,
        yearOfStudy: exam.yearOfStudy,
        examCategory: exam.examCategory || 'EXTERNAL',
      },
      branches: [...branchesSet].filter(Boolean),
      subjects,
      students,
    };
  }

  /**
   * Parse uploaded Excel (.xlsx, .xls, .csv) or PDF (.pdf) file buffer / text
   */
  async parseDocument({ buffer, fileName, mimeType, textContent, notificationId, notificationType, branch, subjectCode, activeTab, courseCategory }) {
    if (!buffer && !textContent) {
      throw AppError.badRequest('No file uploaded or file content is empty.');
    }

    let notificationDetails = null;
    if (notificationId) {
      notificationDetails = await this.getNotificationDetails(notificationType || 'EXAM', notificationId).catch(() => null);
    }

    const fileExt = (fileName || '').split('.').pop()?.toLowerCase() || '';

    let parsedResult;
    if (fileExt === 'pdf' || mimeType === 'application/pdf' || textContent) {
      parsedResult = await this.parsePdfContent(buffer, textContent, {
        notificationDetails,
        selectedSubjectCode: subjectCode,
        activeTab,
        branch,
      });
    } else {
      parsedResult = this.parseExcelContent(buffer);
    }

    // 0. Enforce student matching validation against selected examination notification
    if (notificationId && parsedResult && Array.isArray(parsedResult.rows) && parsedResult.rows.length > 0) {
      try {
        const details = await this.getNotificationDetails(notificationType || 'EXAM', notificationId);
        const enrolledStudents = details?.students || [];
        if (details?.notification?.examCategory === 'INTERNAL' && enrolledStudents.length === 0) {
          throw AppError.badRequest('No students were found in the selected internal exam scope.');
        }

        if (enrolledStudents.length > 0) {
          const enrolledMap = new Map();
          for (const s of enrolledStudents) {
            if (s.rollNumber) {
              const normRoll = String(s.rollNumber).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
              enrolledMap.set(normRoll, s);
            }
          }

          if (enrolledMap.size > 0) {
            const matchingRows = [];
            const nonMatchingRolls = [];

            for (const row of parsedResult.rows) {
              const rawRoll = String(row.rollNumber || row.roll || row.pinNo || '').trim();
              const normRoll = rawRoll.toLowerCase().replace(/[^a-z0-9]/g, '');

              if (normRoll && enrolledMap.has(normRoll)) {
                const enrolledStudent = enrolledMap.get(normRoll);
                if (!row.studentName && enrolledStudent.name) {
                  row.studentName = enrolledStudent.name;
                }
                if (!row.branch && enrolledStudent.branch) {
                  row.branch = enrolledStudent.branch;
                }
                matchingRows.push(row);
              } else if (rawRoll) {
                nonMatchingRolls.push(rawRoll);
              }
            }

            if (matchingRows.length === 0) {
              const samples = nonMatchingRolls.slice(0, 3).join(', ');
              throw AppError.badRequest(
                `The student PINs/Roll numbers in the uploaded document (${samples}${nonMatchingRolls.length > 3 ? '...' : ''}) do not match any enrolled students for the selected examination notification.`
              );
            }

            // Filter to keep matching rows for the selected examination notification
            parsedResult.rows = matchingRows;
            parsedResult.rowCount = matchingRows.length;
          }
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }

    // Apply active UI filters post-processing on parsed rows
    if (parsedResult && Array.isArray(parsedResult.rows)) {
      let rows = parsedResult.rows;

      // 1. Filter or populate subjectCode
      if (subjectCode && subjectCode !== 'ALL') {
        const targetSubNorm = String(subjectCode).toUpperCase().replace(/[^A-Z0-9]/g, '');

        rows = rows.filter((row) => {
          if (!row.subjectCode || String(row.subjectCode).trim() === '') {
            row.subjectCode = subjectCode;
            return true;
          }
          const rowSubNorm = String(row.subjectCode).toUpperCase().replace(/[^A-Z0-9]/g, '');
          return rowSubNorm === targetSubNorm;
        });

        // Ensure subjectCode is assigned to all remaining rows
        rows.forEach((row) => {
          if (!row.subjectCode) row.subjectCode = subjectCode;
        });
      }

      // 1.b Filter and validate by courseCategory (THEORY vs LAB)
      if (courseCategory && notificationDetails?.subjects?.length) {
        const isTargetLab = String(courseCategory).toUpperCase() === 'LAB';
        const subMap = new Map();
        for (const s of notificationDetails.subjects) {
          const rawType = String(s.type || '').toLowerCase();
          const rawName = String(s.name || '').toLowerCase();
          const rawCode = String(s.code || '').toLowerCase();
          const isLab =
            ['lab', 'laboratory', 'practical', 'p'].includes(rawType) ||
            rawType.includes('lab') ||
            rawType.includes('practical') ||
            rawName.includes('lab') ||
            rawName.includes('practical') ||
            rawName.includes('workshop') ||
            rawName.includes('seminar') ||
            rawName.includes('project') ||
            rawName.includes('viva') ||
            rawCode.endsWith('l') ||
            rawCode.endsWith('p');
          subMap.set(rawCode.replace(/[^a-z0-9]/g, ''), isLab);
        }

        const validRows = [];
        const mismatchedSubjects = new Set();
        for (const row of rows) {
          const rowSub = String(row.subjectCode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (rowSub && subMap.has(rowSub)) {
            const isSubLab = subMap.get(rowSub);
            if (isSubLab === isTargetLab) {
              validRows.push(row);
            } else {
              mismatchedSubjects.add(row.subjectCode);
            }
          } else {
            validRows.push(row);
          }
        }

        if (mismatchedSubjects.size > 0 && validRows.length === 0) {
          throw AppError.badRequest(
            `The uploaded document only contains ${isTargetLab ? 'Theory' : 'Lab'} subject(s) (${[...mismatchedSubjects].join(', ')}), but current mode is ${isTargetLab ? 'Labs & Practical' : 'Theory Subjects'}. Please switch to the appropriate course type tab.`
          );
        } else if (validRows.length > 0) {
          rows = validRows;
        }
      }

      // 2. Filter or populate branch if specified
      if (branch && branch !== 'ALL') {
        const targetBranchNorm = String(branch).toUpperCase().trim();

        rows = rows.filter((row) => {
          if (row.branch) {
            return String(row.branch).toUpperCase().trim() === targetBranchNorm;
          }
          row.branch = branch;
          return true;
        });
      }

      // 3. Format marks fields according to activeTab if appropriate
      if (activeTab) {
        rows.forEach((row) => {
          const m = row.marks !== undefined && row.marks !== '' ? row.marks : null;
          if (m !== null) {
            if (activeTab === 'INTERNAL' && (row.internalMarks === undefined || row.internalMarks === '')) {
              row.internalMarks = m;
            } else if (activeTab === 'EXTERNAL' && (row.externalMarks === undefined || row.externalMarks === '')) {
              row.externalMarks = m;
            } else if (activeTab === 'RESULT' && (row.totalMarks === undefined || row.totalMarks === '')) {
              row.totalMarks = m;
            } else if (activeTab === 'REVALUATION' && (row.updatedMarks === undefined || row.updatedMarks === '')) {
              row.updatedMarks = m;
            }
          }
        });
      }

      parsedResult.rows = rows;
      parsedResult.rowCount = rows.length;
    }

    return parsedResult;
  }

  /** Parse Excel spreadsheets */
  parseExcelContent(buffer) {
    try {
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw AppError.badRequest('Excel file is empty');
      }
      const sheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        return { success: true, rows: [], headers: [], rowCount: 0 };
      }

      const headers = Object.keys(rawRows[0]);
      const rows = rawRows.map((row) => {
        const item = {};
        for (const key of headers) {
          const normKey = normalizeHeaderName(key);
          const val = row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';

          // Smart Auto-Mapping for 2-column & multi-column layouts
          if (['rollnumber', 'rollno', 'pin', 'pinno', 'htno', 'hallticket', 'studentid', 'studentrollnumber', 'hallticketnumber'].includes(normKey)) {
            item.rollNumber = val;
          } else if (['studentname', 'name', 'candidate', 'student'].includes(normKey)) {
            item.studentName = val;
          } else if (['subjectcode', 'subcode', 'code', 'papercode', 'subject'].includes(normKey)) {
            item.subjectCode = val;
          } else if (['subjectname', 'subname', 'papername'].includes(normKey)) {
            item.subjectName = val;
          } else if (['internalmarks', 'internal', 'midmarks', 'intmarks', 'mid1', 'mid2', 'cie', 'marks', 'mark', 'score', 'marksabsent'].includes(normKey)) {
            item.internalMarks = val;
            item.externalMarks = val;
            item.marks = val;
            if (['AB', 'ABSENT'].includes(val.toUpperCase())) {
              item.isAbsent = true;
            }
          } else if (['maxinternalmarks', 'maxinternal', 'maxmid', 'maxint'].includes(normKey)) {
            item.maxInternalMarks = val;
          } else if (['externalmarks', 'external', 'extmarks', 'see', 'theorymarks'].includes(normKey)) {
            item.externalMarks = val;
            item.marks = val;
            if (['AB', 'ABSENT'].includes(val.toUpperCase())) {
              item.isAbsent = true;
            }
          } else if (['maxexternalmarks', 'maxexternal', 'maxext', 'maxsee'].includes(normKey)) {
            item.maxExternalMarks = val;
          } else if (['totalmarks', 'total', 'totmarks', 'obtainedmarks'].includes(normKey)) {
            item.totalMarks = val;
          } else if (['maxtotalmarks', 'maxtotal', 'maxmarks'].includes(normKey)) {
            item.maxTotalMarks = val;
          } else if (['grade', 'lettergrade'].includes(normKey)) {
            item.grade = val;
          } else if (['gradepoints', 'gp', 'points'].includes(normKey)) {
            item.gradePoints = val;
          } else if (['credits', 'credit'].includes(normKey)) {
            item.credits = val;
          } else if (['result', 'passed', 'status', 'passfail', 'pf'].includes(normKey)) {
            item.result = val;
          } else if (['absent', 'isabsent', 'ab'].includes(normKey)) {
            item.isAbsent = val === '1' || val.toLowerCase() === 'true' || val.toLowerCase() === 'ab' || val.toLowerCase() === 'yes';
          } else if (['originalgrade', 'origgrade', 'oldgrade'].includes(normKey)) {
            item.originalGrade = val;
          } else if (['updatedgrade', 'revisedgrade', 'newgrade'].includes(normKey)) {
            item.updatedGrade = val;
          } else if (['originalmarks', 'origmarks', 'oldmarks'].includes(normKey)) {
            item.originalMarks = val;
          } else if (['updatedmarks', 'revisedmarks', 'newmarks'].includes(normKey)) {
            item.updatedMarks = val;
          } else if (['remarks', 'comment', 'note'].includes(normKey)) {
            item.remarks = val;
          } else {
            // Keep original key as fallback
            item[key] = val;
          }
        }
        return item;
      });

      return {
        success: true,
        headers,
        rows,
        rowCount: rows.length,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.badRequest(`Failed to parse Excel file: ${err.message}`);
    }
  }

  /** Parse PDF documents (JNTUK & standard result sheets) containing student tabular marks */
  async parsePdfContent(buffer, providedText, options = {}) {
    let text = providedText || '';
    if (!text && buffer) {
      try {
        text = await extractTextFromPdfBuffer(buffer);
      } catch (err) {
        throw AppError.badRequest(`Failed to parse PDF document: ${err.message}`);
      }
    }

    if (!text || !text.trim()) {
      return { success: true, rows: [], rowCount: 0, textSample: '' };
    }

    const enrolledStudents = options.notificationDetails?.students || [];
    const paperSubjects = options.notificationDetails?.subjects || [];
    const targetSubjectCode = options.selectedSubjectCode && options.selectedSubjectCode !== 'ALL' ? options.selectedSubjectCode : '';

    const enrolledRollMap = new Map();
    for (const s of enrolledStudents) {
      if (s.rollNumber) {
        const normR = String(s.rollNumber).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        enrolledRollMap.set(normR, s);
      }
    }

    const paperSubjectCodes = paperSubjects.map((s) => String(s.code || '').toUpperCase().trim()).filter(Boolean);

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [];
    let currentRoll = '';
    let currentName = '';

    // 1. PIN / Roll Number Header regex (e.g. "PIN: 112233", "PIN: 11234", "HTNO: 236T1A0401", "1 . 236T1A0402")
    const pinHeaderRegex = /(?:PIN|HTNO|ROLL|HALLTICKET|STUDENT|REGNO)[\:\s\-]+([A-Z0-9]{3,20})/i;
    const studentHeaderPattern = /^\s*(?:\d+\s*[\.\-\)]\s*)?([0-9]{2}[A-Z0-9]{4,12})\b/i;

    // 2. Exact tabular row regex for the provided PDF format:
    // e.g. "1  TS01  TESTING SUB 1  F  0  0.0  F"
    // e.g. "2  TS02  TESTING SUB 2  E  5  3.0  P"
    const pinResultRowRegex = /^\s*(?:(\d+)\s+)?([A-Z0-9]{3,15})\s+(.+?)\s+([O|S|A\+|A|B\+|B|C|D|E|F|P|AB|ABSENT]+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+([P|F|PASS|FAIL|AB]+)\s*$/i;

    // 3. RegEx pattern for JNTUK style subject data row (Int, Ext, Tot, Result, Grade, Credits)
    const jntuSubjectRegex = /^\s*(?:(\d+)\s+)?([A-Z0-9]{4,12})\s+(.+?)\s+([\d]{1,3}|AB|\-)(?:\s+([\d]{1,3}|AB|\-))?(?:\s+([\d]{1,3}|AB|\-))?\s+([PF])\s+([A-Z\+\-]+|AB)\s+(\d+(?:\.\d+)?)\s*$/i;

    // Fallback general pattern for Roll Numbers, Subject Codes, and Marks/Grades
    const rollPattern = /\b([0-9]{2,5}[A-Z0-9]{3,8}|[A-Z0-9]{10,12})\b/i;
    const subjectCodePattern = /\b([A-Z0-9]{3,8}-[A-Z0-9]{1,5}|[A-Z]{2,4}[0-9]{3,5}|[0-9]{2}[A-Z]{2,4}[0-9]{2,4})\b/i;
    const gradePattern = /\b(O|A\+|A|B\+|B|C|D|E|F|AB|ABSENT|PASS|FAIL|P)\b/i;

    const computeGradePoints = (grade) => {
      const g = String(grade || '').toUpperCase().trim();
      if (['O', 'S'].includes(g)) return 10.0;
      if (['A+'].includes(g)) return 9.0;
      if (['A'].includes(g)) return 8.0;
      if (['B+'].includes(g)) return 7.0;
      if (['B'].includes(g)) return 6.0;
      if (['C'].includes(g)) return 6.0;
      if (['D', 'E', 'P'].includes(g)) return 5.0;
      return 0.0;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // A. Check for split PIN header (e.g. "PIN:" on line i, "112233" on line i+1)
      if (line.toUpperCase() === 'PIN:' || line.toUpperCase() === 'PIN' || line.toUpperCase() === 'HTNO:' || line.toUpperCase() === 'ROLL NO:') {
        if (lines[i + 1] && /^[A-Z0-9]{3,20}$/i.test(lines[i + 1])) {
          currentRoll = lines[i + 1].trim().toUpperCase();
          const normR = currentRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (enrolledRollMap.has(normR)) {
            currentName = enrolledRollMap.get(normR).name || '';
          }
          i++;
          continue;
        }
      }

      // B. Check for PIN Header (e.g. "PIN: 112233" or "PIN: 11234")
      const pinMatch = line.match(pinHeaderRegex);
      if (pinMatch) {
        currentRoll = pinMatch[1].toUpperCase();
        const normR = currentRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (enrolledRollMap.has(normR)) {
          currentName = enrolledRollMap.get(normR).name || '';
        }
        continue;
      }

      // C. Check if line is a Student Header (e.g. "1 . 236T1A0402")
      const headerMatch = line.match(studentHeaderPattern);
      if (headerMatch && !line.includes('UNIVERSITY') && !line.includes('COLLEGE') && !line.includes('SubCode')) {
        currentRoll = headerMatch[1].toUpperCase();
        const normR = currentRoll.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (enrolledRollMap.has(normR)) {
          currentName = enrolledRollMap.get(normR).name || '';
        }
        continue;
      }

      // D. Check for Tabular PIN Result Row (e.g. "1  TS01  TESTING SUB 1  F  0  0.0  F")
      const pinResultMatch = line.match(pinResultRowRegex);
      if (pinResultMatch && currentRoll) {
        const subCode = pinResultMatch[2].toUpperCase();
        const subName = pinResultMatch[3].trim();
        const gradeVal = pinResultMatch[4].toUpperCase();
        const gpVal = parseFloat(pinResultMatch[5]) || computeGradePoints(gradeVal);
        const creditsVal = parseFloat(pinResultMatch[6]) || 0;
        const resVal = pinResultMatch[7].toUpperCase();
        const isAb = gradeVal === 'AB' || resVal === 'AB';

        rows.push({
          rollNumber: currentRoll,
          studentName: currentName,
          subjectCode: subCode,
          subjectName: subName,
          grade: gradeVal,
          gradePoints: gpVal,
          credits: creditsVal,
          result: resVal,
          passed: resVal === 'P' || resVal === 'PASS' || (resVal !== 'F' && resVal !== 'FAIL' && gradeVal !== 'F' && gradeVal !== 'AB'),
          isAbsent: isAb,
          rawLine: line,
        });
        continue;
      }

      // E. Check if line matches JNTUK subject row layout (Int, Ext, Tot, Result, Grade, Credits)
      const jntuMatch = line.match(jntuSubjectRegex);
      if (jntuMatch && currentRoll) {
        const subCode = jntuMatch[2].toUpperCase();
        const subName = jntuMatch[3].trim();
        const m1 = jntuMatch[4].toUpperCase();
        const m2 = jntuMatch[5] ? jntuMatch[5].toUpperCase() : '';
        const m3 = jntuMatch[6] ? jntuMatch[6].toUpperCase() : '';
        const resVal = jntuMatch[7].toUpperCase();
        const gradeVal = jntuMatch[8].toUpperCase();
        const creditsVal = parseFloat(jntuMatch[9]) || 0;

        let intMarks = '';
        let extMarks = '';
        let totMarks = '';
        const isAb = m1 === 'AB' || gradeVal === 'AB';

        if (m3) {
          intMarks = m1;
          extMarks = m2;
          totMarks = m3;
        } else {
          intMarks = isAb ? '0' : m1;
          totMarks = isAb ? '0' : m1;
        }

        rows.push({
          rollNumber: currentRoll,
          studentName: currentName,
          subjectCode: subCode,
          subjectName: subName,
          internalMarks: intMarks,
          externalMarks: extMarks,
          totalMarks: totMarks,
          marks: intMarks || extMarks,
          result: resVal,
          grade: gradeVal,
          credits: creditsVal,
          gradePoints: computeGradePoints(gradeVal),
          isAbsent: isAb,
          rawLine: line,
        });
        continue;
      }

      // F. Check if line contains an enrolled student PIN or general Roll Number
      let lineRoll = '';
      if (enrolledRollMap.size > 0) {
        for (const [normR, student] of enrolledRollMap.entries()) {
          const rawPattern = new RegExp(`\\b${student.rollNumber}\\b`, 'i');
          if (rawPattern.test(line)) {
            lineRoll = student.rollNumber;
            currentRoll = lineRoll;
            currentName = student.name || '';
            break;
          }
        }
      }

      if (!lineRoll) {
        const rollMatch = line.match(rollPattern);
        if (rollMatch && !line.includes('UNIVERSITY') && !line.includes('COLLEGE') && !line.includes('SubCode')) {
          currentRoll = rollMatch[1].toUpperCase();
          lineRoll = currentRoll;
        }
      }

      // G. Check if line contains a Subject Code
      const subMatch = line.match(subjectCodePattern);
      let foundSubCode = subMatch ? subMatch[1].toUpperCase() : '';

      if (!foundSubCode && paperSubjectCodes.length > 0) {
        for (const sc of paperSubjectCodes) {
          if (new RegExp(`\\b${sc}\\b`, 'i').test(line)) {
            foundSubCode = sc;
            break;
          }
        }
      }

      const activeRoll = lineRoll || currentRoll;

      if (activeRoll) {
        const tokens = line.split(/\s+/);
        const numbers = [];
        let gradeVal = '';
        let isAb = false;

        tokens.forEach((t) => {
          const upper = t.toUpperCase().trim();
          if (upper === 'AB' || upper === 'ABSENT') {
            isAb = true;
          }
          const num = parseFloat(t);
          if (!isNaN(num) && num >= 0 && num <= 100) {
            numbers.push(num);
          }
          const gMatch = t.match(gradePattern);
          if (gMatch && !gradeVal && !['P', 'F'].includes(gMatch[1].toUpperCase())) {
            gradeVal = gMatch[1].toUpperCase();
          }
        });

        if (numbers.length > 0 || isAb || gradeVal) {
          let intMarks = '';
          let extMarks = '';
          let totMarks = '';

          if (isAb) {
            intMarks = 'AB';
            extMarks = 'AB';
            totMarks = 'AB';
          } else if (numbers.length >= 3) {
            intMarks = String(numbers[0]);
            extMarks = String(numbers[1]);
            totMarks = String(numbers[2]);
          } else if (numbers.length === 2) {
            intMarks = String(numbers[0]);
            extMarks = String(numbers[1]);
          } else if (numbers.length === 1) {
            totMarks = String(numbers[0]);
            intMarks = String(numbers[0]);
            extMarks = String(numbers[0]);
          }

          const finalSubCode = foundSubCode || targetSubjectCode || (paperSubjectCodes.length > 0 ? paperSubjectCodes[0] : '');

          rows.push({
            rollNumber: activeRoll,
            studentName: currentName,
            subjectCode: finalSubCode,
            internalMarks: intMarks,
            externalMarks: extMarks,
            totalMarks: totMarks,
            marks: isAb ? 'AB' : (intMarks || extMarks || totMarks),
            grade: gradeVal,
            gradePoints: computeGradePoints(gradeVal),
            isAbsent: isAb,
            rawLine: line,
          });
        }
      }
    }

    return {
      success: true,
      rows,
      rowCount: rows.length,
      textSample: lines.slice(0, 15).join('\n'),
    };
  }

  /**
   * Upload and persist marks into DB according to tab category
   * Category: 'INTERNAL' | 'EXTERNAL' | 'RESULT' | 'REVALUATION'
   */
  async uploadMarks(category, notificationId, dto, uploadedBy) {
    const cat = String(category || '').toUpperCase();
    if (!['INTERNAL', 'EXTERNAL', 'RESULT', 'REVALUATION'].includes(cat)) {
      throw AppError.badRequest('Invalid marks upload category');
    }

    const rows = Array.isArray(dto?.rows) ? dto.rows : [];
    if (rows.length === 0) {
      throw AppError.badRequest('No mark records to process');
    }
    if (rows.length > 5000) {
      throw AppError.badRequest('Maximum 5000 records allowed per upload');
    }

    let exam = null;
    let reval = null;

    if (cat === 'REVALUATION') {
      reval = await this.revalRepo.findOne({ where: { id: notificationId } });
      if (!reval) throw AppError.notFound('Revaluation notification not found');
    } else {
      exam = await this.examRepo.findOne({
        where: { id: notificationId },
        relations: ['examSubjects', 'examSubjects.subject', 'regulation'],
      });
      if (!exam) throw AppError.notFound('Examination notification not found');
    }

    // Load regulation internal calculation profile if applicable
    let regSetting = null;
    if (exam && this.regInternalSettings) {
      try {
        regSetting = await this.regInternalSettings.getSettingForRegulation(
          exam.regulationId || exam.regulation?.code || null,
        );
      } catch (regErr) {
        console.warn('Could not load regulation settings for upload validation:', regErr.message);
      }
    }
    const regMaxInternal = regSetting?.maxInternalMarks ?? 30;
    const regMinPassInternal = regSetting?.minPassMarks ?? 16;

    // Load available subjects for subject code validation
    const subjectMap = new Map();
    if (exam && exam.examSubjects) {
      for (const es of exam.examSubjects) {
        const code = es.subject?.code?.trim();
        if (code) {
          subjectMap.set(code.toLowerCase(), {
            code,
            name: es.subject?.name ?? '',
            type: es.subject?.type ?? '',
            internalMarks: es.subject?.internalMarks ?? 30,
            externalMarks: es.subject?.externalMarks ?? 70,
            totalMarks: es.subject?.totalMarks ?? 100,
          });
        }
      }
    }

    // Load enrolled student applications if exam
    const appsByRoll = new Map();
    if (notificationId) {
      try {
        const details = await this.getNotificationDetails(cat === 'REVALUATION' ? 'REVALUATION' : 'EXAM', notificationId);
        for (const s of details.students || []) {
          if (s.rollNumber) {
            appsByRoll.set(s.rollNumber.trim().toLowerCase(), {
              roll: s.rollNumber,
              name: s.name,
              examType: s.examType || 'REGULAR',
            });
          }
        }
      } catch (e) {
        // Fallback to direct application query if needed
      }
    }

    // Load lock overrides for internal marks validation
    const lockMap = new Map();
    if (cat === 'INTERNAL' && exam && this.lockRepo) {
      try {
        const locks = await this.lockRepo.find({ where: { examId: notificationId } });
        for (const l of locks) {
          if (l.subjectCode) lockMap.set(l.subjectCode.toLowerCase(), l);
        }
      } catch (err) {
        console.warn('Could not load marks locks:', err.message);
      }
    }

    const errors = [];
    const normalized = [];
    const seenKeys = new Set();

    rows.forEach((row, idx) => {
      const lineNum = idx + 2;
      const roll = String(row.rollNumber || row.roll || row.pinNo || '').trim();
      let code = String(row.subjectCode || row.code || '').trim();

      if (!code && (cat === 'INTERNAL' || cat === 'EXTERNAL')) {
        if (exam && exam.examSubjects && exam.examSubjects.length > 0) {
          code = exam.examSubjects[0].subject?.code || 'MAIN';
        } else {
          code = 'MAIN';
        }
      }

      if (cat === 'INTERNAL' && exam) {
        const es = exam.examSubjects?.find((s) => s.subject?.code?.toLowerCase() === code.toLowerCase());
        const subExamDate = es?.examDate || exam.examinationStartDate || null;
        const subOverride = lockMap.get(code.toLowerCase()) || lockMap.get('all') || null;
        const deadlineInfo = this.calculateSubjectDeadline(subExamDate, subOverride);
        if (deadlineInfo.isLocked) {
          errors.push({
            row: lineNum,
            message: `Internal marks entry for subject "${code}" is locked (${deadlineInfo.lockReason}, deadline: ${deadlineInfo.deadlineFormatted}). An authorized unlock is required.`,
          });
          return;
        }
      }

      if (!roll) {
        errors.push({ row: lineNum, message: 'Student Roll Number / PIN is required' });
        return;
      }
      if (!code) {
        errors.push({ row: lineNum, message: `Subject code is required for student ${roll}` });
        return;
      }

      const dupKey = `${roll.toLowerCase()}|${code.toLowerCase()}`;
      if (seenKeys.has(dupKey)) {
        errors.push({ row: lineNum, message: `Duplicate entry for ${roll} / ${code} in this upload` });
        return;
      }
      seenKeys.add(dupKey);

      const knownSub = subjectMap.get(code.toLowerCase());
      const studentApp = appsByRoll.get(roll.toLowerCase());

      if (dto?.courseCategory && knownSub) {
        const isTargetLab = String(dto.courseCategory).toUpperCase() === 'LAB';
        const rawType = String(knownSub.type || '').toLowerCase();
        const rawName = String(knownSub.name || '').toLowerCase();
        const rawCode = String(knownSub.code || '').toLowerCase();
        const isSubLab =
          ['lab', 'laboratory', 'practical', 'p'].includes(rawType) ||
          rawType.includes('lab') ||
          rawType.includes('practical') ||
          rawName.includes('lab') ||
          rawName.includes('practical') ||
          rawName.includes('workshop') ||
          rawName.includes('seminar') ||
          rawName.includes('project') ||
          rawName.includes('viva') ||
          rawCode.endsWith('l') ||
          rawCode.endsWith('p');
        if (isSubLab !== isTargetLab) {
          errors.push({
            row: lineNum,
            message: `Subject ${code} is a ${isSubLab ? 'Lab' : 'Theory'} subject and cannot be uploaded under ${isTargetLab ? 'Labs & Practical' : 'Theory Subjects'}.`,
          });
          return;
        }
      }

      const normRow = {
        category: cat,
        examId: exam ? exam.id : null,
        revaluationId: reval ? reval.id : null,
        studentRollNumber: roll,
        studentName: String(row.studentName || studentApp?.name || '').trim() || null,
        subjectCode: knownSub ? knownSub.code : code,
        subjectName: String(row.subjectName || knownSub?.name || '').trim() || null,
        uploadedBy: uploadedBy || null,
      };

      if (cat === 'INTERNAL') {
        const rawVal = row.internalMarks !== undefined ? row.internalMarks : row.marks;
        const isAb = row.isAbsent || String(rawVal).toUpperCase() === 'AB' || String(rawVal).toUpperCase() === 'ABSENT';
        normRow.isAbsent = !!isAb;

        if (!isAb) {
          const intMarks = parseFloat(rawVal);
          if (isNaN(intMarks) || intMarks < 0) {
            errors.push({ row: lineNum, message: `Invalid internal marks "${rawVal}" for ${roll}` });
            return;
          }
          const maxInt = parseFloat(row.maxInternalMarks || knownSub?.internalMarks || regMaxInternal);
          if (intMarks > maxInt) {
            errors.push({ row: lineNum, message: `Internal marks (${intMarks}) exceed max marks (${maxInt}) for ${roll}` });
            return;
          }
          normRow.internalMarks = intMarks;
          normRow.maxInternalMarks = maxInt;
          normRow.status = intMarks >= regMinPassInternal ? 'PASSED' : 'FAILED';
        } else {
          normRow.internalMarks = 0;
          normRow.maxInternalMarks = parseFloat(row.maxInternalMarks || knownSub?.internalMarks || regMaxInternal);
          normRow.status = 'ABSENT';
        }
        normRow.remarks = row.remarks || null;
      } else if (cat === 'EXTERNAL') {
        const rawVal = row.externalMarks !== undefined ? row.externalMarks : row.marks;
        const isAb = row.isAbsent || String(rawVal).toUpperCase() === 'AB' || String(rawVal).toUpperCase() === 'ABSENT';
        normRow.isAbsent = !!isAb;

        const defaultExtMax = knownSub?.externalMarks || (knownSub?.totalMarks ? knownSub.totalMarks - regMaxInternal : (100 - regMaxInternal));
        if (!isAb) {
          const extMarks = parseFloat(rawVal);
          if (isNaN(extMarks) || extMarks < 0) {
            errors.push({ row: lineNum, message: `Invalid external marks "${rawVal}" for ${roll}` });
            return;
          }
          const maxExt = parseFloat(row.maxExternalMarks || defaultExtMax);
          if (extMarks > maxExt) {
            errors.push({ row: lineNum, message: `External marks (${extMarks}) exceed max marks (${maxExt}) for ${roll}` });
            return;
          }
          normRow.externalMarks = extMarks;
          normRow.maxExternalMarks = maxExt;
        } else {
          normRow.externalMarks = 0;
          normRow.maxExternalMarks = parseFloat(row.maxExternalMarks || defaultExtMax);
        }
        normRow.remarks = row.remarks || null;
      } else if (cat === 'RESULT') {
        const grade = String(row.grade || '').trim().toUpperCase();
        if (!grade) {
          errors.push({ row: lineNum, message: `Grade is required for ${roll} / ${code}` });
          return;
        }
        const passed = normalizeResultFlag(row.result || row.passed, grade);
        if (passed === null) {
          errors.push({ row: lineNum, message: `Result flag must be Pass (P) or Fail (F) for ${roll} / ${code}` });
          return;
        }

        normRow.grade = grade;
        normRow.passed = passed;
        normRow.gradePoints = row.gradePoints !== undefined && row.gradePoints !== '' ? parseFloat(row.gradePoints) : null;
        normRow.credits = row.credits !== undefined && row.credits !== '' ? parseFloat(row.credits) : 0;
        normRow.internalMarks = row.internalMarks !== undefined && row.internalMarks !== '' ? parseFloat(row.internalMarks) : null;
        normRow.externalMarks = row.externalMarks !== undefined && row.externalMarks !== '' ? parseFloat(row.externalMarks) : null;
        normRow.totalMarks = row.totalMarks !== undefined && row.totalMarks !== '' ? parseFloat(row.totalMarks) : null;
        normRow.status = passed ? 'PASSED' : 'FAILED';
      } else if (cat === 'REVALUATION') {
        const updatedGrade = String(row.updatedGrade || row.grade || '').trim().toUpperCase();
        normRow.originalGrade = String(row.originalGrade || '').trim().toUpperCase() || null;
        normRow.updatedGrade = updatedGrade || null;
        normRow.originalMarks = row.originalMarks !== undefined && row.originalMarks !== '' ? parseFloat(row.originalMarks) : null;
        normRow.updatedMarks = row.updatedMarks !== undefined && row.updatedMarks !== '' ? parseFloat(row.updatedMarks) : null;
        normRow.status = String(row.status || (normRow.originalGrade !== normRow.updatedGrade ? 'GRADE_CHANGED' : 'NO_CHANGE')).toUpperCase();
        normRow.passed = normalizeResultFlag(row.result || row.passed, updatedGrade) ?? true;
        normRow.remarks = row.remarks || null;
      }

      normalized.push(normRow);
    });

    if (errors.length > 0) {
      return { success: false, errors, totalRows: rows.length, validRows: normalized.length };
    }

    // Save records to DB
    let inserted = 0;
    let updated = 0;

    const existingRecords = await this.markRepo.find({
      where: cat === 'REVALUATION' ? { category: cat, revaluationId: notificationId } : { category: cat, examId: notificationId },
    });

    const existingMap = new Map(
      existingRecords.map((r) => [`${r.studentRollNumber.toLowerCase()}|${r.subjectCode.toLowerCase()}`, r]),
    );

    const toSave = normalized.map((item) => {
      const key = `${item.studentRollNumber.toLowerCase()}|${item.subjectCode.toLowerCase()}`;
      const prior = existingMap.get(key);
      if (prior) {
        updated++;
        return this.markRepo.merge(prior, item);
      }
      inserted++;
      return this.markRepo.create(item);
    });

    await this.markRepo.save(toSave, { chunk: 200 });

    // Sync with SubjectResult if RESULT or REVALUATION upload for exam
    if ((cat === 'RESULT' || cat === 'REVALUATION') && exam) {
      try {
        const resultsDto = {
          fileName: dto.fileName || `${cat}_upload.xlsx`,
          rows: normalized.map((n) => ({
            rollNumber: n.studentRollNumber,
            subjectCode: n.subjectCode,
            subjectName: n.subjectName,
            grade: n.updatedGrade || n.grade,
            gradePoints: n.gradePoints,
            credits: n.credits,
            result: n.passed ? 'P' : 'F',
          })),
        };
        // Sync results
        await this.syncToSubjectResults(exam.id, resultsDto, uploadedBy);
      } catch (syncErr) {
        console.warn('SubjectResult sync note:', syncErr.message);
      }
    }

    return {
      success: true,
      category: cat,
      notificationId,
      inserted,
      updated,
      totalRows: normalized.length,
      passCount: normalized.filter((n) => n.passed).length,
      failCount: normalized.filter((n) => n.passed === false).length,
    };
  }

  /** Sync helper for student results */
  async syncToSubjectResults(examId, resultsDto, uploadedBy) {
    if (!this.subjectResultRepo || !this.resultUploadRepo) return;
    const exam = await this.examRepo.findOne({ where: { id: examId } });
    if (!exam) return;

    const upload = await this.resultUploadRepo.save(
      this.resultUploadRepo.create({
        examId,
        fileName: resultsDto.fileName,
        uploadedBy: uploadedBy || 'Marks Upload Desk',
        rowCount: resultsDto.rows.length,
        studentCount: new Set(resultsDto.rows.map((r) => r.rollNumber)).size,
      }),
    );

    const existing = await this.subjectResultRepo.find({ where: { examId } });
    const existingMap = new Map(
      existing.map((r) => [`${r.studentRollNumber.toLowerCase()}|${r.subjectCode.toLowerCase()}`, r]),
    );

    const toSave = resultsDto.rows.map((r) => {
      const key = `${r.rollNumber.toLowerCase()}|${r.subjectCode.toLowerCase()}`;
      const prior = existingMap.get(key);
      const passed = normalizeResultFlag(r.result, r.grade);

      if (prior) {
        return this.subjectResultRepo.merge(prior, {
          uploadId: upload.id,
          grade: r.grade,
          gradePoints: r.gradePoints ?? prior.gradePoints,
          passed,
          credits: r.credits ?? prior.credits,
        });
      }
      return this.subjectResultRepo.create({
        uploadId: upload.id,
        examId,
        studentRollNumber: r.rollNumber,
        studentName: r.studentName ?? null,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName || r.subjectCode,
        grade: r.grade,
        gradePoints: r.gradePoints ?? null,
        passed,
        credits: r.credits ?? 0,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        attemptNumber: 1,
      });
    });

    await this.subjectResultRepo.save(toSave, { chunk: 200 });
  }

  /** Retrieve uploaded mark records for a notification & category */
  async getUploadedMarks(category, notificationId) {
    const cat = String(category || '').toUpperCase();
    const isReval = cat === 'REVALUATION';

    const records = await this.markRepo.find({
      where: isReval
        ? { category: cat, revaluationId: notificationId }
        : { category: cat, examId: notificationId },
      order: { studentRollNumber: 'ASC', subjectCode: 'ASC' },
    });

    const students = new Set(records.map((r) => r.studentRollNumber)).size;
    const passCount = records.filter((r) => r.passed === true).length;
    const failCount = records.filter((r) => r.passed === false).length;
    const absentCount = records.filter((r) => r.isAbsent === true).length;

    return {
      category: cat,
      notificationId,
      totalRecords: records.length,
      studentCount: students,
      stats: {
        passCount,
        failCount,
        absentCount,
      },
      records,
    };
  }

  /**
   * Get consolidated student-wise results report across Internals, Externals, Main Results & Revaluations
   */
  async getConsolidatedResults({ examId, revaluationId, rollNumber, search }) {
    const qb = this.markRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.exam', 'exam')
      .leftJoinAndSelect('exam.regulation', 'regulation')
      .leftJoinAndSelect('m.revaluationNotification', 'reval');

    if (examId) {
      qb.where('(m.examId = :examId OR m.examId IS NULL)', { examId });
    }
    if (revaluationId) {
      qb.andWhere('m.revaluationId = :revaluationId', { revaluationId });
    }
    if (rollNumber) {
      qb.andWhere('LOWER(m.studentRollNumber) = LOWER(:rollNumber)', { rollNumber });
    }

    const allMarks = await qb
      .orderBy('m.studentRollNumber', 'ASC')
      .addOrderBy('m.subjectCode', 'ASC')
      .getMany();

    const studentMap = new Map();

    for (const m of allMarks) {
      const roll = m.studentRollNumber.trim();
      const s = studentMap.get(roll.toLowerCase()) || {
        rollNumber: roll,
        studentName: m.studentName || '',
        examGroupsMap: new Map(),
      };

      if (!s.studentName && m.studentName) s.studentName = m.studentName;

      // Group key by notification / exam / regulation
      const notificationTitle = m.exam?.name || m.revaluationNotification?.title || 'General Examination';
      const examType = m.exam?.type || (m.revaluationNotification ? 'REVALUATION' : 'REGULAR');
      const regulationCode = m.exam?.regulation?.code || m.revaluationNotification?.regulationCode || 'N/A';
      const semester = m.exam?.semester
        ? (m.exam?.yearOfStudy ? `${m.exam.yearOfStudy}-${m.exam.semester}` : String(m.exam.semester))
        : (m.revaluationNotification?.semester || 'N/A');
      const groupKey = `${m.examId ? 'E_' + m.examId : (m.revaluationId ? 'R_' + m.revaluationId : 'OTHERS')}`;

      const group = s.examGroupsMap.get(groupKey) || {
        examId: m.examId || null,
        revaluationId: m.revaluationId || null,
        notificationTitle,
        examType,
        regulationCode,
        semester,
        academicYear: m.revaluationNotification?.academicYear || null,
        subjectsMap: new Map(),
      };

      const subCode = m.subjectCode.trim();
      const sub = group.subjectsMap.get(subCode.toLowerCase()) || {
        subjectCode: subCode,
        subjectName: m.subjectName || subCode,
        examId: m.examId,
        examTitle: notificationTitle,
        examType,
        regulationCode,
        semester,
        internalMarks: null,
        maxInternalMarks: 30,
        externalMarks: null,
        maxExternalMarks: 70,
        totalMarks: null,
        maxTotalMarks: 100,
        grade: null,
        gradePoints: null,
        credits: 0,
        passed: null,
        isAbsent: false,
        revaluation: null,
      };

      const cat = String(m.category ?? '').toUpperCase();

      if (cat === 'INTERNAL' || m.internalMarks != null) {
        sub.internalMarks = m.internalMarks != null ? Number(m.internalMarks) : sub.internalMarks;
        sub.maxInternalMarks = m.maxInternalMarks != null ? Number(m.maxInternalMarks) : (sub.maxInternalMarks || 30);
      } else if (cat === 'EXTERNAL') {
        sub.externalMarks = m.externalMarks != null ? Number(m.externalMarks) : null;
        sub.maxExternalMarks = m.maxExternalMarks != null ? Number(m.maxExternalMarks) : 70;
        sub.isAbsent = !!m.isAbsent;
      } else if (m.category === 'RESULT') {
        sub.grade = m.grade || sub.grade;
        sub.gradePoints = m.gradePoints != null ? Number(m.gradePoints) : sub.gradePoints;
        sub.credits = m.credits != null ? Number(m.credits) : sub.credits;
        sub.passed = m.passed != null ? !!m.passed : sub.passed;
        if (m.internalMarks != null) sub.internalMarks = Number(m.internalMarks);
        if (m.externalMarks != null) sub.externalMarks = Number(m.externalMarks);
        if (m.totalMarks != null) sub.totalMarks = Number(m.totalMarks);
      } else if (m.category === 'REVALUATION') {
        sub.revaluation = {
          originalGrade: m.originalGrade,
          updatedGrade: m.updatedGrade,
          originalMarks: m.originalMarks != null ? Number(m.originalMarks) : null,
          updatedMarks: m.updatedMarks != null ? Number(m.updatedMarks) : null,
          status: m.status || 'GRADE_CHANGED',
        };
        if (m.updatedGrade) {
          sub.grade = m.updatedGrade;
        }
      }

      if (sub.totalMarks == null && sub.internalMarks != null && sub.externalMarks != null) {
        sub.totalMarks = sub.internalMarks + sub.externalMarks;
      }

      group.subjectsMap.set(subCode.toLowerCase(), sub);
      s.examGroupsMap.set(groupKey, group);
      studentMap.set(roll.toLowerCase(), s);
    }

    const studentList = [...studentMap.values()].map((s) => {
      const studentGroups = [...s.examGroupsMap.values()];
      const identifiedExamGroups = studentGroups.filter(
        (group) => group.examId != null && group.revaluationId == null,
      );
      const unlinkedGroups = studentGroups.filter(
        (group) => group.examId == null && group.revaluationId == null,
      );

      if (identifiedExamGroups.length === 1 && unlinkedGroups.length > 0) {
        const targetGroup = identifiedExamGroups[0];
        for (const unlinkedGroup of unlinkedGroups) {
          for (const [subjectKey, sourceSubject] of unlinkedGroup.subjectsMap) {
            const targetSubject = targetGroup.subjectsMap.get(subjectKey);
            if (!targetSubject) {
              targetGroup.subjectsMap.set(subjectKey, sourceSubject);
              continue;
            }

            for (const field of [
              'internalMarks',
              'maxInternalMarks',
              'externalMarks',
              'maxExternalMarks',
              'totalMarks',
              'maxTotalMarks',
              'grade',
              'gradePoints',
              'credits',
              'passed',
            ]) {
              if (targetSubject[field] == null && sourceSubject[field] != null) {
                targetSubject[field] = sourceSubject[field];
              }
            }
            targetSubject.isAbsent ||= sourceSubject.isAbsent;
            targetSubject.revaluation ||= sourceSubject.revaluation;
          }
        }
      }

      const groupsForStudent =
        identifiedExamGroups.length === 1 && unlinkedGroups.length > 0
          ? studentGroups.filter((group) => !unlinkedGroups.includes(group))
          : studentGroups;

      const examGroups = groupsForStudent.map((g) => {
        const subjects = [...g.subjectsMap.values()];
        let totalCredits = 0;
        let totalGradePointsCredits = 0;
        let backlogs = 0;
        let passedCount = 0;

        subjects.forEach((sub) => {
          const isPass = sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB';
          if (isPass) passedCount++;
          else backlogs++;

          const cr = sub.credits || 0;
          const gp = sub.gradePoints || 0;
          totalCredits += cr;
          totalGradePointsCredits += gp * cr;
        });

        const sgpa = totalCredits > 0 ? (totalGradePointsCredits / totalCredits).toFixed(2) : '0.00';

        return {
          examId: g.examId,
          revaluationId: g.revaluationId,
          notificationTitle: g.notificationTitle,
          examType: g.examType,
          regulationCode: g.regulationCode,
          semester: g.semester,
          academicYear: g.academicYear,
          subjectCount: subjects.length,
          passedCount,
          backlogs,
          totalCredits,
          sgpa: Number(sgpa),
          status: backlogs === 0 ? 'PASSED' : 'BACKLOGS',
          subjects,
        };
      });

      // Flat subjects list across all exam groups for backwards compatibility
      const allSubjects = examGroups.flatMap((g) => g.subjects);
      let overallCredits = 0;
      let overallGradePointsCredits = 0;
      let overallBacklogs = 0;
      let overallPassed = 0;

      allSubjects.forEach((sub) => {
        const isPass = sub.passed !== false && sub.grade !== 'F' && sub.grade !== 'AB';
        if (isPass) overallPassed++;
        else overallBacklogs++;

        const cr = sub.credits || 0;
        const gp = sub.gradePoints || 0;
        overallCredits += cr;
        overallGradePointsCredits += gp * cr;
      });

      const overallSgpa = overallCredits > 0 ? (overallGradePointsCredits / overallCredits).toFixed(2) : '0.00';

      return {
        rollNumber: s.rollNumber,
        studentName: s.studentName,
        examId: examGroups[0]?.examId || null,
        revaluationId: examGroups[0]?.revaluationId || null,
        subjectCount: allSubjects.length,
        passedCount: overallPassed,
        backlogs: overallBacklogs,
        totalCredits: overallCredits,
        sgpa: Number(overallSgpa),
        status: overallBacklogs === 0 ? 'PASSED' : 'BACKLOGS',
        examGroups,
        subjects: allSubjects,
      };
    });

    let finalStudents = studentList;
    if (search) {
      const q = search.toLowerCase();
      finalStudents = studentList.filter(
        (s) =>
          s.rollNumber.toLowerCase().includes(q) ||
          (s.studentName && s.studentName.toLowerCase().includes(q)) ||
          s.subjects.some(
            (sub) =>
              sub.subjectCode.toLowerCase().includes(q) ||
              (sub.regulationCode && sub.regulationCode.toLowerCase().includes(q)) ||
              (sub.examTitle && sub.examTitle.toLowerCase().includes(q))
          )
      );
    }

    return {
      totalStudents: finalStudents.length,
      allClearCount: finalStudents.filter((s) => s.status === 'PASSED').length,
      backlogCount: finalStudents.filter((s) => s.status === 'BACKLOGS').length,
      students: finalStudents,
    };
  }

  /**
   * Dedicated Semester-wise Total Marks Ledger:
   * Retrieves all mapped semester subjects and enrolled students based on
   * Academic Year (Batch), College, Course, Branch, Year of Study, Semester & Regulation,
   * calculates individual subject marks (Int, Ext, Tot, Grade, GP, Credits)
   * as well as aggregate Grand Total Marks, Percentage, Credits, SGPA and Pass/Fail status.
   */
  async getSemesterTotalMarksLedger(params = {}) {
    const {
      examId,
      regulationId,
      regulationCode,
      college,
      collegeName,
      course,
      courseName,
      branch,
      branchName,
      batch,
      academicYear,
      yearOfStudy,
      semester,
      search,
      status,
    } = params;

    const targetCollege = (college || collegeName || '').trim();
    const targetCourse = (course || courseName || '').trim();
    const targetBranch = (branch || branchName || '').trim();
    const targetBatch = (batch || academicYear || '').trim();
    const targetYear = yearOfStudy ? Number(yearOfStudy) : null;
    const targetSem = semester ? Number(semester) : null;
    let regId = regulationId ? Number(regulationId) : null;

    // Resolve regulationId from code if needed
    if (!regId && regulationCode && this.regulationRepo) {
      try {
        const foundReg = await this.regulationRepo.findOne({
          where: { code: String(regulationCode).trim() },
        });
        if (foundReg) regId = foundReg.id;
      } catch (err) {}
    }

    // Resolve matching exam notification if possible
    let exam = null;
    if (examId) {
      exam = await this.examRepo.findOne({
        where: { id: examId },
        relations: ['examSubjects', 'examSubjects.subject', 'regulation', 'scopes'],
      });
    } else {
      const qb = this.examRepo.createQueryBuilder('e')
        .leftJoinAndSelect('e.examSubjects', 'examSubjects')
        .leftJoinAndSelect('examSubjects.subject', 'subject')
        .leftJoinAndSelect('e.regulation', 'regulation')
        .leftJoinAndSelect('e.scopes', 'scopes')
        .orderBy('e.createdAt', 'DESC');

      if (regId) qb.andWhere('e.regulationId = :regId', { regId });
      if (targetSem) qb.andWhere('e.semester = :targetSem', { targetSem });
      if (targetYear) qb.andWhere('e.yearOfStudy = :targetYear', { targetYear });
      if (targetCourse && targetCourse !== 'ALL') {
        qb.andWhere('LOWER(e.course) = LOWER(:course)', { course: targetCourse });
      }
      if (targetBranch && targetBranch !== 'ALL') {
        qb.andWhere('(LOWER(e.branch) LIKE LOWER(:brLike) OR LOWER(e.branch) = :br)', {
          brLike: `%${targetBranch}%`,
          br: 'ALL',
        });
      }
      if (targetBatch && targetBatch !== 'ALL') {
        qb.andWhere('(e.batch = :batch OR e.batch IS NULL)', { batch: targetBatch });
      }

      exam = await qb.getOne().catch(() => null);

      if (!exam) {
        // Fallback to most recent exam
        exam = await this.examRepo.findOne({
          relations: ['examSubjects', 'examSubjects.subject', 'regulation', 'scopes'],
          order: { createdAt: 'DESC' },
        }).catch(() => null);
      }
    }

    // 1. Resolve Regulation & Scope Metadata
    let regCode = exam?.regulation?.code || regulationCode || 'N/A';
    if (!regId && exam?.regulationId) regId = exam.regulationId;

    const resolvedScope = {
      regulationId: regId || exam?.regulationId || null,
      regulationCode: regCode,
      college: targetCollege || exam?.college || 'PYDAH COLLEGE OF ENGINEERING',
      course: targetCourse || exam?.course || 'B.Tech',
      branch: targetBranch || exam?.branch || 'CSE',
      batch: targetBatch || exam?.batch || '2023-2027',
      yearOfStudy: targetYear || exam?.yearOfStudy || 1,
      semester: targetSem || exam?.semester || 1,
    };

    // 2. Build Semester Subjects list from SubjectMappingEntry & ExamSubjects
    const subjectsMap = new Map();

    // A. Query mapped subjects from subject_mapping_entries
    if (this.subjectMappingRepo) {
      try {
        const sqb = this.subjectMappingRepo.createQueryBuilder('m')
          .leftJoinAndSelect('m.subject', 'subject');

        if (regId) {
          sqb.andWhere('m.regulationId = :regId', { regId });
        }
        if (resolvedScope.semester) {
          sqb.andWhere('m.semester = :sem', { sem: Number(resolvedScope.semester) });
        }
        if (resolvedScope.yearOfStudy) {
          sqb.andWhere('m.yearOfStudy = :yr', { yr: Number(resolvedScope.yearOfStudy) });
        }
        if (resolvedScope.branch && resolvedScope.branch !== 'ALL') {
          sqb.andWhere('LOWER(m.branchName) = LOWER(:bName)', { bName: resolvedScope.branch });
        }
        if (resolvedScope.course && resolvedScope.course !== 'ALL') {
          sqb.andWhere('LOWER(m.courseName) = LOWER(:cName)', { cName: resolvedScope.course });
        }

        const mappings = await sqb.getMany();
        for (const m of mappings) {
          const s = m.subject;
          if (!s) continue;
          const code = String(s.code || '').toUpperCase().trim();
          if (!code || subjectsMap.has(code)) continue;

          const rawType = String(s.type || '').toUpperCase();
          const isLab =
            rawType.includes('LAB') ||
            rawType.includes('PRACTICAL') ||
            rawType === 'P' ||
            code.endsWith('L') ||
            code.endsWith('P');

          const maxInt = Number(s.internalMarks ?? 30);
          const maxExt = Number(s.externalMarks ?? 70);
          const maxTot = Number(s.totalMarks ?? (maxInt + maxExt));
          const credits = Number(s.credits ?? 3);

          subjectsMap.set(code, {
            id: s.id,
            code,
            name: s.name || code,
            type: isLab ? 'LAB' : (rawType || 'THEORY'),
            maxInternalMarks: maxInt,
            maxExternalMarks: maxExt,
            maxTotalMarks: maxTot,
            credits: credits > 0 ? credits : 3,
          });
        }
      } catch (mErr) {
        console.warn('Could not query subject mappings:', mErr.message);
      }
    }

    // B. Also include any subjects configured directly on the Exam
    if (exam && exam.examSubjects) {
      for (const es of exam.examSubjects) {
        const code = String(es.subject?.code || '').toUpperCase().trim();
        if (!code || subjectsMap.has(code)) continue;

        const rawType = String(es.subject?.type || '').toUpperCase();
        const isLab =
          rawType.includes('LAB') ||
          rawType.includes('PRACTICAL') ||
          rawType === 'P' ||
          code.endsWith('L') ||
          code.endsWith('P');

        const maxInt = Number(es.subject?.internalMarks ?? 30);
        const maxExt = Number(es.subject?.externalMarks ?? 70);
        const maxTot = Number(es.subject?.totalMarks ?? (maxInt + maxExt));
        const credits = Number(es.subject?.credits ?? 3);

        subjectsMap.set(code, {
          id: es.subjectId,
          code,
          name: es.subject?.name || code,
          type: isLab ? 'LAB' : (rawType || 'THEORY'),
          maxInternalMarks: maxInt,
          maxExternalMarks: maxExt,
          maxTotalMarks: maxTot,
          credits: credits > 0 ? credits : 3,
        });
      }
    }

    const semesterSubjects = Array.from(subjectsMap.values());
    const semesterTotalMaxMarks = semesterSubjects.reduce((sum, s) => sum + (s.maxTotalMarks || 100), 0);
    const semesterTotalCredits = semesterSubjects.reduce((sum, s) => sum + (s.credits || 0), 0);

    // 3. Find Enrolled / Scope Students
    const studentMap = new Map();

    // A. From SDMS
    if (this.sdms && this.sdms.studentRepo) {
      try {
        const sqb = this.sdms.studentRepo.createQueryBuilder('s')
          .select([
            's.id',
            's.pinNo',
            's.admissionNumber',
            's.studentName',
            's.college',
            's.course',
            's.branch',
            's.batch',
            's.section',
            's.currentYear',
            's.currentSemester',
            's.studentStatus',
          ]);

        if (resolvedScope.course && resolvedScope.course !== 'ALL') {
          sqb.andWhere('LOWER(s.course) = LOWER(:course)', { course: resolvedScope.course });
        }
        if (resolvedScope.branch && resolvedScope.branch !== 'ALL') {
          sqb.andWhere('LOWER(s.branch) = LOWER(:branch)', { branch: resolvedScope.branch });
        }
        if (resolvedScope.batch && resolvedScope.batch !== 'ALL') {
          sqb.andWhere('s.batch = :batch', { batch: resolvedScope.batch });
        }
        if (resolvedScope.college && resolvedScope.college !== 'ALL') {
          sqb.andWhere('LOWER(s.college) LIKE LOWER(:college)', { college: `%${resolvedScope.college}%` });
        }

        const sdmsStudents = await sqb.getMany();
        for (const st of sdmsStudents) {
          const r = String(st.pinNo || st.admissionNumber || '').toUpperCase().trim();
          if (!r) continue;
          studentMap.set(r, {
            rollNumber: r,
            studentName: st.studentName || '',
            branch: st.branch || resolvedScope.branch || 'GENERAL',
            section: st.section || null,
          });
        }
      } catch (sdErr) {
        console.warn('Could not query SDMS students for ledger:', sdErr.message);
      }
    }

    // B. From Exam Applications
    if (exam) {
      try {
        const apps = await this.applicationRepo.find({ where: { examId: exam.id } });
        for (const a of apps) {
          const r = String(a.studentRollNumber || '').toUpperCase().trim();
          if (!r) continue;
          if (!studentMap.has(r)) {
            studentMap.set(r, {
              rollNumber: r,
              studentName: a.studentName || '',
              branch: a.studentBranch || resolvedScope.branch || 'GENERAL',
              section: a.studentSection || null,
            });
          }
        }
      } catch (aErr) {}
    }

    // 4. Query all marks for this scope / exam
    const subjectCodes = Array.from(subjectsMap.keys());
    let existingMarks = [];

    if (exam) {
      existingMarks = await this.markRepo.find({
        where: { examId: exam.id },
        order: { studentRollNumber: 'ASC', subjectCode: 'ASC' },
      });
    } else if (subjectCodes.length > 0) {
      existingMarks = await this.markRepo.createQueryBuilder('m')
        .where('m.subjectCode IN (:...codes)', { codes: subjectCodes })
        .orderBy('m.studentRollNumber', 'ASC')
        .addOrderBy('m.subjectCode', 'ASC')
        .getMany();
    }

    // Map marks by `${roll}|${subjectCode}`
    const marksByStudentSub = new Map();
    for (const m of existingMarks) {
      const r = String(m.studentRollNumber || '').toUpperCase().trim();
      const sc = String(m.subjectCode || '').toUpperCase().trim();
      const key = `${r}|${sc}`;

      let current = marksByStudentSub.get(key) || {
        studentRollNumber: r,
        studentName: m.studentName || '',
        subjectCode: sc,
        subjectName: m.subjectName || '',
        internalMarks: null,
        maxInternalMarks: m.maxInternalMarks != null ? Number(m.maxInternalMarks) : null,
        externalMarks: null,
        maxExternalMarks: m.maxExternalMarks != null ? Number(m.maxExternalMarks) : null,
        totalMarks: null,
        maxTotalMarks: m.maxTotalMarks != null ? Number(m.maxTotalMarks) : null,
        grade: null,
        gradePoints: null,
        credits: m.credits != null ? Number(m.credits) : null,
        passed: null,
        isAbsent: false,
        revaluation: null,
      };

      if (m.studentName && !current.studentName) current.studentName = m.studentName;
      if (m.internalMarks != null) current.internalMarks = Number(m.internalMarks);
      if (m.maxInternalMarks != null) current.maxInternalMarks = Number(m.maxInternalMarks);
      if (m.externalMarks != null) current.externalMarks = Number(m.externalMarks);
      if (m.maxExternalMarks != null) current.maxExternalMarks = Number(m.maxExternalMarks);
      if (m.totalMarks != null) current.totalMarks = Number(m.totalMarks);
      if (m.maxTotalMarks != null) current.maxTotalMarks = Number(m.maxTotalMarks);
      if (m.grade) current.grade = m.grade;
      if (m.gradePoints != null) current.gradePoints = Number(m.gradePoints);
      if (m.credits != null && Number(m.credits) > 0) current.credits = Number(m.credits);
      if (m.passed != null) current.passed = !!m.passed;
      if (m.isAbsent) current.isAbsent = true;

      if (m.category === 'REVALUATION' && m.updatedGrade) {
        current.grade = m.updatedGrade;
        if (m.updatedMarks != null) current.totalMarks = Number(m.updatedMarks);
      }

      marksByStudentSub.set(key, current);

      // Ensure student is added to studentMap
      if (!studentMap.has(r)) {
        studentMap.set(r, {
          rollNumber: r,
          studentName: m.studentName || '',
          branch: resolvedScope.branch || 'GENERAL',
          section: null,
        });
      }
    }

    const computeGradePoints = (grade) => {
      const g = String(grade || '').toUpperCase().trim();
      if (['O', 'S'].includes(g)) return 10.0;
      if (['A+'].includes(g)) return 9.0;
      if (['A'].includes(g)) return 8.0;
      if (['B+'].includes(g)) return 7.0;
      if (['B'].includes(g)) return 6.0;
      if (['C'].includes(g)) return 6.0;
      if (['D', 'E', 'P'].includes(g)) return 5.0;
      return 0.0;
    };

    const inferGradeFromMarks = (total, max = 100) => {
      const pct = (Number(total) / Number(max)) * 100;
      if (pct >= 90) return 'O';
      if (pct >= 80) return 'A+';
      if (pct >= 70) return 'A';
      if (pct >= 60) return 'B+';
      if (pct >= 50) return 'B';
      if (pct >= 40) return 'C';
      return 'F';
    };

    const studentRows = [];

    for (const [roll, studentInfo] of studentMap.entries()) {
      const subjectMarks = [];
      let totalMarksSecured = 0;
      let evaluatedMaxMarks = 0;
      let totalGradePointsCredits = 0;
      let totalCreditsEarned = 0;
      let evaluatedCredits = 0;
      let passedCount = 0;
      let backlogs = 0;
      let hasAnyMarks = false;

      for (const sub of semesterSubjects) {
        const key = `${roll}|${sub.code}`;
        const record = marksByStudentSub.get(key);

        let intMarks = record?.internalMarks ?? null;
        let extMarks = record?.externalMarks ?? null;
        let totMarks = record?.totalMarks ?? null;
        let isAbsent = !!record?.isAbsent;
        let grade = record?.grade ?? null;
        let gradePoints = record?.gradePoints ?? null;
        let credits = (record?.credits && record.credits > 0) ? record.credits : sub.credits;

        if (totMarks == null && intMarks != null && extMarks != null && !isAbsent) {
          totMarks = Number(intMarks) + Number(extMarks);
        }

        if (totMarks != null || intMarks != null || extMarks != null || isAbsent || grade != null) {
          hasAnyMarks = true;
        }

        if (isAbsent) {
          grade = 'AB';
          gradePoints = 0;
        } else if (!grade && totMarks != null) {
          grade = inferGradeFromMarks(totMarks, sub.maxTotalMarks);
        }

        if (gradePoints == null && grade != null) {
          gradePoints = computeGradePoints(grade);
        }

        let isPass = null;
        if (record?.passed != null) {
          isPass = record.passed;
        } else if (grade) {
          isPass = !FAIL_GRADES.has(String(grade).toUpperCase());
        } else if (totMarks != null) {
          isPass = Number(totMarks) >= (sub.maxTotalMarks * 0.4);
        }

        if (isPass !== null) {
          if (isPass) {
            passedCount++;
            totalCreditsEarned += credits;
          } else {
            backlogs++;
          }
        }

        if (totMarks != null && !isAbsent) {
          totalMarksSecured += Number(totMarks);
          evaluatedMaxMarks += sub.maxTotalMarks;
        } else if (isAbsent) {
          evaluatedMaxMarks += sub.maxTotalMarks;
        }

        if (gradePoints != null && credits > 0) {
          totalGradePointsCredits += gradePoints * credits;
          evaluatedCredits += credits;
        }

        subjectMarks.push({
          subjectCode: sub.code,
          subjectName: sub.name,
          type: sub.type,
          internalMarks: intMarks,
          maxInternalMarks: sub.maxInternalMarks,
          externalMarks: extMarks,
          maxExternalMarks: sub.maxExternalMarks,
          totalMarks: totMarks,
          maxTotalMarks: sub.maxTotalMarks,
          grade,
          gradePoints,
          credits,
          passed: isPass,
          isAbsent,
        });
      }

      const totalPossibleMax = semesterTotalMaxMarks > 0 ? semesterTotalMaxMarks : evaluatedMaxMarks;
      const percentage = evaluatedMaxMarks > 0
        ? Number(((totalMarksSecured / evaluatedMaxMarks) * 100).toFixed(2))
        : 0;

      const sgpa = evaluatedCredits > 0
        ? Number((totalGradePointsCredits / evaluatedCredits).toFixed(2))
        : 0;

      let studentStatus = 'PENDING';
      if (hasAnyMarks) {
        studentStatus = backlogs === 0 && passedCount > 0 ? 'PASSED' : 'BACKLOGS';
      }

      studentRows.push({
        rollNumber: roll,
        studentName: studentInfo.studentName,
        branch: studentInfo.branch,
        section: studentInfo.section,
        subjectMarks,
        totalMarksSecured,
        totalMaxMarks: totalPossibleMax,
        percentage,
        sgpa,
        totalCreditsEarned,
        totalCreditsPossible: semesterTotalCredits,
        passedCount,
        backlogs,
        status: studentStatus,
        hasMarks: hasAnyMarks,
      });
    }

    // 5. Apply filters (search, branch, status)
    let filteredStudents = studentRows;
    if (branch && branch !== 'ALL') {
      const bUpper = String(branch).toUpperCase();
      filteredStudents = filteredStudents.filter(
        (s) => String(s.branch || '').toUpperCase() === bUpper
      );
    }

    if (status && status !== 'ALL') {
      filteredStudents = filteredStudents.filter((s) => s.status === status);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filteredStudents = filteredStudents.filter(
        (s) =>
          s.rollNumber.toLowerCase().includes(q) ||
          (s.studentName && s.studentName.toLowerCase().includes(q))
      );
    }

    filteredStudents.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }));

    // 6. Calculate Stats
    const totalCount = studentRows.length;
    const evaluated = studentRows.filter((s) => s.hasMarks);
    const passed = studentRows.filter((s) => s.status === 'PASSED');
    const withBacklogs = studentRows.filter((s) => s.status === 'BACKLOGS');
    const pending = studentRows.filter((s) => s.status === 'PENDING');

    const passPct = evaluated.length > 0
      ? Number(((passed.length / evaluated.length) * 100).toFixed(1))
      : 0;

    const highestMarks = evaluated.length > 0
      ? Math.max(...evaluated.map((s) => s.totalMarksSecured))
      : 0;

    const avgMarks = evaluated.length > 0
      ? Number((evaluated.reduce((acc, s) => acc + s.totalMarksSecured, 0) / evaluated.length).toFixed(1))
      : 0;

    const avgSgpa = evaluated.length > 0
      ? Number((evaluated.reduce((acc, s) => acc + s.sgpa, 0) / evaluated.length).toFixed(2))
      : 0;

    return {
      notification: exam ? {
        id: exam.id,
        title: exam.name,
        name: exam.name,
        type: exam.type,
        regulationCode: exam.regulation?.code || exam.regulationId || 'N/A',
        course: exam.course || resolvedScope.course,
        branch: exam.branch || resolvedScope.branch,
        semester: exam.semester || resolvedScope.semester,
        yearOfStudy: exam.yearOfStudy || resolvedScope.yearOfStudy,
        batch: exam.batch || resolvedScope.batch,
        academicYear: exam.academicYear || null,
        status: exam.status,
      } : null,
      semesterScope: resolvedScope,
      branches: Array.from(new Set(studentRows.map((s) => s.branch).filter(Boolean))),
      semesterSubjects,
      semesterTotalMaxMarks,
      semesterTotalCredits,
      students: filteredStudents,
      stats: {
        totalStudents: totalCount,
        evaluatedStudents: evaluated.length,
        passedStudents: passed.length,
        backlogStudents: withBacklogs.length,
        pendingStudents: pending.length,
        passPercentage: passPct,
        highestTotalMarks: highestMarks,
        averageTotalMarks: avgMarks,
        averageSgpa: avgSgpa,
      },
    };
  }

  /**
   * Save or update semester marks (Internal, External, Total, Grade, Result)
   * originating from PDF parsing sheet or table entry.
   */
  async saveSemesterMarks(examId, { rows, academicScope }, actor = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw AppError.badRequest('No marks records provided for update');
    }

    let exam = null;
    if (examId) {
      exam = await this.examRepo.findOne({
        where: { id: examId },
        relations: ['examSubjects', 'examSubjects.subject', 'regulation'],
      });
    } else if (academicScope) {
      const { course, branch, batch, semester, yearOfStudy, regulationId } = academicScope;
      const qb = this.examRepo.createQueryBuilder('e')
        .leftJoinAndSelect('e.examSubjects', 'examSubjects')
        .leftJoinAndSelect('examSubjects.subject', 'subject')
        .leftJoinAndSelect('e.regulation', 'regulation')
        .orderBy('e.createdAt', 'DESC');

      if (regulationId) qb.andWhere('e.regulationId = :regulationId', { regulationId });
      if (semester) qb.andWhere('e.semester = :sem', { sem: Number(semester) });
      if (yearOfStudy) qb.andWhere('e.yearOfStudy = :yr', { yr: Number(yearOfStudy) });
      if (course && course !== 'ALL') qb.andWhere('LOWER(e.course) = LOWER(:course)', { course });
      if (branch && branch !== 'ALL') qb.andWhere('LOWER(e.branch) LIKE LOWER(:branch)', { branch: `%${branch}%` });
      if (batch && batch !== 'ALL') qb.andWhere('(e.batch = :batch OR e.batch IS NULL)', { batch });

      exam = await qb.getOne().catch(() => null);
      if (exam) examId = exam.id;
    }

    const uploadedBy = actor?.fullName?.trim() || actor?.username?.trim() || 'Staff Desk';

    const subjectMap = new Map();
    if (exam && exam.examSubjects) {
      for (const es of exam.examSubjects) {
        const code = es.subject?.code?.trim();
        if (code) {
          subjectMap.set(code.toUpperCase(), {
            code,
            name: es.subject?.name || '',
            internalMarks: es.subject?.internalMarks ?? 30,
            externalMarks: es.subject?.externalMarks ?? 70,
            totalMarks: es.subject?.totalMarks ?? 100,
            credits: es.subject?.credits ?? 3,
          });
        }
      }
    }

    if (this.subjectMappingRepo) {
      try {
        const mappings = await this.subjectMappingRepo.find({
          relations: ['subject'],
        });
        for (const m of mappings) {
          const code = m.subject?.code?.trim();
          if (code && !subjectMap.has(code.toUpperCase())) {
            subjectMap.set(code.toUpperCase(), {
              code,
              name: m.subject?.name || '',
              internalMarks: m.subject?.internalMarks ?? 30,
              externalMarks: m.subject?.externalMarks ?? 70,
              totalMarks: m.subject?.totalMarks ?? 100,
              credits: m.subject?.credits ?? 3,
            });
          }
        }
      } catch (err) {}
    }

    const computeGradePoints = (grade) => {
      const g = String(grade || '').toUpperCase().trim();
      if (['O', 'S'].includes(g)) return 10.0;
      if (['A+'].includes(g)) return 9.0;
      if (['A'].includes(g)) return 8.0;
      if (['B+'].includes(g)) return 7.0;
      if (['B'].includes(g)) return 6.0;
      if (['C'].includes(g)) return 6.0;
      if (['D', 'E', 'P'].includes(g)) return 5.0;
      return 0.0;
    };

    const inferGradeFromMarks = (total, max = 100) => {
      const pct = (Number(total) / Number(max)) * 100;
      if (pct >= 90) return 'O';
      if (pct >= 80) return 'A+';
      if (pct >= 70) return 'A';
      if (pct >= 60) return 'B+';
      if (pct >= 50) return 'B';
      if (pct >= 40) return 'C';
      return 'F';
    };

    const existingRecords = examId
      ? await this.markRepo.find({ where: { examId } })
      : await this.markRepo.find();
    const existingMap = new Map();
    for (const er of existingRecords) {
      const key = `${er.category}|${er.studentRollNumber.toUpperCase()}|${er.subjectCode.toUpperCase()}`;
      existingMap.set(key, er);
    }

    const toSave = [];
    let savedCount = 0;

    for (const r of rows) {
      const roll = String(r.rollNumber || r.roll || r.pinNo || '').toUpperCase().trim();
      const code = String(r.subjectCode || r.code || '').toUpperCase().trim();
      if (!roll || !code) continue;

      const subInfo = subjectMap.get(code) || {
        code,
        name: r.subjectName || code,
        internalMarks: 30,
        externalMarks: 70,
        totalMarks: 100,
        credits: 3,
      };

      const isAb = r.isAbsent || String(r.grade).toUpperCase() === 'AB' || String(r.result).toUpperCase() === 'AB';
      let intMarks = r.internalMarks !== undefined && r.internalMarks !== '' && r.internalMarks !== null
        ? parseFloat(r.internalMarks)
        : null;
      let extMarks = r.externalMarks !== undefined && r.externalMarks !== '' && r.externalMarks !== null
        ? parseFloat(r.externalMarks)
        : null;
      let totMarks = r.totalMarks !== undefined && r.totalMarks !== '' && r.totalMarks !== null
        ? parseFloat(r.totalMarks)
        : null;

      if (totMarks === null && intMarks !== null && extMarks !== null && !isAb) {
        totMarks = intMarks + extMarks;
      }

      let grade = r.grade ? String(r.grade).toUpperCase().trim() : null;
      if (isAb) {
        grade = 'AB';
      } else if (!grade && totMarks !== null) {
        grade = inferGradeFromMarks(totMarks, subInfo.totalMarks);
      }

      const gp = r.gradePoints !== undefined && r.gradePoints !== '' && r.gradePoints !== null
        ? parseFloat(r.gradePoints)
        : (grade ? computeGradePoints(grade) : null);

      const credits = r.credits !== undefined && r.credits !== '' && r.credits !== null
        ? parseFloat(r.credits)
        : subInfo.credits;

      const passed = normalizeResultFlag(r.result || r.passed, grade);

      // Save as RESULT record
      const key = `RESULT|${roll}|${code}`;
      const prior = existingMap.get(key);

      const recordData = {
        category: 'RESULT',
        examId,
        studentRollNumber: roll,
        studentName: r.studentName ? String(r.studentName).trim() : (prior?.studentName || null),
        subjectCode: code,
        subjectName: r.subjectName ? String(r.subjectName).trim() : (subInfo.name || prior?.subjectName || null),
        internalMarks: intMarks,
        maxInternalMarks: subInfo.internalMarks,
        externalMarks: extMarks,
        maxExternalMarks: subInfo.externalMarks,
        totalMarks: totMarks,
        maxTotalMarks: subInfo.totalMarks,
        grade,
        gradePoints: gp,
        credits,
        passed,
        isAbsent: isAb,
        status: isAb ? 'ABSENT' : (passed ? 'PASSED' : 'FAILED'),
        remarks: r.remarks || 'Updated via PDF Parsing Total Marks Sheet',
        uploadedBy,
      };

      if (prior) {
        toSave.push(this.markRepo.merge(prior, recordData));
      } else {
        toSave.push(this.markRepo.create(recordData));
      }
      savedCount++;
    }

    if (toSave.length > 0) {
      await this.markRepo.save(toSave, { chunk: 200 });
    }

    // Sync with SubjectResult for student portal visibility
    try {
      await this.syncToSubjectResults(
        examId,
        {
          rows: rows.map((r) => {
            const grade = r.grade ? String(r.grade).toUpperCase().trim() : (r.isAbsent ? 'AB' : 'P');
            return {
              rollNumber: r.rollNumber || r.roll,
              subjectCode: r.subjectCode || r.code,
              grade,
              gradePoints: r.gradePoints,
              credits: r.credits,
              result: r.result,
            };
          }),
        },
        uploadedBy
      );
    } catch (syncErr) {
      console.warn('Could not sync to SubjectResults:', syncErr.message);
    }

    return {
      success: true,
      count: savedCount,
      message: `Successfully saved marks for ${savedCount} student-subject records.`,
    };
  }

  /**
   * Calculate marks entry deadline and effective lock status for a subject.
   * Internal marks entry is permitted for up to 4 calendar days from the examination date.
   * Expired entries are automatically locked, unless an active manual unlock override exists.
   */
  calculateSubjectDeadline(examDateStr, overrideLock = null) {
    if (!examDateStr) {
      const isLocked = overrideLock ? !overrideLock.isUnlocked : false;
      return {
        examDate: null,
        deadlineDate: null,
        deadlineFormatted: 'No Exam Date Configured',
        isExpired: false,
        isLocked,
        isManuallyUnlocked: !!(overrideLock && overrideLock.isUnlocked),
        lockReason: overrideLock?.isUnlocked
          ? (overrideLock.unlockReason || 'Manually Unlocked')
          : (overrideLock ? 'Manually Locked' : 'Open'),
        override: overrideLock || null,
      };
    }

    const match = String(examDateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
      const isLocked = overrideLock ? !overrideLock.isUnlocked : false;
      return {
        examDate: examDateStr,
        deadlineDate: null,
        deadlineFormatted: 'Invalid Exam Date',
        isExpired: false,
        isLocked,
        isManuallyUnlocked: !!(overrideLock && overrideLock.isUnlocked),
        lockReason: overrideLock?.isUnlocked ? (overrideLock.unlockReason || 'Manually Unlocked') : 'Open',
        override: overrideLock || null,
      };
    }

    const [, y, m, d] = match;
    const baseDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    // Add 4 calendar days
    baseDate.setUTCDate(baseDate.getUTCDate() + 4);
    const deadlineDate = baseDate.toISOString().slice(0, 10);
    // End of 4th day in Asia/Kolkata (23:59:59.999 IST = 18:29:59.999 UTC)
    const deadlineEndMs = new Date(`${deadlineDate}T23:59:59.999+05:30`).getTime();
    // Start of exam date in Asia/Kolkata (00:00:00.000 IST)
    const examStartMs = new Date(`${y}-${m}-${d}T00:00:00.000+05:30`).getTime();
    const nowMs = Date.now();
    const isUpcoming = nowMs < examStartMs;
    const isExpired = nowMs > deadlineEndMs;

    let isLocked = isExpired;
    let isManuallyUnlocked = false;
    let lockReason = '';

    if (overrideLock) {
      if (overrideLock.isUnlocked) {
        isLocked = false;
        isManuallyUnlocked = true;
        lockReason = `Manually Unlocked by ${overrideLock.unlockedBy || 'Admin'}${overrideLock.unlockReason ? `: ${overrideLock.unlockReason}` : ''}`;
      } else {
        isLocked = isExpired || isUpcoming;
        lockReason = isUpcoming
          ? `Opens on ${d}/${m}/${y}`
          : isExpired
          ? '4-Day Entry Period Expired (Relocked)'
          : 'Open (Relocked)';
      }
    } else {
      if (isUpcoming) {
        isLocked = true;
        lockReason = `Opens on ${d}/${m}/${y}`;
      } else if (isExpired) {
        isLocked = true;
        lockReason = '4-Day Entry Period Expired';
      } else {
        isLocked = false;
        lockReason = 'Within 4-Day Window';
      }
    }

    const [dy, dm, dd] = deadlineDate.split('-');
    const deadlineFormatted = `${dd}/${dm}/${dy} 23:59 IST`;
    const examDateFormatted = `${d}/${m}/${y}`;

    return {
      examDate: `${y}-${m}-${d}`,
      examDateFormatted,
      deadlineDate,
      deadlineFormatted,
      isUpcoming,
      isExpired,
      isLocked,
      isManuallyUnlocked,
      lockReason,
      override: overrideLock || null,
    };
  }

  /**
   * Get comprehensive Internal Marks Management data for an exam notification:
   * - Notification details and metadata
   * - Filter lists (branches, sections, subjects, regulations, years, semesters)
   * - Subject-wise submission summary (eligible, entered, pending, completion %, deadline, lock status)
   * - Student marks details rows with distinction between entered 0 and missing marks
   * - Notification-level summary metrics
   */
  async getInternalMarksOverview(notificationId) {
    const exam = await this.examRepo.findOne({
      where: { id: notificationId },
      relations: ['regulation', 'examSubjects', 'examSubjects.subject', 'scopes'],
    });
    if (!exam) throw AppError.notFound('Examination notification not found');

    const details = await this.getNotificationDetails('EXAM', notificationId);
    const enrolledStudents = details?.students || [];
    const notificationSubjects = details?.subjects || [];

    // Load regulation internal calculation profile for this exam
    let formula = null;
    if (this.regInternalSettings) {
      try {
        formula = await this.regInternalSettings.getSettingForRegulation(
          exam.regulationId || exam.regulation?.code || null,
        );
      } catch (err) {
        console.warn('Could not load regulation formula for internal marks overview:', err.message);
      }
    }

    // Load manual lock overrides
    const lockRecords = this.lockRepo ? await this.lockRepo.find({ where: { examId: notificationId } }) : [];
    const lockMap = new Map();
    for (const l of lockRecords) {
      if (l.subjectCode) lockMap.set(l.subjectCode.toLowerCase(), l);
    }
    const allOverride = lockMap.get('all') || null;

    // Internal marks may also be stored on records created by the results workflow.
    const markRecords = await this.markRepo.find({
      where: { examId: notificationId },
      order: { studentRollNumber: 'ASC', subjectCode: 'ASC', updatedAt: 'DESC' },
    });

    const unlinkedMarkRecords = await this.markRepo.find({
      where: { examId: IsNull() },
      order: { studentRollNumber: 'ASC', subjectCode: 'ASC', updatedAt: 'DESC' },
    });
    const unlinkedResultsMarksMap = new Map();
    for (const record of unlinkedMarkRecords) {
      if (record.internalMarks == null || record.revaluationId != null) continue;
      const roll = String(record.studentRollNumber || '').trim().toLowerCase();
      const code = String(record.subjectCode || '').trim().toLowerCase();
      if (!roll || !code) continue;
      const key = `${roll}|${code}`;
      const existing = unlinkedResultsMarksMap.get(key);
      const isInternal = String(record.category || '').toUpperCase() === 'INTERNAL';
      const existingIsInternal = String(existing?.category || '').toUpperCase() === 'INTERNAL';
      if (!existing || (isInternal && !existingIsInternal)) {
        unlinkedResultsMarksMap.set(key, record);
      }
    }

    const marksMap = new Map();
    for (const m of markRecords) {
      const isInternalCategory = String(m.category || '').toUpperCase() === 'INTERNAL';
      if (m.internalMarks == null && !(isInternalCategory && m.isAbsent)) continue;

      const roll = (m.studentRollNumber || '').trim().toLowerCase();
      const code = (m.subjectCode || '').trim().toLowerCase();
      if (!roll || !code) continue;

      const key = `${roll}|${code}`;
      const existing = marksMap.get(key);
      const existingIsInternal =
        existing && String(existing.category || '').toUpperCase() === 'INTERNAL';
      if (!existing || (isInternalCategory && !existingIsInternal)) {
        marksMap.set(key, m);
      }
    }

    // Build subject list from exam subjects
    const subjectList = [];
    const subjectCodeMap = new Map();

    for (const es of exam.examSubjects || []) {
      const code = es.subject?.code?.trim() || `SUB-${es.subjectId}`;
      const cKey = code.toLowerCase();
      const bName = es.branch?.trim() || null;
      const sName = es.section?.trim() || null;

      if (!subjectCodeMap.has(cKey)) {
        const subExamDate = es.examDate || exam.examinationStartDate || null;
        const subOverride = lockMap.get(cKey) || allOverride;
        const deadlineInfo = this.calculateSubjectDeadline(subExamDate, subOverride);

        const subInfo = {
          id: es.subjectId,
          code,
          name: es.subject?.name || '',
          type: es.subject?.type || 'THEORY',
          internalMarks: Number(es.subject?.internalMarks ?? 30),
          externalMarks: Number(es.subject?.externalMarks ?? 70),
          totalMarks: Number(es.subject?.totalMarks ?? 100),
          branch: bName,
          branches: bName ? [bName] : [],
          section: sName,
          sections: sName ? [sName] : [],
          examDate: deadlineInfo.examDate,
          examDateFormatted: deadlineInfo.examDateFormatted,
          deadlineDate: deadlineInfo.deadlineDate,
          deadlineFormatted: deadlineInfo.deadlineFormatted,
          isUpcoming: deadlineInfo.isUpcoming,
          isExpired: deadlineInfo.isExpired,
          isLocked: deadlineInfo.isLocked,
          isManuallyUnlocked: deadlineInfo.isManuallyUnlocked,
          lockReason: deadlineInfo.lockReason,
          override: deadlineInfo.override,
        };
        subjectCodeMap.set(cKey, subInfo);
        subjectList.push(subInfo);
      } else {
        const existing = subjectCodeMap.get(cKey);
        if (bName && !existing.branches.includes(bName)) {
          existing.branches.push(bName);
        }
        if (sName && !existing.sections.includes(sName)) {
          existing.sections.push(sName);
        }
      }
    }

    // Fallback if exam has no explicit examSubjects loaded
    if (subjectList.length === 0) {
      for (const s of notificationSubjects) {
        const cKey = s.code.toLowerCase();
        const bName = s.branch?.trim() || null;
        const sName = s.section?.trim() || null;

        if (!subjectCodeMap.has(cKey)) {
          const deadlineInfo = this.calculateSubjectDeadline(s.examDate || exam.examinationStartDate || null, lockMap.get(cKey) || allOverride);
          const subInfo = {
            id: s.id || 0,
            code: s.code,
            name: s.name,
            type: s.type || 'THEORY',
            internalMarks: Number(s.internalMarks ?? 30),
            externalMarks: Number(s.externalMarks ?? 70),
            totalMarks: Number(s.totalMarks ?? 100),
            branch: bName,
            branches: bName ? [bName] : [],
            section: sName,
            sections: sName ? [sName] : [],
            examDate: deadlineInfo.examDate,
            examDateFormatted: deadlineInfo.examDateFormatted,
            deadlineDate: deadlineInfo.deadlineDate,
            deadlineFormatted: deadlineInfo.deadlineFormatted,
            isUpcoming: deadlineInfo.isUpcoming,
            isExpired: deadlineInfo.isExpired,
            isLocked: deadlineInfo.isLocked,
            isManuallyUnlocked: deadlineInfo.isManuallyUnlocked,
            lockReason: deadlineInfo.lockReason,
            override: deadlineInfo.override,
          };
          subjectCodeMap.set(cKey, subInfo);
          subjectList.push(subInfo);
        } else {
          const existing = subjectCodeMap.get(cKey);
          if (bName && !existing.branches.includes(bName)) {
            existing.branches.push(bName);
          }
          if (sName && !existing.sections.includes(sName)) {
            existing.sections.push(sName);
          }
        }
      }
    }

    // Per-subject metrics and student-subject detailed entries
    const studentEntries = [];
    const subjectSummaries = [];

    let totalExpectedEntries = 0;
    let totalSubmittedEntries = 0;
    let totalLockedEntries = 0;
    let totalUnlockedEntries = 0;

    let completedSubjectsCount = 0;
    let partiallySubmittedSubjectsCount = 0;
    let pendingSubjectsCount = 0;
    let lockedSubjectsCount = 0;
    let unlockedSubjectsCount = 0;

    let sNo = 1;

    for (const sub of subjectList) {
      const cKey = sub.code.toLowerCase();
      const enteredStudents = [];
      const missingStudents = [];

      // Determine eligible students for this subject
      const eligibleStudents = enrolledStudents.filter((student) => {
        const rKey = (student.rollNumber || '').trim().toLowerCase();
        // If student already has a mark entry for this subject in this exam, they are unequivocally eligible!
        if (marksMap.has(`${rKey}|${cKey}`) || unlinkedResultsMarksMap.has(`${rKey}|${cKey}`)) {
          return true;
        }

        const studentBranch = (student.branch || '').trim();
        // If student branch is general, empty, or ALL, allow them across the exam subjects
        if (!studentBranch || studentBranch.toUpperCase() === 'GENERAL' || studentBranch.toUpperCase() === 'ALL') {
          return true;
        }

        if (sub.branches && sub.branches.length > 0) {
          const isAll = sub.branches.some((b) => b.toUpperCase() === 'ALL');
          if (!isAll && !sub.branches.some((b) => b.toUpperCase() === studentBranch.toUpperCase())) {
            return false;
          }
        } else if (sub.branch && sub.branch.toUpperCase() !== 'ALL') {
          if (studentBranch.toUpperCase() !== sub.branch.toUpperCase()) {
            return false;
          }
        }
        if (sub.sections && sub.sections.length > 0) {
          const isAllSec = sub.sections.some((s) => s.toUpperCase() === 'ALL');
          if (!isAllSec && !sub.sections.some((s) => s.toUpperCase() === (student.section || '').toUpperCase())) {
            return false;
          }
        } else if (sub.section && sub.section.toUpperCase() !== 'ALL') {
          if (student.section && student.section.toUpperCase() !== sub.section.toUpperCase()) {
            return false;
          }
        }
        return true;
      });

      for (const student of eligibleStudents) {
        const rKey = (student.rollNumber || '').trim().toLowerCase();
        const markKey = `${rKey}|${cKey}`;
        const mark = marksMap.get(markKey);
        const resultsMark = unlinkedResultsMarksMap.get(markKey);
        const internalMarks = mark?.internalMarks ?? resultsMark?.internalMarks;

        // Distinctly handle 0 vs null/undefined
        const hasMarks = Boolean(
          internalMarks !== null && internalMarks !== undefined ||
          (mark &&
            (String(mark.category || '').toUpperCase() === 'INTERNAL' && mark.isAbsent)),
        );
        const marksObtained = hasMarks && internalMarks != null ? Number(internalMarks) : null;
        const isAbsent = hasMarks
          ? Boolean(mark?.isAbsent || resultsMark?.isAbsent)
          : false;
        const isEntered = Boolean(hasMarks);

        if (isEntered) {
          enteredStudents.push({
            rollNumber: student.rollNumber,
            name: student.name || 'N/A',
            branch: student.branch || 'GENERAL',
            section: student.section || null,
            marks: marksObtained,
            isAbsent,
            updatedAt: mark?.updatedAt || mark?.createdAt || null,
          });
          totalSubmittedEntries++;
        } else {
          missingStudents.push({
            rollNumber: student.rollNumber,
            name: student.name || 'N/A',
            branch: student.branch || 'GENERAL',
            section: student.section || null,
          });
        }

        totalExpectedEntries++;
        if (sub.isLocked) {
          totalLockedEntries++;
        } else {
          totalUnlockedEntries++;
        }

        studentEntries.push({
          sNo: sNo++,
          studentRollNumber: student.rollNumber,
          studentName: student.name || 'N/A',
          academicYear: exam.batch || '2024-25',
          college: exam.college || student.college || null,
          course: exam.course || student.course || null,
          yearOfStudy: exam.yearOfStudy || 1,
          semester: exam.semester || 1,
          branch: student.branch || exam.branch || 'GENERAL',
          section: student.section || '-',
          examNotificationName: exam.name,
          examType: exam.type || 'REGULAR',
          examDate: sub.examDate,
          subjectCode: sub.code,
          subjectName: sub.name,
          maxMarks: resultsMark?.maxInternalMarks ?? sub.internalMarks ?? 30,
          marksObtained,
          isAbsent,
          isEntered,
          marksEntryStatus: isEntered ? (isAbsent ? 'Absent' : 'Entered') : 'Not Entered',
          isLocked: sub.isLocked,
          lockStatus: sub.isLocked ? 'Locked' : 'Unlocked',
          lockReason: sub.lockReason,
          deadline: sub.deadlineFormatted,
          deadlineDate: sub.deadlineDate,
          isExpired: sub.isExpired,
          isManuallyUnlocked: sub.isManuallyUnlocked,
          marksEntryDate: mark?.updatedAt || mark?.createdAt || null,
          uploadedBy: mark?.uploadedBy || null,
        });
      }

      const eligibleCount = eligibleStudents.length;
      const enteredCount = enteredStudents.length;
      const notEnteredCount = eligibleCount - enteredCount;
      const submissionPercentage = eligibleCount > 0 ? Number(((enteredCount / eligibleCount) * 100).toFixed(1)) : 0;

      let completionStatus = 'PENDING';
      if (eligibleCount === 0) {
        completionStatus = 'NO_ELIGIBLE_STUDENTS';
      } else if (enteredCount === eligibleCount) {
        completionStatus = 'COMPLETED';
        completedSubjectsCount++;
      } else if (enteredCount > 0) {
        completionStatus = 'PARTIALLY_SUBMITTED';
        partiallySubmittedSubjectsCount++;
      } else {
        completionStatus = 'PENDING';
        pendingSubjectsCount++;
      }

      if (sub.isLocked) {
        lockedSubjectsCount++;
      } else {
        unlockedSubjectsCount++;
      }

      subjectSummaries.push({
        sNo: subjectSummaries.length + 1,
        subjectId: sub.id,
        subjectCode: sub.code,
        subjectName: sub.name,
        type: sub.type,
        maxMarks: sub.internalMarks,
        totalEligibleStudents: eligibleCount,
        marksEntered: enteredCount,
        marksNotEntered: notEnteredCount,
        submissionPercentage,
        completionStatus,
        isLocked: sub.isLocked,
        lockStatus: sub.isLocked ? 'Locked' : 'Unlocked',
        isManuallyUnlocked: sub.isManuallyUnlocked,
        lockReason: sub.lockReason,
        examDate: sub.examDate,
        examDateFormatted: sub.examDateFormatted,
        marksEntryDeadline: sub.deadlineFormatted,
        deadlineDate: sub.deadlineDate,
        isUpcoming: sub.isUpcoming,
        isExpired: sub.isExpired,
        branch: sub.branches && sub.branches.length > 0 ? sub.branches.join(', ') : sub.branch || 'ALL',
        facultyName: sub.override?.facultyName || null,
        facultyEmail: sub.override?.facultyEmail || null,
        unlockedBy: sub.override?.unlockedBy || null,
        unlockedAt: sub.override?.unlockedAt || null,
        enteredStudents,
        missingStudents,
      });
    }

    const overallPercentage = totalExpectedEntries > 0
      ? Number(((totalSubmittedEntries / totalExpectedEntries) * 100).toFixed(1))
      : 0;

    const summary = {
      notificationName: exam.name,
      examinationDate: exam.examinationStartDate
        ? `${exam.examinationStartDate}${exam.examinationEndDate ? ` to ${exam.examinationEndDate}` : ''}`
        : 'Not Scheduled',
      totalStudents: enrolledStudents.length,
      totalSubjects: subjectList.length,
      totalExpectedEntries,
      entriesSubmitted: totalSubmittedEntries,
      entriesNotEntered: totalExpectedEntries - totalSubmittedEntries,
      submissionPercentage: overallPercentage,
      lockedEntries: totalLockedEntries,
      unlockedEntries: totalUnlockedEntries,
      completedSubjects: completedSubjectsCount,
      partiallySubmittedSubjects: partiallySubmittedSubjectsCount,
      pendingSubjects: pendingSubjectsCount,
      lockedSubjects: lockedSubjectsCount,
      unlockedSubjects: unlockedSubjectsCount,
    };

    return {
      notification: {
        id: exam.id,
        name: exam.name,
        type: exam.type,
        course: exam.course,
        branch: exam.branch,
        batch: exam.batch,
        academicYear: exam.batch,
        yearOfStudy: exam.yearOfStudy,
        semester: exam.semester,
        regulationId: exam.regulationId,
        regulationCode: exam.regulation?.code || null,
        regulationName: exam.regulation?.name || null,
        examinationStartDate: exam.examinationStartDate,
        examinationEndDate: exam.examinationEndDate,
        status: exam.status,
      },
      formula: formula || null,
      branches: details?.branches || [],
      sections: Array.from(new Set(enrolledStudents.map((s) => s.section).filter(Boolean))),
      subjects: subjectSummaries,
      studentEntries,
      summary,
    };
  }

  /**
   * Unlock internal marks entry for an exam subject (or all subjects in exam).
   * Persists the unlock override and creates an audit log entry.
   */
  async unlockInternalMarks(notificationId, { subjectCode, reason, facultyName, facultyEmail }, actor = {}) {
    const exam = await this.examRepo.findOne({ where: { id: notificationId } });
    if (!exam) throw AppError.notFound('Examination notification not found');

    const code = String(subjectCode || 'ALL').trim().toUpperCase();
    const unlockReason = String(reason || 'Authorized administrative unlock').trim();
    const fName = facultyName ? String(facultyName).trim() : null;
    const fEmail = facultyEmail ? String(facultyEmail).trim() : null;
    const actorEmail = actor.email || actor.username || 'admin';
    const actorName = actor.fullName || actor.username || actor.email || 'Administrator';

    let lock = null;
    if (this.lockRepo) {
      lock = await this.lockRepo.findOne({
        where: { examId: notificationId, subjectCode: code },
      });

      if (lock) {
        lock.isUnlocked = true;
        lock.unlockedBy = actorName;
        lock.unlockedAt = new Date();
        lock.unlockReason = unlockReason;
        lock.facultyName = fName;
        lock.facultyEmail = fEmail;
        lock.relockedBy = null;
        lock.relockedAt = null;
      } else {
        lock = this.lockRepo.create({
          examId: notificationId,
          subjectCode: code,
          isUnlocked: true,
          unlockedBy: actorName,
          unlockedAt: new Date(),
          unlockReason,
          facultyName: fName,
          facultyEmail: fEmail,
        });
      }
      await this.lockRepo.save(lock);
    }

    // Log to EMS Audit Logs
    if (this.auditRepo) {
      try {
        const auditEntry = this.auditRepo.create({
          actorEmail,
          actorHrmsUserId: actor.hrmsUserId || null,
          action: 'INTERNAL_MARKS_UNLOCK',
          targetType: 'EXAM_SUBJECT',
          targetId: `${notificationId}:${code}`,
          detail: {
            notificationId,
            examName: exam.name,
            subjectCode: code,
            reason: unlockReason,
            unlockedBy: actorName,
            unlockedAt: new Date().toISOString(),
          },
        });
        await this.auditRepo.save(auditEntry);
      } catch (auditErr) {
        console.warn('Could not save unlock audit log:', auditErr.message);
      }
    }

    return {
      success: true,
      message: `Internal marks entry for ${code === 'ALL' ? 'all subjects' : `subject ${code}`} has been unlocked successfully.`,
      lock,
    };
  }

  /**
   * Relock internal marks entry for an exam subject.
   * Cancels manual unlock override so standard 4-day deadline rules re-apply.
   */
  async relockInternalMarks(notificationId, { subjectCode }, actor = {}) {
    const exam = await this.examRepo.findOne({ where: { id: notificationId } });
    if (!exam) throw AppError.notFound('Examination notification not found');

    const code = String(subjectCode || 'ALL').trim().toUpperCase();
    const actorEmail = actor.email || actor.username || 'admin';
    const actorName = actor.fullName || actor.username || actor.email || 'Administrator';

    let lock = null;
    if (this.lockRepo) {
      lock = await this.lockRepo.findOne({
        where: { examId: notificationId, subjectCode: code },
      });

      if (lock) {
        lock.isUnlocked = false;
        lock.relockedBy = actorName;
        lock.relockedAt = new Date();
        await this.lockRepo.save(lock);
      }
    }

    // Log to EMS Audit Logs
    if (this.auditRepo) {
      try {
        const auditEntry = this.auditRepo.create({
          actorEmail,
          actorHrmsUserId: actor.hrmsUserId || null,
          action: 'INTERNAL_MARKS_RELOCK',
          targetType: 'EXAM_SUBJECT',
          targetId: `${notificationId}:${code}`,
          detail: {
            notificationId,
            examName: exam.name,
            subjectCode: code,
            relockedBy: actorName,
            relockedAt: new Date().toISOString(),
          },
        });
        await this.auditRepo.save(auditEntry);
      } catch (auditErr) {
        console.warn('Could not save relock audit log:', auditErr.message);
      }
    }

    return {
      success: true,
      message: `Internal marks entry for ${code === 'ALL' ? 'all subjects' : `subject ${code}`} has been relocked. Standard deadline rules apply.`,
      lock,
    };
  }

  /**
   * Save individual or batch internal marks entries.
   * Validates deadlines/lock status before committing changes.
   */
  async saveInternalMarks(notificationId, rows, actor = {}) {
    const exam = await this.examRepo.findOne({
      where: { id: notificationId },
      relations: ['examSubjects', 'examSubjects.subject'],
    });
    if (!exam) throw AppError.notFound('Examination notification not found');

    const actorName = actor.fullName || actor.username || actor.email || 'Staff Desk';
    const uploadDto = {
      courseCategory: 'THEORY',
      rows: Array.isArray(rows) ? rows : [],
    };
    return this.uploadMarks('INTERNAL', notificationId, uploadDto, actorName);
  }

  /**
   * Calculate final internal marks from two or more mid-term exams.
   * Dynamically uses the regulation's internal calculation configuration from Settings if provided.
   *
   * @param {Array<number|{ marks: number, maxMarks?: number, isAbsent?: boolean }>} midEntries
   * @param {number|object} [ruleOrTargetMax=30]
   * @param {number} [minPass=16]
   */
  calculateWeightedInternalMarks(midEntries, ruleOrTargetMax = 30, minPass = 16) {
    if (this.regInternalSettings && typeof this.regInternalSettings.calculateInternalMarks === 'function') {
      const config = typeof ruleOrTargetMax === 'object' && ruleOrTargetMax !== null
        ? ruleOrTargetMax
        : { maxInternalMarks: ruleOrTargetMax, minPassMarks: minPass };
      return this.regInternalSettings.calculateInternalMarks(midEntries, config);
    }

    const config = typeof ruleOrTargetMax === 'object' && ruleOrTargetMax !== null
      ? ruleOrTargetMax
      : { maxInternalMarks: ruleOrTargetMax, minPassMarks: minPass, bestMidWeightage: 80, otherMidWeightage: 20 };

    const targetMax = Number(config.maxInternalMarks ?? 30);
    const passMarks = Number(config.minPassMarks ?? minPass);
    const bestWeight = Number(config.bestMidWeightage ?? 80);
    const otherWeight = Number(config.otherMidWeightage ?? 20);

    if (!Array.isArray(midEntries)) {
      return { marks: null, status: 'PENDING', isPass: null, minPass: passMarks, targetMax };
    }

    const validScores = [];
    for (const item of midEntries) {
      if (item === null || item === undefined) continue;
      if (typeof item === 'number') {
        if (!isNaN(item) && item >= 0) validScores.push(item);
      } else if (typeof item === 'object') {
        if (item.isAbsent) {
          validScores.push(0);
        } else if (item.marks !== null && item.marks !== undefined && !isNaN(Number(item.marks))) {
          const m = Number(item.marks);
          const max = Number(item.maxMarks) || targetMax;
          const normalized = max > 0 ? (m / max) * targetMax : m;
          validScores.push(normalized);
        }
      }
    }

    if (validScores.length < 2) {
      return {
        marks: null,
        status: 'PENDING',
        isPass: null,
        minPass: passMarks,
        targetMax,
        bestMid: validScores[0] ? Number(validScores[0].toFixed(2)) : null,
        secondMid: null,
      };
    }

    // Sort descending: best first, second-best second
    validScores.sort((a, b) => b - a);
    const best = validScores[0];
    const second = validScores[1];

    const finalMarks = Number((best * (bestWeight / 100) + second * (otherWeight / 100)).toFixed(2));
    const isPass = finalMarks >= passMarks;

    return {
      marks: finalMarks,
      status: isPass ? 'PASS' : 'FAIL',
      isPass,
      minPass: passMarks,
      targetMax,
      bestMid: Number(best.toFixed(2)),
      secondMid: Number(second.toFixed(2)),
    };
  }

  /**
   * Calculate internal marks specifically for an academic regulation.
   * Dynamically resolves the regulation's configured formula profile from the database.
   */
  async calculateInternalMarksForRegulation(midEntries, regulationIdOrCode) {
    let config = null;
    if (this.regInternalSettings && typeof this.regInternalSettings.getSettingForRegulation === 'function') {
      config = await this.regInternalSettings.getSettingForRegulation(regulationIdOrCode);
    }
    return this.calculateWeightedInternalMarks(midEntries, config);
  }
}

module.exports = { MarksService };
