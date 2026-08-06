'use strict';

const { createExamPortalDataSource } = require('../src/database/data-source');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  const regulationRepo = ds.getRepository('Regulation');
  const scopeRepo = ds.getRepository('RegulationScope');
  const subjectRepo = ds.getRepository('Subject');
  const examRepo = ds.getRepository('Exam');
  const examSubjectRepo = ds.getRepository('ExamSubject');
  const examScopeRepo = ds.getRepository('ExamScope');
  const feeRecordRepo = ds.getRepository('ExamFeeRecord');

  // Create regulation
  const regCode = 'R2023BTECH';
  let reg = await regulationRepo.findOne({ where: { code: regCode } });
  if (!reg) {
    reg = regulationRepo.create({
      code: regCode,
      name: 'B.Tech Regulation 2023',
      description: 'Test regulation for B.Tech batch 2023',
    });
    reg = await regulationRepo.save(reg);
    console.log('Created regulation id', reg.id);
  } else {
    console.log('Regulation already exists id', reg.id);
  }

  // Create scope: Pydah College, B.Tech, batch 2023
  const collegeId = 1;
  const courseId = 1;
  const batch = '2023';
  let scope = await scopeRepo.findOne({ where: { regulationId: reg.id, collegeId, courseId, batch } });
  if (!scope) {
    scope = scopeRepo.create({
      regulationId: reg.id,
      collegeId,
      collegeName: 'Pydah College of Engineering',
      courseId,
      courseName: 'B.Tech',
      batch,
    });
    scope = await scopeRepo.save(scope);
    console.log('Created regulation scope id', scope.id);
  } else {
    console.log('Scope already exists id', scope.id);
  }

  // Create two subjects mapped to CSE branch, year 4 sem 1
  const subjectsToCreate = [
    { code: 'CSE401', name: 'Advanced Topics I' },
    { code: 'CSE402', name: 'Advanced Topics II' },
  ];
  const createdSubjects = [];
  for (const s of subjectsToCreate) {
    let subj = await subjectRepo.findOne({ where: { regulationId: reg.id, code: s.code } });
    if (!subj) {
      subj = subjectRepo.create({
        regulationId: reg.id,
        code: s.code,
        name: s.name,
        courseId,
        courseName: 'B.Tech',
        branchName: 'CSE',
        yearOfStudy: 4,
        semester: 1,
      });
      subj = await subjectRepo.save(subj);
      console.log('Created subject', subj.code, 'id', subj.id);
    } else {
      console.log('Subject exists', subj.code, 'id', subj.id);
    }
    createdSubjects.push(subj);
  }

  // Create exam with package fee = 1.00
  const examName = 'B.Tech 2023 CSE Sem1 - Test Exam';
  let exam = await examRepo.findOne({ where: { name: examName } });
  if (!exam) {
    const examSubjects = createdSubjects.map((s) => ({ subjectId: s.id, fee: 0.5 }));
    const scopes = [
      {
        course: 'B.Tech',
        branch: 'CSE',
        batch,
        yearOfStudy: 4,
        semester: 1,
      },
    ];
    exam = examRepo.create({
      name: examName,
      regulationId: reg.id,
      course: 'B.Tech',
      branch: 'CSE',
      batch,
      yearOfStudy: 4,
      semester: 1,
      packageFee: 1.0,
      packageFees: null,
      examSubjects,
      scopes,
      status: 'DRAFT',
    });
    exam = await examRepo.save(exam);
    console.log('Created exam id', exam.id);
  } else {
    console.log('Exam already exists id', exam.id);
  }

  // Create fee record for a test student
  const feeRecordStudentRoll = 'TEST2023CSE1';
  let feeRecord = await feeRecordRepo.findOne({ where: { examId: exam.id, studentRollNumber: feeRecordStudentRoll } });
  if (!feeRecord) {
    const selectedSubjectIds = createdSubjects.map((s) => s.id);
    const feeBreakdown = [{ name: 'package', amount: 1.0 }];
    feeRecord = feeRecordRepo.create({
      examId: exam.id,
      studentRollNumber: feeRecordStudentRoll,
      studentName: 'Test Student',
      selectedSubjectIds,
      feeBreakdown,
      baseFee: 1.0,
      totalAmount: 1.0,
    });
    feeRecord = await feeRecordRepo.save(feeRecord);
    console.log('Created fee record id', feeRecord.id);
  } else {
    console.log('Fee record exists id', feeRecord.id);
  }

  console.log('\nSeed summary:');
  console.log('Regulation:', reg.id);
  console.log('Subjects:', createdSubjects.map((s) => s.id));
  console.log('Exam:', exam.id);
  console.log('FeeRecord:', feeRecord.id);

  await ds.destroy();
}

main().catch((err) => {
  console.error('Failed to seed test exam:', err);
  process.exit(1);
});
