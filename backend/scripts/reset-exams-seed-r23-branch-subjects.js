'use strict';

/**
 * 1. Deletes ALL examinations and EMS transactions (payments, applications,
 *    fee records, exam subjects/scopes/slabs). Fee Management MongoDB is NOT touched.
 * 2. Replaces the generic R23 subjects with branch-specific subjects for the
 *    2023 B.Tech batch at Pydah College of Engineering, mapped per branch
 *    across all 8 semesters.
 *
 * R26 subjects/mappings are left as they are (only its exams are removed).
 *
 * Usage: node scripts/reset-exams-seed-r23-branch-subjects.js
 */

require('dotenv').config();
const { createExamPortalDataSource } = require('../src/database/data-source');
const { createStudentDataSource } = require('../src/database/student-data-source');
const { createServices } = require('../src/database/container');
const { SubjectType } = require('../src/subjects/schemas/subject.enums');

const COLLEGE_NAME = 'Pydah College of Engineering';
const BATCH = '2023';
const REG_CODE = 'R23';

const YEAR_SEMS = [
  { year: 1, sem: 1 },
  { year: 1, sem: 2 },
  { year: 2, sem: 1 },
  { year: 2, sem: 2 },
  { year: 3, sem: 1 },
  { year: 3, sem: 2 },
  { year: 4, sem: 1 },
  { year: 4, sem: 2 },
];

// First year is common to every branch.
const COMMON_Y1 = {
  '1-1': [
    'Linear Algebra & Calculus',
    'Engineering Physics',
    'Programming for Problem Solving',
    'Programming for Problem Solving Lab',
  ],
  '1-2': [
    'Differential Equations & Vector Calculus',
    'Engineering Chemistry',
    'English for Technical Communication',
    'Engineering Workshop Lab',
  ],
};

// Branch curricula for Y2–Y4. Last subject of each semester is the lab.
const CURRICULA = {
  CSE: {
    '2-1': ['Discrete Mathematical Structures', 'Digital Logic Design', 'Object Oriented Programming with Java', 'Java Programming Lab'],
    '2-2': ['Probability & Statistics', 'Database Management Systems', 'Operating Systems', 'DBMS Lab'],
    '3-1': ['Computer Networks', 'Design & Analysis of Algorithms', 'Software Engineering', 'Computer Networks Lab'],
    '3-2': ['Compiler Design', 'Web Technologies', 'Cryptography & Network Security', 'Web Technologies Lab'],
    '4-1': ['Cloud Computing', 'Data Mining', 'Mobile Application Development', 'Cloud Computing Lab'],
    '4-2': ['Distributed Systems', 'DevOps & Deployment', 'Big Data Analytics', 'Project Work / Internship'],
  },
  CSAI: {
    '2-1': ['Discrete Mathematical Structures', 'Digital Logic Design', 'Python Programming', 'Python Programming Lab'],
    '2-2': ['Probability & Statistics for AI', 'Database Management Systems', 'Artificial Intelligence', 'Artificial Intelligence Lab'],
    '3-1': ['Machine Learning', 'Computer Networks', 'Design & Analysis of Algorithms', 'Machine Learning Lab'],
    '3-2': ['Deep Learning', 'Natural Language Processing', 'Data Visualization', 'Deep Learning Lab'],
    '4-1': ['Computer Vision', 'Reinforcement Learning', 'Big Data Analytics', 'Computer Vision Lab'],
    '4-2': ['Generative AI', 'MLOps', 'AI Ethics & Governance', 'Project Work / Internship'],
  },
  CSML: {
    '2-1': ['Mathematics for Machine Learning', 'Digital Logic Design', 'Python Programming', 'Python Programming Lab'],
    '2-2': ['Probability & Statistics', 'Data Handling & Warehousing', 'Foundations of Machine Learning', 'ML Foundations Lab'],
    '3-1': ['Advanced Machine Learning', 'Computer Networks', 'Design & Analysis of Algorithms', 'Advanced ML Lab'],
    '3-2': ['Deep Learning', 'Natural Language Processing', 'Pattern Recognition', 'Deep Learning Lab'],
    '4-1': ['Computer Vision', 'Time Series & Forecasting', 'Big Data Analytics', 'Computer Vision Lab'],
    '4-2': ['Generative AI', 'MLOps', 'Recommender Systems', 'Project Work / Internship'],
  },
  ECE: {
    '2-1': ['Signals & Systems', 'Electronic Devices & Circuits', 'Network Analysis', 'Electronic Devices Lab'],
    '2-2': ['Analog Circuits', 'Digital System Design', 'Electromagnetic Waves & Transmission Lines', 'Digital System Design Lab'],
    '3-1': ['Linear IC Applications', 'Digital Signal Processing', 'Control Systems', 'Digital Signal Processing Lab'],
    '3-2': ['Microprocessors & Microcontrollers', 'Analog & Digital Communications', 'Antennas & Wave Propagation', 'Microprocessors Lab'],
    '4-1': ['VLSI Design', 'Microwave Engineering', 'Embedded Systems', 'VLSI Design Lab'],
    '4-2': ['Optical Communications', 'Wireless & Mobile Communications', 'Satellite Communications', 'Project Work / Internship'],
  },
  MEC: {
    '2-1': ['Engineering Mechanics', 'Thermodynamics', 'Material Science & Metallurgy', 'Material Testing Lab'],
    '2-2': ['Kinematics of Machinery', 'Fluid Mechanics & Hydraulic Machines', 'Manufacturing Processes', 'Fluid Mechanics Lab'],
    '3-1': ['Dynamics of Machinery', 'Thermal Engineering', 'Design of Machine Members', 'Thermal Engineering Lab'],
    '3-2': ['Heat Transfer', 'Metrology & Machine Tools', 'Automobile Engineering', 'Machine Tools Lab'],
    '4-1': ['CAD/CAM', 'Refrigeration & Air Conditioning', 'Finite Element Methods', 'CAD/CAM Lab'],
    '4-2': ['Robotics & Automation', 'Power Plant Engineering', 'Industrial Engineering & Management', 'Project Work / Internship'],
  },
};

function branchTag(branch) {
  const name = (branch.name || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim();
  if (name === 'CSE') return 'CSE';
  if (/^CSE\s*AI$/.test(name) || /CSE\s*\(A/.test((branch.name || '').toUpperCase())) return 'CSAI';
  if (/CSEAI\s*ML|AI\s*ML/.test(name)) return 'CSML';
  if (name === 'ECE') return 'ECE';
  if (/^MEC/.test(name)) return 'MEC';
  return name.replace(/\s+/g, '').slice(0, 5) || `BR${branch.id}`;
}

function genericCurriculum(branchName) {
  const out = {};
  for (const { year, sem } of YEAR_SEMS.filter((ys) => ys.year > 1)) {
    out[`${year}-${sem}`] = [
      `${branchName} Core Theory I (Y${year} S${sem})`,
      `${branchName} Core Theory II (Y${year} S${sem})`,
      `${branchName} Professional Elective (Y${year} S${sem})`,
      `${branchName} Laboratory (Y${year} S${sem})`,
    ];
  }
  return out;
}

async function main() {
  const examDs = createExamPortalDataSource();
  const studentDs = createStudentDataSource();
  await examDs.initialize();
  await studentDs.initialize();
  const services = createServices(examDs, studentDs);

  try {
    // ── Phase 1: wipe all examinations and EMS transactions ──
    console.log('Phase 1 — deleting all examinations and transactions (EMS only)…');
    const tables = [
      'payments',
      'exam_applications',
      'exam_fee_records',
      'exam_subjects',
      'exam_scopes',
      'late_fee_slabs',
      'exams',
    ];
    for (const table of tables) {
      const res = await examDs.query(`DELETE FROM ${table}`);
      console.log(`  ${table}: deleted ${res.affectedRows ?? '?'} rows`);
    }

    // ── Phase 2: resolve scope ──
    const colleges = await services.sdms.listColleges(false);
    const college = colleges.find((c) => c.name?.toLowerCase() === COLLEGE_NAME.toLowerCase());
    if (!college) throw new Error(`${COLLEGE_NAME} not found`);
    const courses = await services.sdms.listCourses(college.id, false);
    const course = courses.find((c) => /^b\.?tech$/i.test(c.code || '') || /b\.tech/i.test(c.name || ''));
    if (!course) throw new Error('B.Tech course not found');
    const branches = await services.sdms.listBranches(course.id);
    console.log(`\nBranches: ${branches.map((b) => `${b.name} [${branchTag(b)}]`).join(', ')}`);

    const regulations = await services.regulations.findAll();
    const r23 = regulations.find((r) => r.code === REG_CODE);
    if (!r23) throw new Error('R23 regulation not found');

    // ── Phase 3: replace generic R23 subjects with branch-specific ones ──
    console.log(`\nPhase 2 — replacing ${REG_CODE} subjects with branch-specific ones…`);
    const delMap = await examDs.query('DELETE FROM subject_mapping_entries WHERE regulationId = ?', [r23.id]);
    const delSub = await examDs.query('DELETE FROM subjects WHERE regulationId = ?', [r23.id]);
    console.log(`  removed old mappings: ${delMap.affectedRows ?? '?'}, old subjects: ${delSub.affectedRows ?? '?'}`);

    let subjectCount = 0;
    let mappingCount = 0;

    for (const branch of branches) {
      const tag = branchTag(branch);
      const curriculum = CURRICULA[tag] ?? genericCurriculum(branch.name);
      console.log(`\n  ${branch.name} (${tag})`);

      for (const { year, sem } of YEAR_SEMS) {
        const names = year === 1 ? COMMON_Y1[`${year}-${sem}`] : curriculum[`${year}-${sem}`];
        if (!names?.length) continue;

        const semSubjects = [];
        for (let i = 0; i < names.length; i += 1) {
          const isLab = i === names.length - 1;
          const letter = String.fromCharCode(65 + i); // A, B, C, D
          const code = `${REG_CODE}${tag}Y${year}S${sem}${letter}`;
          const subject = await services.subjects.create({
            code,
            name: names[i],
            type: isLab ? SubjectType.LABORATORY : SubjectType.THEORY,
            credits: isLab ? 1.5 : 3,
            regulationId: r23.id,
            yearOfStudy: year,
            semester: sem,
            internalMarks: 30,
            externalMarks: 70,
            collegeId: college.id,
            collegeName: college.name,
            courseId: course.id,
            courseName: course.name,
            branchId: branch.id,
            branchName: branch.name,
          });
          semSubjects.push(subject);
          subjectCount += 1;
        }

        await services.subjects.createMapping({
          regulationId: r23.id,
          assignments: semSubjects.map((sub) => ({
            subjectId: sub.id,
            collegeId: college.id,
            collegeName: college.name,
            courseId: course.id,
            courseName: course.name,
            branchId: branch.id,
            branchName: branch.name,
            batch: BATCH,
            yearOfStudy: year,
            semester: sem,
            sectionMode: 'all',
          })),
        });
        mappingCount += semSubjects.length;
        console.log(`    Y${year}S${sem}: ${semSubjects.map((s) => s.code).join(', ')}`);
      }
    }

    console.log('\n========== DONE ==========');
    console.log(`Examinations & transactions wiped. Fee Management MongoDB untouched.`);
    console.log(`${REG_CODE} branch-specific subjects created: ${subjectCount}`);
    console.log(`Branch mappings created: ${mappingCount}`);
    console.log('Create your examination from Dashboard → Examinations; each branch now offers its own subjects.');
  } finally {
    await studentDs.destroy().catch(() => undefined);
    await examDs.destroy().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
