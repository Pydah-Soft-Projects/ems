'use strict';

/**
 * Seed Pydah College of Engineering — B.Tech regulations, subjects, mappings, exams.
 *
 *   R26 → batch 2026 (all branches, exams for all year/semester slots)
 *   R23 → batch 2023 (all branches, exams for all year/semester slots)
 *
 * Additive (does not wipe existing EMS data). Idempotent by regulation code / exam name.
 *
 * Usage: node scripts/seed-pydah-btech-exams.js
 */

const { DataSource } = require('typeorm');
const { config } = require('../src/config');
const { entities } = require('../src/database/data-source');
const { buildExamPortalMysqlOptions } = require('../src/database/mysql-options');
const { createStudentDataSource } = require('../src/database/student-data-source');
const { createServices } = require('../src/database/container');
const { ExamType, ExamStatus } = require('../src/exam/schemas/exam.enums');
const { SubjectType } = require('../src/subjects/schemas/subject.enums');

const COLLEGE_NAME = 'Pydah College of Engineering';
const COURSE_NAME = 'B.Tech';

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

const SUBJECT_TEMPLATES = [
  { suffix: 'A', name: 'Engineering Mathematics', fee: 200, credits: 4 },
  { suffix: 'B', name: 'Core Theory', fee: 200, credits: 3 },
  { suffix: 'C', name: 'Professional Elective', fee: 180, credits: 3 },
  { suffix: 'D', name: 'Laboratory / Workshop', fee: 150, credits: 2, type: SubjectType.LABORATORY },
];

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function dateWindow(offsetDays = 0) {
  const today = new Date();
  today.setDate(today.getDate() + offsetDays);
  const appStart = new Date(today);
  appStart.setDate(appStart.getDate() - 3);
  const appEnd = new Date(today);
  appEnd.setDate(appEnd.getDate() + 25);
  const examStart = new Date(today);
  examStart.setDate(examStart.getDate() + 30);
  const examEnd = new Date(today);
  examEnd.setDate(examEnd.getDate() + 45);
  return {
    applicationStartDate: iso(appStart),
    applicationEndDate: iso(appEnd),
    examinationStartDate: iso(examStart),
    examinationEndDate: iso(examEnd),
    examStart,
  };
}

function subjectCatalog(regCode) {
  const list = [];
  for (const { year, sem } of YEAR_SEMS) {
    for (const t of SUBJECT_TEMPLATES) {
      const code = `${regCode}Y${year}S${sem}${t.suffix}`;
      list.push({
        code,
        name: `${t.name} (Y${year} S${sem})`,
        type: t.type || SubjectType.THEORY,
        credits: t.credits,
        fee: t.fee,
        yearOfStudy: year,
        semester: sem,
      });
    }
  }
  return list;
}

async function resolvePydahBtech(sdms) {
  const colleges = await sdms.listColleges(false);
  const college = colleges.find(
    (c) => c.name?.toLowerCase() === COLLEGE_NAME.toLowerCase(),
  );
  if (!college) throw new Error(`${COLLEGE_NAME} not found in SDMS`);

  const courses = await sdms.listCourses(college.id, false);
  const course = courses.find(
    (c) =>
      c.name?.toLowerCase() === COURSE_NAME.toLowerCase() ||
      /^b\.?tech$/i.test(c.code || ''),
  );
  if (!course) throw new Error(`B.Tech course not found under ${college.name}`);

  const branches = await sdms.listBranches(course.id);
  if (!branches.length) throw new Error('No branches found for B.Tech');

  return { college, course, branches };
}

async function ensureRegulation(services, { code, name, effectiveDate, description, college, course, batch }) {
  const existing = await services.regulations.findAll();
  const found = existing.find((r) => r.code === code);
  if (found) {
    console.log(`  regulation ${code} already exists (id=${found.id})`);
    return services.regulations.findOne(found.id);
  }
  const regulation = await services.regulations.create({
    code,
    name,
    effectiveDate,
    description,
    scopes: [
      {
        collegeId: college.id,
        collegeName: college.name,
        courseId: course.id,
        courseName: course.name,
        batches: [batch],
      },
    ],
  });
  console.log(`  created regulation ${code} (id=${regulation.id})`);
  return regulation;
}

async function ensureSubjects(services, regulation, catalog) {
  const existing = await services.subjects.findAll(regulation.id);
  const byCode = new Map(existing.map((s) => [s.code, s]));
  const subjects = [];
  for (const spec of catalog) {
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
      yearOfStudy: spec.yearOfStudy,
      semester: spec.semester,
      internalMarks: 30,
      externalMarks: 70,
    });
    subjects.push(created);
  }
  console.log(`  subjects: ${subjects.length} (${catalog.length} expected)`);
  return subjects;
}

async function ensureMappings(services, {
  regulation,
  subjects,
  catalog,
  college,
  course,
  branches,
  batch,
}) {
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  let created = 0;
  let skipped = 0;

  for (const { year, sem } of YEAR_SEMS) {
    const semSubjects = subjects.filter((s) => {
      const meta = byCode.get(s.code);
      return meta && meta.yearOfStudy === year && meta.semester === sem;
    });
    if (!semSubjects.length) continue;

    for (const branch of branches) {
      const assignments = [];
      for (const sub of semSubjects) {
        assignments.push({
          subjectId: sub.id,
          collegeId: college.id,
          collegeName: college.name,
          courseId: course.id,
          courseName: course.name,
          branchId: branch.id,
          branchName: branch.name,
          batch,
          yearOfStudy: year,
          semester: sem,
          sectionMode: 'all',
        });
      }
      try {
        await services.subjects.createMapping({
          regulationId: regulation.id,
          assignments,
        });
        created += assignments.length;
      } catch (err) {
        if (/already mapped/i.test(err.message || '')) {
          skipped += assignments.length;
        } else {
          // Fallback: map one-by-one so partial progress is kept
          for (const assignment of assignments) {
            try {
              await services.subjects.createMapping({
                regulationId: regulation.id,
                assignments: [assignment],
              });
              created += 1;
            } catch (e2) {
              if (/already mapped/i.test(e2.message || '')) skipped += 1;
              else throw e2;
            }
          }
        }
      }
    }
    console.log(`  mapped Y${year}S${sem} × ${branches.length} branches`);
  }
  console.log(`  mapping rows created≈${created}, skipped≈${skipped}`);
}

async function ensureExam(services, {
  regulation,
  subjects,
  catalog,
  college,
  course,
  branches,
  batch,
  year,
  sem,
  namePrefix,
}) {
  const examName = `${namePrefix} B.Tech Y${year} S${sem} · Batch ${batch}`;
  const allExams = await services.exam.findAll();
  const existing = allExams.find(
    (e) =>
      e.name === examName &&
      e.regulationId === regulation.id &&
      e.batch === batch,
  );
  if (existing) {
    if (existing.status !== ExamStatus.PUBLISHED) {
      if (existing.status === ExamStatus.DRAFT || existing.status === ExamStatus.REJECTED) {
        // leave; recreate path not needed
      } else if (existing.status === ExamStatus.PENDING_APPROVAL) {
        await services.exam.approve(existing.id, 'seed-pydah');
        await services.exam.publish(existing.id, {});
      } else if (existing.status === ExamStatus.APPROVED) {
        await services.exam.publish(existing.id, {});
      }
      console.log(`  exam already exists #${existing.id} (${existing.status}) → ensured published`);
    } else {
      console.log(`  exam already published #${existing.id} ${examName}`);
    }
    return existing;
  }

  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const semSubjects = subjects.filter((s) => {
    const meta = byCode.get(s.code);
    return meta && meta.yearOfStudy === year && meta.semester === sem;
  });
  if (!semSubjects.length) {
    console.log(`  skip exam ${examName} — no subjects`);
    return null;
  }

  const { applicationStartDate, applicationEndDate, examinationStartDate, examinationEndDate, examStart } =
    dateWindow((year - 1) * 2 + (sem - 1));

  const exam = await services.exam.create({
    name: examName,
    types: [ExamType.REGULAR, ExamType.SUPPLY],
    regulationId: regulation.id,
    college: college.name,
    course: course.name,
    batch,
    yearOfStudy: year,
    semester: sem,
    scopes: branches.map((b) => ({
      branch: b.name,
      branchId: b.id,
      sections: [],
    })),
    subjects: semSubjects.map((sub, i) => {
      const meta = byCode.get(sub.code);
      const d = new Date(examStart);
      d.setDate(d.getDate() + i);
      return {
        subjectId: sub.id,
        fee: meta?.fee ?? 200,
        examDate: iso(d),
      };
    }),
    packageFee: 650,
    applicationStartDate,
    applicationEndDate,
    examinationStartDate,
    examinationEndDate,
    instructions:
      'Apply for Regular or Supply, select subjects, accept declaration, then pay examination fee.',
    submitForApproval: true,
  });

  await services.exam.approve(exam.id, 'seed-pydah');
  await services.exam.publish(exam.id, {});
  console.log(`  published exam #${exam.id} ${examName}`);
  return exam;
}

async function seedRegulationPack(services, {
  code,
  name,
  effectiveDate,
  description,
  batch,
  college,
  course,
  branches,
  examYears,
}) {
  console.log(`\n======== ${code} · batch ${batch} ========`);
  const regulation = await ensureRegulation(services, {
    code,
    name,
    effectiveDate,
    description,
    college,
    course,
    batch,
  });

  const catalog = subjectCatalog(code);
  console.log('Creating / loading subjects…');
  const subjects = await ensureSubjects(services, regulation, catalog);

  console.log('Mapping subjects to all branches × all semesters…');
  await ensureMappings(services, {
    regulation,
    subjects,
    catalog,
    college,
    course,
    branches,
    batch,
  });

  console.log('Creating / publishing examinations…');
  const exams = [];
  for (const { year, sem } of examYears) {
    const exam = await ensureExam(services, {
      regulation,
      subjects,
      catalog,
      college,
      course,
      branches,
      batch,
      year,
      sem,
      namePrefix: code,
    });
    if (exam) exams.push(exam);
  }
  return { regulation, subjects, exams };
}

async function main() {
  console.log('Connecting…');
  console.log(`  exam portal: ${config.examPortalDb.host}/${config.examPortalDb.name}`);
  console.log(`  student db:  ${config.studentDb.host}/${config.studentDb.name}`);

  if (config.simulate.useSqlite) {
    throw new Error('SIMULATE_USE_SQLITE is set. Unset it to seed the real examination_portal MySQL DB.');
  }

  const examDs = new DataSource({
    ...buildExamPortalMysqlOptions(),
    entities,
    synchronize: false,
    logging: false,
  });
  const studentDs = createStudentDataSource();
  await examDs.initialize();
  await studentDs.initialize();
  const services = createServices(examDs, studentDs);

  try {
    const { college, course, branches } = await resolvePydahBtech(services.sdms);
    console.log(`College:  ${college.name} (${college.code})`);
    console.log(`Course:   ${course.name} (${course.code})`);
    console.log(`Branches: ${branches.map((b) => b.name).join(', ')}`);

    const r26 = await seedRegulationPack(services, {
      code: 'R26',
      name: 'Regulation 2026 (B.Tech)',
      effectiveDate: '2026-06-01',
      description:
        'R26 for Pydah College of Engineering B.Tech batch 2026 — all branches',
      batch: '2026',
      college,
      course,
      branches,
      examYears: YEAR_SEMS,
    });

    const r23 = await seedRegulationPack(services, {
      code: 'R23',
      name: 'Regulation 2023 (B.Tech)',
      effectiveDate: '2023-06-01',
      description:
        'R23 for Pydah College of Engineering B.Tech batch 2023 — all branches, all semesters',
      batch: '2023',
      college,
      course,
      branches,
      examYears: YEAR_SEMS,
    });

    console.log('\n========== SEED COMPLETE ==========');
    console.log(`R26 id=${r26.regulation.id}  subjects=${r26.subjects.length}  exams=${r26.exams.length}`);
    console.log(`R23 id=${r23.regulation.id}  subjects=${r23.subjects.length}  exams=${r23.exams.length}`);
    console.log('Open Dashboard → Regulations / Subjects / Examinations / Fees to verify.');
    console.log('2026 students are mostly Y1S1; 2023 students mostly Y4S1 — use those exams for fee collection.');
    console.log('===================================');
  } finally {
    await studentDs.destroy().catch(() => undefined);
    await examDs.destroy().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
