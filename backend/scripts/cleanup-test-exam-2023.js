'use strict';

const { createExamPortalDataSource } = require('../src/database/data-source');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  const regulationRepo = ds.getRepository('Regulation');
  const subjectRepo = ds.getRepository('Subject');
  const examRepo = ds.getRepository('Exam');
  const feeRecordRepo = ds.getRepository('ExamFeeRecord');

  const regCode = 'R2023BTECH';
  const reg = await regulationRepo.findOne({ where: { code: regCode } });
  if (!reg) {
    console.log('No test regulation found. Nothing to clean.');
    await ds.destroy();
    return;
  }

  // Delete fee records for exams under this regulation
  const exams = await examRepo.find({ where: { regulationId: reg.id } });
  for (const e of exams) {
    const fees = await feeRecordRepo.find({ where: { examId: e.id } });
    for (const f of fees) {
      await feeRecordRepo.delete({ id: f.id });
      console.log('Deleted fee record', f.id);
    }
  }

  // Delete exams
  for (const e of exams) {
    await examRepo.delete({ id: e.id });
    console.log('Deleted exam', e.id);
  }

  // Delete subjects
  const subjects = await subjectRepo.find({ where: { regulationId: reg.id } });
  for (const s of subjects) {
    await subjectRepo.delete({ id: s.id });
    console.log('Deleted subject', s.id);
  }

  // Delete regulation scopes and regulation
  await regulationRepo.delete({ id: reg.id });
  console.log('Deleted regulation', reg.id);

  await ds.destroy();
}

main().catch((err) => {
  console.error('Failed to cleanup test exam:', err);
  process.exit(1);
});
