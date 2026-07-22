'use strict';

/**
 * UAT for the two new rules (runs on a throwaway SQLite DB, never RDS):
 *  1. Supply applications only allow subjects whose latest result is failed;
 *     passed subjects report grade + grade points and are blocked.
 *  2. One application per student per examination (Regular XOR Supply).
 * Usage: node scripts/uat-supply-flow.js
 */

process.env.SIMULATE_USE_SQLITE = 'true';
process.env.SIMULATE_SQLITE_PATH = `./data/uat-${Date.now()}.sqlite`;
process.env.JWT_SECRET = 'uat-secret';

const { SubjectType } = require('../src/subjects/schemas/subject.enums');
const { ExamType, ExamStatus } = require('../src/exam/schemas/exam.enums');

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step}${detail ? ` — ${detail}` : ''}`);
}

// Fake SDMS: two students in scope Y3/S5 CSE, one student who moved ahead.
const STUDENTS = {
  1: {
    id: 1,
    studentName: 'Alice Exact',
    pinNo: '21CS001',
    admissionNumber: '21CS001',
    college: 'Simulation College',
    course: 'B.Tech',
    branch: 'CSE',
    batch: '2022-2026',
    section: null,
    currentYear: 3,
    currentSemester: 5,
  },
  2: {
    id: 2,
    studentName: 'Bob Exact',
    pinNo: '21CS002',
    admissionNumber: '21CS002',
    college: 'Simulation College',
    course: 'B.Tech',
    branch: 'CSE',
    batch: '2022-2026',
    section: null,
    currentYear: 3,
    currentSemester: 5,
  },
  3: {
    id: 3,
    studentName: 'Carol Ahead',
    pinNo: '21CS003',
    admissionNumber: '21CS003',
    college: 'Simulation College',
    course: 'B.Tech',
    branch: 'CSE',
    batch: '2022-2026',
    section: null,
    currentYear: 3,
    currentSemester: 6,
  },
};

const fakeSdms = {
  async getStudent(id) {
    return STUDENTS[id] ?? null;
  },
  async listStudents() {
    return { items: Object.values(STUDENTS), totalPages: 1 };
  },
};

async function expectReject(step, promise, messagePart) {
  try {
    await promise;
    record(step, false, 'expected rejection but it succeeded');
  } catch (err) {
    const ok = !messagePart || String(err.message).toLowerCase().includes(messagePart.toLowerCase());
    record(step, ok, `error="${err.message}"`);
  }
}

async function run() {
  const { createExamPortalDataSource } = require('../src/database/data-source');
  const { createServices } = require('../src/database/container');
  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  const services = createServices(dataSource);
  services.exam.sdms = fakeSdms;
  services.results.sdms = fakeSdms;

  try {
    const regulation = await services.regulations.create({
      code: 'R20',
      name: 'Regulation 2020',
      effectiveDate: '2020-01-01',
      scopes: [
        {
          collegeId: 1,
          collegeName: 'Simulation College',
          courseId: 1,
          courseName: 'B.Tech',
          batches: ['2022-2026'],
        },
      ],
    });
    const subjectDefs = [
      ['CS501', 'Operating Systems'],
      ['CS502', 'DBMS'],
      ['CS503', 'Computer Networks'],
    ];
    const subjects = [];
    for (const [code, name] of subjectDefs) {
      subjects.push(
        await services.subjects.create({
          regulationId: regulation.id,
          code,
          name,
          type: SubjectType.THEORY,
          credits: 3,
          internalMarks: 40,
          externalMarks: 60,
        }),
      );
    }
    await services.subjects.createMapping({
      regulationId: regulation.id,
      assignments: subjects.map((s) => ({
        subjectId: s.id,
        collegeId: 1,
        collegeName: 'Simulation College',
        courseId: 1,
        courseName: 'B.Tech',
        branchId: 1,
        branchName: 'CSE',
        batch: '2022-2026',
        yearOfStudy: 3,
        semester: 5,
        sectionMode: 'all',
      })),
    });

    const makeExam = async (name) => {
      const exam = await services.exam.create({
        name,
        types: [ExamType.REGULAR, ExamType.SUPPLY],
        regulationId: regulation.id,
        college: 'Simulation College',
        course: 'B.Tech',
        branch: 'CSE',
        batch: '2022-2026',
        yearOfStudy: 3,
        semester: 5,
        subjects: subjects.map((s, i) => ({
          subjectId: s.id,
          fee: 180,
          examDate: `2026-08-${10 + i * 2}`,
        })),
        packageFee: 500,
        applicationStartDate: '2026-07-01',
        applicationEndDate: '2026-07-31',
        examinationStartDate: '2026-08-10',
        examinationEndDate: '2026-08-20',
        submitForApproval: true,
      });
      await services.exam.approve(exam.id, 'admin');
      const published = await services.exam.publish(exam.id, {});
      return published;
    };

    const exam1 = await makeExam('B.Tech 5th Sem — May attempt');
    record('Setup: exam 1 published with Regular+Supply', exam1.status === ExamStatus.PUBLISHED);

    // ── UAT 1: Alice applies Regular on exam 1 ──
    const aliceRegular = await services.exam.createStudentApplication(exam1.id, 1, {
      examType: ExamType.REGULAR,
      selectedSubjectIds: subjects.map((s) => s.id),
      declarationAccepted: true,
      consentAccepted: true,
    });
    record(
      'Alice applies Regular on exam 1',
      aliceRegular.application.examType === ExamType.REGULAR &&
        aliceRegular.application.selectedSubjectIds.length === 3,
    );

    // Rule 2: same exam, second type must be rejected
    await expectReject(
      'Rule 2: Alice Supply on SAME exam rejected',
      services.exam.createStudentApplication(exam1.id, 1, {
        examType: ExamType.SUPPLY,
        declarationAccepted: true,
        consentAccepted: true,
      }),
      'already applied for this examination as regular',
    );

    // Rule 2: openTypes must be empty after any application
    const exam1Detail = await services.exam.getPublishedExamForStudent(exam1.id, 1);
    record(
      'Rule 2: openTypes empty + alreadyApplied after Regular',
      exam1Detail.openTypes.length === 0 && exam1Detail.alreadyApplied === true,
      `openTypes=[${exam1Detail.openTypes}]`,
    );
    const aliceList = await services.exam.listPublishedExamsForStudent(1);
    const exam1Row = aliceList.find((e) => e.id === exam1.id);
    record(
      'Rule 2: exam list shows no open types for exam 1',
      exam1Row && exam1Row.openTypes.length === 0 && exam1Row.alreadyApplied === true,
    );

    // Post results for exam 1: CS501 pass (A, 8 GP), CS502 fail (F, 0), CS503 absent
    const upload = await services.results.uploadResults(
      exam1.id,
      {
        fileName: 'uat.xlsx',
        rows: [
          { rollNumber: '21CS001', subjectCode: 'CS501', grade: 'A', gradePoints: 8, result: 'P', credits: 3 },
          { rollNumber: '21CS001', subjectCode: 'CS502', grade: 'F', gradePoints: 0, result: 'F', credits: 3 },
          { rollNumber: '21CS001', subjectCode: 'CS503', grade: 'AB', credits: 3 },
        ],
      },
      'uat',
    );
    record('Results posted with grade points', upload.success === true, `inserted=${upload.inserted}`);
    const examResults = await services.results.getExamResults(exam1.id);
    const cs501 = examResults.students[0]?.subjects.find((s) => s.subjectCode === 'CS501');
    record('Grade points stored and returned', cs501?.gradePoints === 8, `CS501 gradePoints=${cs501?.gradePoints}`);

    // ── Supply exam (exam 2), same scope/semester ──
    const exam2 = await makeExam('B.Tech 5th Sem — Supply attempt');

    // Rule 1: detail must flag passed subject as not selectable, with grade info
    const supplyDetail = await services.exam.getPublishedExamForStudent(exam2.id, 1);
    const byCode = new Map(supplyDetail.exam.subjects.map((s) => [s.code, s]));
    const st501 = byCode.get('CS501')?.supplyStatus;
    const st502 = byCode.get('CS502')?.supplyStatus;
    const st503 = byCode.get('CS503')?.supplyStatus;
    record(
      'Rule 1: passed CS501 not eligible, shows grade+GP',
      st501 && st501.eligible === false && st501.passed === true && st501.grade === 'A' && st501.gradePoints === 8,
      JSON.stringify(st501),
    );
    record(
      'Rule 1: failed CS502 eligible for supply',
      st502 && st502.eligible === true && st502.passed === false,
      JSON.stringify(st502),
    );
    record(
      'Rule 1: absent CS503 eligible for supply',
      st503 && st503.eligible === true,
      JSON.stringify(st503),
    );

    // Rule 1: applying supply including the passed subject must fail
    await expectReject(
      'Rule 1: Supply apply including passed CS501 rejected',
      services.exam.createStudentApplication(exam2.id, 1, {
        examType: ExamType.SUPPLY,
        selectedSubjectIds: subjects.map((s) => s.id),
        declarationAccepted: true,
        consentAccepted: true,
      }),
      'only subjects whose latest result is not passed',
    );

    // Rule 1: empty selection defaults to failed subjects only (no package fee)
    const aliceSupply = await services.exam.createStudentApplication(exam2.id, 1, {
      examType: ExamType.SUPPLY,
      declarationAccepted: true,
      consentAccepted: true,
    });
    const supplyCodes = aliceSupply.application.feeBreakdown.map((b) => b.subjectCode).sort();
    record(
      'Rule 1: default Supply selection = failed subjects only',
      aliceSupply.application.selectedSubjectIds.length === 2 &&
        supplyCodes.join(',') === 'CS502,CS503',
      `subjects=${supplyCodes.join(',')}, baseFee=${aliceSupply.feeRecord.baseFee}`,
    );
    record(
      'Rule 1: subject-wise fee (no package) for partial supply',
      Number(aliceSupply.feeRecord.baseFee) === 360,
      `baseFee=${aliceSupply.feeRecord.baseFee}`,
    );

    // Bob has no results at all → cannot apply supply
    await expectReject(
      'Rule 1: Supply without any failed results rejected (Bob)',
      services.exam.createStudentApplication(exam2.id, 2, {
        examType: ExamType.SUPPLY,
        declarationAccepted: true,
        consentAccepted: true,
      }),
      'no failed subjects',
    );

    // Bob applies Regular on exam 2, then Supply on same exam → rejected
    await services.exam.createStudentApplication(exam2.id, 2, {
      examType: ExamType.REGULAR,
      declarationAccepted: true,
      consentAccepted: true,
    });
    await expectReject(
      'Rule 2: Bob second application on exam 2 rejected',
      services.exam.createStudentApplication(exam2.id, 2, {
        examType: ExamType.SUPPLY,
        declarationAccepted: true,
        consentAccepted: true,
      }),
      'already applied for this examination',
    );

    // Carol (ahead, Y3/S6) sees Supply only; no results → supply blocked
    const carolTypes = await services.exam
      .getPublishedExamForStudent(exam2.id, 3)
      .then((d) => d.exam.allowedTypes);
    record(
      'Ahead student offered Supply only (never Regular)',
      carolTypes.length === 1 && carolTypes[0] === ExamType.SUPPLY,
      `allowedTypes=[${carolTypes}]`,
    );
    await expectReject(
      'Ahead student without failed results cannot apply Supply',
      services.exam.createStudentApplication(exam2.id, 3, {
        examType: ExamType.SUPPLY,
        declarationAccepted: true,
        consentAccepted: true,
      }),
      'no failed subjects',
    );

    // ── Multi-attempt: post supply results on exam 2, check exam 3 ──
    // Alice passes CS502 on supply (B, 7 GP) but fails CS503 again.
    const supplyUpload = await services.results.uploadResults(
      exam2.id,
      {
        fileName: 'uat-supply.xlsx',
        rows: [
          { rollNumber: '21CS001', subjectCode: 'CS502', grade: 'B', gradePoints: 7, result: 'P', credits: 3 },
          { rollNumber: '21CS001', subjectCode: 'CS503', grade: 'F', gradePoints: 0, result: 'F', credits: 3 },
        ],
      },
      'uat',
    );
    record('Supply results posted as attempt 2', supplyUpload.success === true);

    const exam3 = await makeExam('B.Tech 5th Sem — Second supply attempt');
    const detail3 = await services.exam.getPublishedExamForStudent(exam3.id, 1);
    const byCode3 = new Map(detail3.exam.subjects.map((s) => [s.code, s]));
    const s502v2 = byCode3.get('CS502')?.supplyStatus;
    const s503v2 = byCode3.get('CS503')?.supplyStatus;
    record(
      'Latest attempt wins: CS502 now passed → not eligible (B, 7 GP)',
      s502v2 && s502v2.eligible === false && s502v2.grade === 'B' && s502v2.gradePoints === 7 && s502v2.attemptNumber === 2,
      JSON.stringify(s502v2),
    );
    record(
      'Latest attempt wins: CS503 failed again → still eligible',
      s503v2 && s503v2.eligible === true && s503v2.attemptNumber === 2,
      JSON.stringify(s503v2),
    );
    const aliceSupply2 = await services.exam.createStudentApplication(exam3.id, 1, {
      examType: ExamType.SUPPLY,
      declarationAccepted: true,
      consentAccepted: true,
    });
    record(
      'Second supply application covers only CS503',
      aliceSupply2.application.selectedSubjectIds.length === 1 &&
        aliceSupply2.application.feeBreakdown[0]?.subjectCode === 'CS503',
      `baseFee=${aliceSupply2.feeRecord.baseFee}`,
    );

    // DB-level backstop: unique index on (examId, studentRollNumber)
    let dbBlocked = false;
    try {
      const repo = dataSource.getRepository('ExamApplication');
      await repo.save(
        repo.create({
          examId: exam1.id,
          examType: ExamType.SUPPLY,
          studentRollNumber: '21CS001',
          studentName: 'Alice Exact',
          selectedSubjectIds: [subjects[1].id],
          feeBreakdown: [],
          declarationAccepted: true,
          consentAccepted: true,
          feeRecordId: aliceRegular.feeRecord.id,
        }),
      );
    } catch {
      dbBlocked = true;
    }
    record('Rule 2: DB unique index blocks direct duplicate insert', dbBlocked);
  } catch (err) {
    record('Unexpected error', false, err.message);
    console.error(err);
  }

  await dataSource.destroy();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('\n========== UAT REPORT ==========');
  console.log(`Passed: ${passed} / ${results.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
