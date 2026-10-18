'use strict';

/**
 * Script to apply Supply Exam directly to database
 * Specifically handles rejoined / irregular students applying for prior semester supply exams.
 *
 * Usage:
 *   node scripts/apply-student-supply.js [studentPin] [examCode] [subjectCodesCommaSeparated]
 * Example:
 *   node scripts/apply-student-supply.js 236T1A4309 21R23S2026 R2321051,R2321053,R2321054,R2321421
 */

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const { createStudentDataSource } = require('../src/database/student-data-source');

const SUBJECT_DEFINITIONS = [
  {
    code: 'R2321051',
    name: 'Discrete Mathematics & Graph Theory',
    type: 'theory',
    credits: 3.0,
    yearOfStudy: 2,
    semester: 1,
  },
  {
    code: 'R2321053',
    name: 'Advanced Data Structures & Algorithm Analysis',
    type: 'theory',
    credits: 3.0,
    yearOfStudy: 2,
    semester: 1,
  },
  {
    code: 'R2321054',
    name: 'Object Oriented Programming through Java',
    type: 'theory',
    credits: 3.0,
    yearOfStudy: 2,
    semester: 1,
  },
  {
    code: 'R2321421',
    name: 'Artificial Intelligence',
    type: 'theory',
    credits: 3.0,
    yearOfStudy: 2,
    semester: 1,
  },
];

async function run() {
  const studentPin = (process.argv[2] || '236T1A4309').trim();
  const examCode = (process.argv[3] || '21R23S2026').trim();
  const rawSubjectCodes = process.argv[4]
    ? process.argv[4].split(',').map((s) => s.trim().toUpperCase())
    : ['R2321051', 'R2321053', 'R2321054', 'R2321421'];

  console.log('===============================================================');
  console.log(`Starting Supply Exam Enrollment`);
  console.log(`Student PIN  : ${studentPin}`);
  console.log(`Exam Code    : ${examCode}`);
  console.log(`Subjects     : ${rawSubjectCodes.join(', ')}`);
  console.log('===============================================================\n');

  console.log('Connecting to databases...');
  const examDs = await createExamPortalDataSource();
  await examDs.initialize();

  const studentDs = await createStudentDataSource();
  await studentDs.initialize();

  try {
    // 1. Fetch Student Details from SDMS
    console.log(`\n--- 1. Searching Student Profile (${studentPin}) ---`);
    const rawStudents = await studentDs.query(
      `SELECT id, college, course, branch, batch, pin_no as pinNo, 
              admission_number as admissionNumber, student_name as studentName, 
              current_year as currentYear, current_semester as currentSemester, 
              section 
       FROM students 
       WHERE LOWER(pin_no) = LOWER(?) OR LOWER(admission_number) = LOWER(?) 
       LIMIT 1`,
      [studentPin, studentPin]
    );

    if (rawStudents.length === 0) {
      throw new Error(`Student with PIN "${studentPin}" not found in SDMS database.`);
    }

    const student = rawStudents[0];
    const rollNumber = (student.pinNo || student.admissionNumber).trim().toUpperCase();
    console.log(`Student Found:`);
    console.log(`- ID            : ${student.id}`);
    console.log(`- Name          : ${student.studentName}`);
    console.log(`- Roll / PIN    : ${rollNumber}`);
    console.log(`- Branch / Dept : ${student.branch}`);
    console.log(`- Course        : ${student.course || 'B.Tech'}`);
    console.log(`- Batch         : ${student.batch}`);
    console.log(`- Current Y/S   : Year ${student.currentYear}, Sem ${student.currentSemester} (Rejoined / Regular)`);

    // 2. Fetch Exam Notification
    console.log(`\n--- 2. Searching Exam Notification (${examCode}) ---`);
    const exams = await examDs.query(
      `SELECT id, name, type, allowedTypes, regulationId, college, course, branch, batch, 
              yearOfStudy, semester, status, packageFee, supplyFeeByCount, applicationEndDate, 
              examinationStartDate 
       FROM exams 
       WHERE name LIKE ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [`%${examCode}%`]
    );

    if (exams.length === 0) {
      throw new Error(`Exam Notification '${examCode}' not found.`);
    }

    const targetExam = exams[0];
    const examId = targetExam.id;
    console.log(`Exam Found:`);
    console.log(`- Exam ID       : ${examId}`);
    console.log(`- Name          : ${targetExam.name}`);
    console.log(`- Target Batch  : ${targetExam.batch}`);
    console.log(`- Target Y/S    : Year ${targetExam.yearOfStudy}, Sem ${targetExam.semester}`);
    console.log(`- Status        : ${targetExam.status}`);
    console.log(`- Allowed Types : ${targetExam.allowedTypes}`);

    const regulationId = targetExam.regulationId || 6; // Default to 6 (R23)

    // 3. Ensure Exam Scope includes Student's Branch and Batch
    console.log(`\n--- 3. Verifying / Updating Exam Scope ---`);
    const existingScopes = await examDs.query(
      `SELECT * FROM exam_scopes WHERE examId = ?`,
      [examId]
    );

    const studentBranch = (student.branch || '').trim();
    const studentBatch = (student.batch || '').trim();

    const hasMatchingScope = existingScopes.some(
      (s) =>
        (!s.batch || s.batch === studentBatch) &&
        (!s.branch || s.branch.trim().toLowerCase() === studentBranch.toLowerCase())
    );

    if (!hasMatchingScope) {
      console.log(`Adding exam_scopes row for Branch "${studentBranch}", Batch "${studentBatch}"...`);
      await examDs.query(
        `INSERT INTO exam_scopes (examId, college, course, branch, batch, yearOfStudy, semester) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          examId,
          targetExam.college || student.college || 'Pydah College of Engineering',
          student.course || 'B.Tech',
          studentBranch || 'CSE(AI)',
          studentBatch || '2024',
          targetExam.yearOfStudy || 2,
          targetExam.semester || 1,
        ]
      );
      console.log('Exam scope row added successfully.');
    } else {
      console.log('Exam scope already covers student.');
    }

    // 4. Ensure Subjects exist in subjects table
    console.log(`\n--- 4. Checking & Registering Subjects ---`);
    const resolvedSubjectIds = [];
    const resolvedSubjects = [];

    for (const code of rawSubjectCodes) {
      let subjects = await examDs.query(
        `SELECT id, regulationId, code, name, branchName, yearOfStudy, semester 
         FROM subjects 
         WHERE code = ?`,
        [code]
      );

      let subj = subjects[0];
      if (!subj) {
        // Create subject if not exists
        const def = SUBJECT_DEFINITIONS.find((d) => d.code === code) || {
          code,
          name: code,
          type: 'theory',
          credits: 3.0,
          yearOfStudy: 2,
          semester: 1,
        };

        console.log(`Subject '${code}' not found in database. Inserting into subjects table...`);
        const insertRes = await examDs.query(
          `INSERT INTO subjects (regulationId, collegeName, courseName, branchName, code, name, yearOfStudy, semester, type, credits, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
          [
            regulationId,
            targetExam.college || 'Pydah College of Engineering',
            student.course || 'B.Tech',
            studentBranch || 'CSE(AI)',
            def.code,
            def.name,
            def.yearOfStudy,
            def.semester,
            def.type,
            def.credits,
          ]
        );
        subj = {
          id: insertRes.insertId,
          code: def.code,
          name: def.name,
        };
        console.log(`Subject '${code}' created with ID: ${subj.id}`);
      } else {
        console.log(`Subject '${code}' found (ID: ${subj.id}, Name: ${subj.name})`);
      }

      resolvedSubjectIds.push(subj.id);
      resolvedSubjects.push(subj);

      // 5. Ensure Subject is linked in exam_subjects
      const linked = await examDs.query(
        `SELECT id FROM exam_subjects WHERE examId = ? AND subjectId = ?`,
        [examId, subj.id]
      );

      if (linked.length === 0) {
        console.log(`Linking Subject ID ${subj.id} (${subj.code}) to Exam ID ${examId}...`);
        await examDs.query(
          `INSERT INTO exam_subjects (examId, subjectId, branch, fee, examDate) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            examId,
            subj.id,
            studentBranch || 'CSE(AI)',
            0.0,
            targetExam.examinationStartDate || '2026-10-26',
          ]
        );
        console.log(`Linked subject to exam.`);
      }
    }

    // 6. Calculate Fee
    // 4 subjects supply fee = 970 (as confirmed on exam fee report)
    const baseFee = 970.0;
    const lateFee = 0.0;
    const totalAmount = 970.0;
    const feeBreakdown = [
      { subjectId: 0, subjectCode: `${resolvedSubjectIds.length} subjects`, fee: totalAmount },
    ];

    console.log(`\n--- 5. Fee Calculation ---`);
    console.log(`Total Subjects : ${resolvedSubjectIds.length}`);
    console.log(`Base Fee       : ₹${baseFee}`);
    console.log(`Total Amount   : ₹${totalAmount}`);
    console.log(`Status         : PAID (per Exam Fee Report)`);

    // 7. Create or Update ExamFeeRecord
    console.log(`\n--- 6. Updating Exam Fee Record ---`);
    const existingFeeRecords = await examDs.query(
      `SELECT id, status FROM exam_fee_records 
       WHERE examId = ? AND LOWER(studentRollNumber) = LOWER(?)`,
      [examId, rollNumber]
    );

    let feeRecordId;
    if (existingFeeRecords.length > 0) {
      feeRecordId = existingFeeRecords[0].id;
      console.log(`Existing Fee Record found (ID: ${feeRecordId}). Updating...`);
      await examDs.query(
        `UPDATE exam_fee_records 
         SET feeType = 'EXAM',
             feeLabel = NULL,
             examType = 'supply',
             selectedSubjectIds = ?,
             feeBreakdown = ?,
             baseFee = ?,
             lateFee = ?,
             totalAmount = ?,
             status = 'paid',
             dueDate = ?
         WHERE id = ?`,
        [
          JSON.stringify(resolvedSubjectIds),
          JSON.stringify(feeBreakdown),
          baseFee,
          lateFee,
          totalAmount,
          targetExam.applicationEndDate || '2026-10-17',
          feeRecordId,
        ]
      );
    } else {
      console.log(`Creating new Fee Record...`);
      const insertFeeRes = await examDs.query(
        `INSERT INTO exam_fee_records (examId, feeType, feeLabel, examType, studentRollNumber, studentName, selectedSubjectIds, feeBreakdown, baseFee, lateFee, totalAmount, status, dueDate, createdAt) 
         VALUES (?, 'EXAM', NULL, 'supply', ?, ?, ?, ?, ?, ?, ?, 'paid', ?, NOW())`,
        [
          examId,
          rollNumber,
          student.studentName,
          JSON.stringify(resolvedSubjectIds),
          JSON.stringify(feeBreakdown),
          baseFee,
          lateFee,
          totalAmount,
          targetExam.applicationEndDate || '2026-10-17',
        ]
      );
      feeRecordId = insertFeeRes.insertId;
      console.log(`Created Fee Record (ID: ${feeRecordId})`);
    }

    // 8. Record Offline Cash Payment
    console.log(`\n--- 7. Recording Payment Entry ---`);
    const receiptNumber = `REC-${examCode}-${rollNumber}`;
    const gatewayResp = JSON.stringify({
      bankName: null,
      offline: true,
      feeManagement: {
        transactionId: `6ac769e553372d8db0d07d${Math.floor(10 + Math.random() * 89)}`,
        receiptNumber: receiptNumber,
        feeHeadCode: 'EXM01',
        alreadyPosted: false,
        postedAt: new Date().toISOString(),
      },
    });

    const existingPayments = await examDs.query(
      `SELECT id FROM payments WHERE feeRecordId = ?`,
      [feeRecordId]
    );

    if (existingPayments.length > 0) {
      console.log(`Existing Payment found (ID: ${existingPayments[0].id}). Updating payment record...`);
      await examDs.query(
        `UPDATE payments 
         SET amountPaid = ?, paymentMode = 'offline', paymentMethod = 'cash', status = 'success', 
             collectedBy = 'MANTRAVADI RAMA SUBRAHMANYA SASTRY', collectorUsername = '2065', 
             remarks = ?, gatewayResponse = ? 
         WHERE feeRecordId = ?`,
        [totalAmount, 'Paid at college counter - Exam Fee Report', gatewayResp, feeRecordId]
      );
    } else {
      console.log(`Creating payment record with receipt ${receiptNumber}...`);
      await examDs.query(
        `INSERT INTO payments (feeRecordId, amountPaid, paymentMode, paymentMethod, status, receiptNumber, transactionReference, collectedBy, collectorUsername, remarks, gatewayResponse, paidAt) 
         VALUES (?, ?, 'offline', 'cash', 'success', ?, ?, 'MANTRAVADI RAMA SUBRAHMANYA SASTRY', '2065', 'Paid at college counter - Exam Fee Report', ?, NOW())`,
        [feeRecordId, totalAmount, receiptNumber, `OFFLINE-${rollNumber}`, gatewayResp]
      );
      console.log(`Payment record created.`);
    }

    // 9. Create or Update ExamApplication
    console.log(`\n--- 8. Updating Exam Application ---`);
    const existingApps = await examDs.query(
      `SELECT id FROM exam_applications 
       WHERE examId = ? AND LOWER(studentRollNumber) = LOWER(?)`,
      [examId, rollNumber]
    );

    let applicationId;
    if (existingApps.length > 0) {
      applicationId = existingApps[0].id;
      console.log(`Existing Application found (ID: ${applicationId}). Updating...`);
      await examDs.query(
        `UPDATE exam_applications 
         SET examType = 'supply',
             studentName = ?,
             studentBranch = ?,
             studentSection = ?,
             selectedSubjectIds = ?,
             feeBreakdown = ?,
             declarationAccepted = 1,
             consentAccepted = 1,
             feeRecordId = ? 
         WHERE id = ?`,
        [
          student.studentName,
          studentBranch || 'CSE(AI)',
          student.section || null,
          JSON.stringify(resolvedSubjectIds),
          JSON.stringify(feeBreakdown),
          feeRecordId,
          applicationId,
        ]
      );
    } else {
      console.log(`Creating new Exam Application...`);
      const insertAppRes = await examDs.query(
        `INSERT INTO exam_applications (examId, examType, studentRollNumber, studentName, studentBranch, studentSection, selectedSubjectIds, feeBreakdown, declarationAccepted, consentAccepted, feeRecordId, submittedAt) 
         VALUES (?, 'supply', ?, ?, ?, ?, ?, ?, 1, 1, ?, NOW())`,
        [
          examId,
          rollNumber,
          student.studentName,
          studentBranch || 'CSE(AI)',
          student.section || null,
          JSON.stringify(resolvedSubjectIds),
          JSON.stringify(feeBreakdown),
          feeRecordId,
        ]
      );
      applicationId = insertAppRes.insertId;
      console.log(`Created Exam Application (ID: ${applicationId})`);
    }

    console.log('\n===============================================================');
    console.log(' SUCCESS! Supply Exam Application Registered & Updated in DB');
    console.log('===============================================================');
    console.log(`Application ID    : ${applicationId}`);
    console.log(`Fee Record ID     : ${feeRecordId}`);
    console.log(`Receipt Number    : ${receiptNumber}`);
    console.log(`Student Roll No   : ${rollNumber}`);
    console.log(`Student Name      : ${student.studentName}`);
    console.log(`Exam Notification : ${targetExam.name} (ID: ${examId})`);
    console.log(`Enrollment Type   : Supply`);
    console.log(`Fee Paid          : ₹${totalAmount}`);
    console.log(`Registered Papers :`);
    resolvedSubjects.forEach((s, idx) => {
      console.log(`  ${idx + 1}. [${s.code}] ${s.name} (Subject ID: ${s.id})`);
    });
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\nERROR Applying Supply Exam:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await examDs.destroy();
    await studentDs.destroy();
  }
}

run();
