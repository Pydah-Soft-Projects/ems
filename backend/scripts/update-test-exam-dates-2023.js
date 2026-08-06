'use strict';

const { createExamPortalDataSource } = require('../src/database/data-source');
const { ExamStatus } = require('../src/exam/schemas/exam.enums');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  const examRepo = ds.getRepository('Exam');
  const lateFeeSlabRepo = ds.getRepository('LateFeeSlab');

  const examId = 3; // test exam created earlier
  const exam = await examRepo.findOne({ where: { id: examId } });
  if (!exam) {
    console.error('Exam not found id', examId);
    await ds.destroy();
    process.exit(1);
  }

  // Dates based on user request
  const applicationStartDate = new Date('2026-08-06');
  const applicationEndDate = new Date('2026-08-15');
  const examinationStartDate = new Date('2026-08-14');
  const examinationEndDate = new Date('2026-08-30');
  const lateFeeStartDate = new Date('2026-08-08');

  exam.applicationStartDate = applicationStartDate;
  exam.applicationEndDate = applicationEndDate;
  exam.examinationStartDate = examinationStartDate;
  exam.examinationEndDate = examinationEndDate;
  exam.lateFeeStartDate = lateFeeStartDate;
  exam.status = ExamStatus.PENDING_APPROVAL;

  await examRepo.save(exam);
  console.log('Updated exam dates and status for exam id', examId);

  // Add a single late-fee slab of amount 1.00 starting from lateFeeStartDate
  const existingSlabs = await lateFeeSlabRepo.find({ where: { examId } });
  if (existingSlabs && existingSlabs.length) {
    console.log('Existing late fee slabs found, leaving them intact.');
  } else {
    const slab = lateFeeSlabRepo.create({
      examId,
      fromDate: lateFeeStartDate,
      toDate: null,
      amount: 1.0,
    });
    const saved = await lateFeeSlabRepo.save(slab);
    console.log('Created late fee slab id', saved.id);
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Failed to update exam:', err);
  process.exit(1);
});
