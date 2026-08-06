'use strict';

const { createExamPortalDataSource } = require('../src/database/data-source');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  const examRepo = ds.getRepository('Exam');
  const examSubjectRepo = ds.getRepository('ExamSubject');

  const examId = 3; // test exam
  const exam = await examRepo.findOne({ where: { id: examId } });
  if (!exam) {
    console.error('Exam not found id', examId);
    await ds.destroy();
    process.exit(1);
  }

  const startDate = exam.examinationStartDate
    ? new Date(exam.examinationStartDate)
    : new Date('2026-08-14');

  const subjects = exam.examSubjects || [];
  if (!subjects.length) {
    console.log('No exam subjects found for exam', examId);
    await ds.destroy();
    return;
  }

  // Assign sequential dates starting from startDate, one subject per day
  let current = new Date(startDate);
  for (let i = 0; i < subjects.length; i++) {
    const s = subjects[i];
    s.examDate = new Date(current);
    s.session = 'FN';
    s.startTime = '09:00';
    s.durationMinutes = 180;
    await examSubjectRepo.save(s);
    console.log(`Updated subject id ${s.id} examDate ${s.examDate.toISOString().slice(0,10)}`);
    // next day
    current.setDate(current.getDate() + 1);
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Failed to set subject dates:', err);
  process.exit(1);
});
