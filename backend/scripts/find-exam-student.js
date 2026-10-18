'use strict';
require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const { createStudentDataSource } = require('../src/database/student-data-source');

async function main() {
  const examDs = await createExamPortalDataSource();
  const studentDs = await createStudentDataSource();

  console.log('=== EXAMS ===');
  const exams = await examDs.query("SELECT id, name, type, batch, yearOfStudy, semester FROM exams WHERE name LIKE '%22BT23JNT26%' OR name LIKE '%Supply%' OR name LIKE '%2-2%'");
  console.log(JSON.stringify(exams, null, 2));

  console.log('=== SUBJECTS ===');
  const subjects = await examDs.query("SELECT id, subjectCode, subjectName FROM subjects WHERE subjectCode LIKE '%R2322052%' OR subjectName LIKE '%Probability%'");
  console.log(JSON.stringify(subjects, null, 2));

  console.log('=== REJOINED / 2024 STUDENTS ===');
  const students = await studentDs.query("SELECT id, pinNo, admissionNumber, studentName, branch, batch, currentYear, currentSemester FROM sdms_students WHERE batch = '2024'");
  console.log(JSON.stringify(students, null, 2));

  await examDs.destroy();
  await studentDs.destroy();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
