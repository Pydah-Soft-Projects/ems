'use strict';

/**
 * Seed Pydah College of Engineering · B.Tech · Batch 2000
 * - Regulation R2000
 * - Year 1 Sem 1 subjects + branch mappings
 * - Regular exam published with package fee ₹1
 *
 * Usage: node scripts/seed-pydah-btech-batch-2000.js
 */

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const { createStudentDataSource } = require('../src/database/student-data-source');
const { createServices } = require('../src/database/container');
const { ExamType, ExamStatus } = require('../src/exam/schemas/exam.enums');
const { SubjectType } = require('../src/subjects/schemas/subject.enums');

const COLLEGE_NAME = 'Pydah College of Engineering';
const COURSE_NAME = 'B.Tech';
const BATCH = '2000';
const REG_CODE = 'R2000';
const YEAR = 1;
const SEM = 1;
const PACKAGE_FEE = 1;

const Y1S1_SUBJECTS = [
  {
    code: 'R2000Y1S1A',
    name: 'Linear Algebra & Calculus',
    type: SubjectType.THEORY,
    credits: 4,
    fee: 1,
  },
  {
    code: 'R2000Y1S1B',
    name: 'Engineering Physics',
    type: SubjectType.THEORY,
    credits: 3,
    fee: 1,
  },
  {
    code: 'R2000Y1S1C',
    name: 'Programming for Problem Solving',
    type: SubjectType.THEORY,
    credits: 3,
    fee: 1,
  },
  {
    code: 'R2000Y1S1D',
    name: 'Programming for Problem Solving Lab',
    type: SubjectType.LABORATORY,
    credits: 1.5,
    fee: 1,
  },
];

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function dateWindow() {
  const today = new Date();
  const appStart = new Date(today);
  appStart.setDate(appStart.getDate() - 7);
  const appEnd = new Date(today);
  appEnd.setDate(appEnd.getDate() + 20);
  const examStart = new Date(today);
  examStart.setDate(examStart.getDate() + 25);
  const examEnd = new Date(today);
  examEnd.setDate(examEnd.getDate() + 40);
  return {
    applicationStartDate: iso(appStart),
    applicationEndDate: iso(appEnd),
    examinationStartDate: iso(examStart),
    examinationEndDate: iso(examEnd),
    examStart,
  };
}

async function main() {
  const examDs = createExamPortalDataSource();
  const studentDs = createStudentDataSource();
  await examDs.initialize();
  await studentDs.initialize();
  const services = createServices(examDs, studentDs);

  try {
    const colleges = await services.sdms.listColleges(false);
    const college = colleges.find(
      (c) => c.name?.toLowerCase() === COLLEGE_NAME.toLowerCase(),
    );
    if (!college) throw new Error(`${COLLEGE_NAME} not found in SDMS`);

    const courses = await services.sdms.listCourses(college.id, false);
    const course = courses.find(
      (c) =>
        c.name?.toLowerCase() === COURSE_NAME.toLowerCase() ||
        /^b\.?tech$/i.test(c.code || ''),
    );
    if (!course) throw new Error('B.Tech course not found');

    const branches = await services.sdms.listBranches(course.id);
    if (!branches.length) throw new Error('No B.Tech branches found');

    const students = await services.sdms.listStudents({
      collegeId: college.id,
      courseId: course.id,
      batch: BATCH,
      limit: 5,
    });
    console.log(`College:  ${college.name}`);
    console.log(`Course:   ${course.name}`);
    console.log(`Branches: ${branches.map((b) => b.name).join(', ')}`);
    console.log(
      `Batch ${BATCH} students: ${students.total ?? students.items?.length ?? 0}`,
    );

    // ── Regulation ──
    const allRegs = await services.regulations.findAll();
    let regulation = allRegs.find((r) => r.code === REG_CODE);
    if (regulation) {
      console.log(`Regulation ${REG_CODE} already exists (id=${regulation.id})`);
      regulation = await services.regulations.findOne(regulation.id);
    } else {
      regulation = await services.regulations.create({
        code: REG_CODE,
        name: 'Regulation 2000 (B.Tech)',
        effectiveDate: '2000-06-01',
        description:
          'R2000 for Pydah College of Engineering B.Tech batch 2000 — Y1S1 test package ₹1',
        scopes: [
          {
            collegeId: college.id,
            collegeName: college.name,
            courseId: course.id,
            courseName: course.name,
            batches: [BATCH],
          },
        ],
      });
      console.log(`Created regulation ${REG_CODE} (id=${regulation.id})`);
    }

    // ── Subjects ──
    const existingSubjects = await services.subjects.findAll(regulation.id);
    const byCode = new Map(existingSubjects.map((s) => [s.code, s]));
    const subjects = [];
    for (const spec of Y1S1_SUBJECTS) {
      if (byCode.has(spec.code)) {
        subjects.push(byCode.get(spec.code));
        continue;
      }
      const created = await services.subjects.create({
        code: spec.code,
        name: spec.name,
        type: spec.type,
        credits: spec.credits,
        regulationId: regulation.id,
        yearOfStudy: YEAR,
        semester: SEM,
        internalMarks: 30,
        externalMarks: 70,
      });
      subjects.push(created);
      console.log(`  subject ${created.code}`);
    }
    console.log(`Subjects ready: ${subjects.length}`);

    // ── Mappings (all branches) ──
    for (const branch of branches) {
      const assignments = subjects.map((sub) => ({
        subjectId: sub.id,
        collegeId: college.id,
        collegeName: college.name,
        courseId: course.id,
        courseName: course.name,
        branchId: branch.id,
        branchName: branch.name,
        batch: BATCH,
        yearOfStudy: YEAR,
        semester: SEM,
        sectionMode: 'all',
      }));
      try {
        await services.subjects.createMapping({
          regulationId: regulation.id,
          assignments,
        });
        console.log(`  mapped Y${YEAR}S${SEM} → ${branch.name}`);
      } catch (err) {
        if (/already mapped/i.test(err.message || '')) {
          console.log(`  mapping already exists for ${branch.name}`);
        } else {
          for (const assignment of assignments) {
            try {
              await services.subjects.createMapping({
                regulationId: regulation.id,
                assignments: [assignment],
              });
            } catch (e2) {
              if (!/already mapped/i.test(e2.message || '')) throw e2;
            }
          }
          console.log(`  mapping ensured for ${branch.name}`);
        }
      }
    }

    // ── Exam ──
    const examName = `${REG_CODE} B.Tech Y${YEAR} S${SEM} Regular · Batch ${BATCH}`;
    const allExams = await services.exam.findAll();
    let exam = allExams.find(
      (e) =>
        e.name === examName &&
        e.regulationId === regulation.id &&
        String(e.batch) === BATCH,
    );

    const feeByCode = new Map(Y1S1_SUBJECTS.map((s) => [s.code, s.fee]));
    const { applicationStartDate, applicationEndDate, examinationStartDate, examinationEndDate, examStart } =
      dateWindow();

    if (exam) {
      console.log(`Exam already exists #${exam.id} (${exam.status})`);
      // Update package fee to ₹1 if needed
      await services.exam.update(exam.id, {
        packageFee: PACKAGE_FEE,
        subjects: subjects.map((sub, i) => {
          const d = new Date(examStart);
          d.setDate(d.getDate() + i);
          return {
            subjectId: sub.id,
            fee: feeByCode.get(sub.code) ?? 1,
            examDate: iso(d),
          };
        }),
      });
      exam = await services.exam.findOne(exam.id);
      if (exam.status === ExamStatus.DRAFT || exam.status === ExamStatus.REJECTED) {
        await services.exam.update(exam.id, { submitForApproval: true });
        exam = await services.exam.findOne(exam.id);
      }
      if (exam.status === ExamStatus.PENDING_APPROVAL) {
        await services.exam.approve(exam.id, 'seed-batch-2000');
        exam = await services.exam.findOne(exam.id);
      }
      if (exam.status === ExamStatus.APPROVED) {
        await services.exam.publish(exam.id, {});
        exam = await services.exam.findOne(exam.id);
      }
      console.log(`  ensured published · packageFee=${exam.packageFee}`);
    } else {
      exam = await services.exam.create({
        name: examName,
        types: [ExamType.REGULAR],
        regulationId: regulation.id,
        college: college.name,
        course: course.name,
        batch: BATCH,
        yearOfStudy: YEAR,
        semester: SEM,
        scopes: branches.map((b) => ({
          branch: b.name,
          branchId: b.id,
          sections: [],
        })),
        subjects: subjects.map((sub, i) => {
          const d = new Date(examStart);
          d.setDate(d.getDate() + i);
          return {
            subjectId: sub.id,
            fee: feeByCode.get(sub.code) ?? 1,
            examDate: iso(d),
          };
        }),
        packageFee: PACKAGE_FEE,
        applicationStartDate,
        applicationEndDate,
        examinationStartDate,
        examinationEndDate,
        instructions:
          'Batch 2000 test exam — select all subjects to pay package fee ₹1.',
        submitForApproval: true,
      });
      await services.exam.approve(exam.id, 'seed-batch-2000');
      await services.exam.publish(exam.id, {});
      exam = await services.exam.findOne(exam.id);
      console.log(`Published exam #${exam.id} · packageFee=₹${PACKAGE_FEE}`);
    }

    console.log('\n========== DONE ==========');
    console.log(`Regulation: ${REG_CODE} (id=${regulation.id})`);
    console.log(`Exam:       #${exam.id} ${exam.name}`);
    console.log(`Status:     ${exam.status}`);
    console.log(`Package:    ₹${exam.packageFee}`);
    console.log(`Batch:      ${BATCH} · Y${YEAR} S${SEM} · Regular`);
    console.log('Test students: PIN 112233 / 112234 (CSE)');
    console.log('==========================');
  } finally {
    await studentDs.destroy().catch(() => undefined);
    await examDs.destroy().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
