'use strict';

/**
 * Direct due-clearance report for 2023 CSE students.
 * Boots EMS data sources + services (no HTTP login required).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createExamPortalDataSource } = require('../src/database/data-source');
const { createStudentDataSource } = require('../src/database/student-data-source');
const {
  connectFeeManagementMongo,
  disconnectFeeManagementMongo,
} = require('../src/fee-management/connection');
const { createServices } = require('../src/database/container');

async function loadAll2023Cse(sdms) {
  const all = [];
  // Exact CSE + 2023
  let page = 1;
  let totalPages = 1;
  do {
    const result = await sdms.listStudents({
      batch: '2023',
      branch: 'CSE',
      page,
      limit: 200,
    });
    totalPages = result.totalPages || 1;
    all.push(...(result.items || []));
    page += 1;
  } while (page <= totalPages);

  if (all.length > 0) return all;

  // Broader: any 2023 batch, filter branch in JS
  page = 1;
  totalPages = 1;
  do {
    const result = await sdms.listStudents({ batch: '2023', page, limit: 200 });
    totalPages = result.totalPages || 1;
    for (const s of result.items || []) {
      if (/cse|computer/i.test(String(s.branch || ''))) all.push(s);
    }
    page += 1;
  } while (page <= totalPages);
  return all;
}

function groupStudents(students) {
  const map = new Map();
  for (const s of students) {
    const key = [
      s.college,
      s.course,
      s.branch,
      s.batch,
      s.currentYear,
      s.currentSemester,
    ].join(' | ');
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);
}

async function main() {
  console.log('Connecting Fee Management Mongo…');
  let feeOk = false;
  try {
    await connectFeeManagementMongo();
    feeOk = true;
    console.log('Fee Management: OK');
  } catch (err) {
    console.error('Fee Management FAILED:', err.message);
  }

  console.log('Connecting MySQL data sources…');
  const examPortalDataSource = createExamPortalDataSource();
  const studentDataSource = createStudentDataSource();
  await examPortalDataSource.initialize();
  await studentDataSource.initialize();
  const services = createServices(examPortalDataSource, studentDataSource);
  const { sdms, exam, feeManagement, regulations, subjects } = services;

  const students2023Cse = await loadAll2023Cse(sdms);
  const groups = groupStudents(students2023Cse);
  console.log('\n=== SDMS 2023 CSE ===');
  console.log('Total students:', students2023Cse.length);
  console.log(JSON.stringify(groups, null, 2));

  // Fee probe
  let feeProbe = { feeManagementEnabled: feeOk && feeManagement.isEnabled() };
  if (feeProbe.feeManagementEnabled) {
    const { StudentFee, FeeStructure, Transaction } = feeManagement.getModels();
    const keys = [
      ...new Set(
        students2023Cse
          .flatMap((s) => [s.admissionNumber, s.pinNo])
          .filter(Boolean)
          .map((x) => String(x).trim()),
      ),
    ];
    const studentFeeRows = await StudentFee.countDocuments({
      studentId: { $in: keys },
      isActive: { $ne: false },
    });
    const withDemand = await StudentFee.distinct('studentId', {
      studentId: { $in: keys },
      isActive: { $ne: false },
    });
    const structures = await FeeStructure.find({
      $and: [
        { batch: { $regex: /2023/ } },
        { branch: { $regex: /cse|computer/i } },
      ],
    })
      .limit(50)
      .lean();

    // Also check demands by branch string regardless of student key match
    const cseDemandRows = await StudentFee.countDocuments({
      branch: { $regex: /cse|computer/i },
      isActive: { $ne: false },
    });
    const cseDemandStudents = await StudentFee.distinct('studentId', {
      branch: { $regex: /cse|computer/i },
      isActive: { $ne: false },
    });

    feeProbe = {
      ...feeProbe,
      studentKeysFromSdms: keys.length,
      matchedStudentFeeRows: studentFeeRows,
      matchedStudentsWithDemand: withDemand.length,
      cseBranchDemandRows: cseDemandRows,
      cseBranchDemandStudents: cseDemandStudents.length,
      structures2023Cse: structures.map((s) => ({
        id: String(s._id),
        college: s.college,
        course: s.course,
        branch: s.branch,
        batch: s.batch,
        category: s.category,
        studentYear: s.studentYear,
        semester: s.semester,
        academicYear: s.academicYear,
      })),
    };
  }
  console.log('\n=== Fee Mgmt probe ===');
  console.log(JSON.stringify(feeProbe, null, 2));

  if (students2023Cse.length === 0) {
    throw new Error('No 2023 CSE students in SDMS');
  }

  // Dominant year/sem for exam scope
  const yearSem = new Map();
  for (const s of students2023Cse) {
    const k = `${Number(s.currentYear)}|${Number(s.currentSemester)}`;
    yearSem.set(k, (yearSem.get(k) || 0) + 1);
  }
  const top = [...yearSem.entries()].sort((a, b) => b[1] - a[1])[0];
  const [yearOfStudy, semester] = top[0].split('|').map(Number);
  const scoped = students2023Cse.filter(
    (s) =>
      Number(s.currentYear) === yearOfStudy &&
      Number(s.currentSemester) === semester,
  );
  const proto = scoped[0];

  console.log('\n=== Target exam scope ===');
  console.log({
    college: proto.college,
    course: proto.course,
    branch: proto.branch,
    batch: proto.batch,
    yearOfStudy,
    semester,
    scopedCount: scoped.length,
  });

  // Prefer existing published exam matching scope
  const published = await exam.findAll('published');
  let target =
    published.find(
      (e) =>
        String(e.batch) === String(proto.batch) &&
        String(e.branch).toLowerCase().includes('cse') &&
        Number(e.yearOfStudy) === yearOfStudy &&
        Number(e.semester) === semester,
    ) ||
    published.find(
      (e) =>
        String(e.batch).includes('2023') &&
        /cse|computer/i.test(String(e.branch || '')),
    );

  let createdNewExam = false;
  let publishDueSummary = null;

  if (!target) {
    console.log('No matching published exam — creating one…');
    const regs = await regulations.findAll();
    const regList = Array.isArray(regs) ? regs : [];
    // Prefer regulation that mentions the course/batch
    let reg =
      regList.find((r) =>
        (r.scopes || []).some(
          (sc) =>
            String(sc.courseName || sc.course || '') === String(proto.course) &&
            String(sc.batch || '') === String(proto.batch),
        ),
      ) || regList[0];
    if (!reg) throw new Error('No regulation found');

    // Pull mapped subjects for this regulation/course/branch/year/sem
    let subjectFees = [];
    try {
      const mapped = await subjects.getMappingEntries?.({
        regulationId: reg.id,
        course: proto.course,
        branch: proto.branch,
        batch: proto.batch,
        yearOfStudy,
        semester,
      });
      const entries = Array.isArray(mapped)
        ? mapped
        : mapped?.items || mapped?.entries || [];
      subjectFees = entries.slice(0, 3).map((e) => ({
        subjectId: e.subjectId || e.subject?.id,
        fee: 500,
        examDate: '2026-08-20',
        branch: proto.branch,
      })).filter((s) => s.subjectId);
    } catch (err) {
      console.warn('Mapping lookup failed:', err.message);
    }

    if (subjectFees.length === 0) {
      // Fallback: any subjects from catalog — may fail validation
      const allSub = await subjects.findAll();
      const list = Array.isArray(allSub) ? allSub : allSub.items || [];
      subjectFees = list.slice(0, 2).map((s) => ({
        subjectId: s.id,
        fee: 500,
        examDate: '2026-08-20',
      }));
    }

    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    try {
      const created = await exam.create({
        name: `Due Clearance Probe — ${proto.branch} ${proto.batch} Y${yearOfStudy}/S${semester}`,
        type: 'regular',
        allowedTypes: ['regular'],
        regulationId: reg.id,
        college: proto.college,
        course: proto.course,
        branch: proto.branch,
        batch: String(proto.batch),
        yearOfStudy,
        semester,
        applicationStartDate: today,
        applicationEndDate: end,
        examinationStartDate: '2026-08-20',
        examinationEndDate: '2026-08-25',
        subjects: subjectFees,
        scopes: [
          {
            college: proto.college,
            course: proto.course,
            branch: proto.branch,
            batch: String(proto.batch),
            yearOfStudy,
            semester,
          },
        ],
      });
      await exam.submitForApproval(created.id);
      await exam.approve(created.id, 'due-clearance-report');
      target = await exam.publish(
        created.id,
        {},
        {
          username: 'due-clearance-report',
          isSuperAdmin: true,
          privileges: ['*'],
        },
      );
      createdNewExam = true;
      publishDueSummary = target.dueSummary || null;
      console.log('Created+published exam id=', target.id);
    } catch (err) {
      console.error('Exam create/publish failed:', err.message);
      // Fall back: run due clearance directly on scoped SDMS students
      target = null;
    }
  } else {
    console.log('Using existing published exam:', target.id, target.name);
  }

  let eligible = null;
  let students = [];
  if (target) {
    eligible = await exam.listEligibleStudents(target.id);
    students = eligible.students || [];
  } else {
    console.log('Falling back to direct due clearance on scoped SDMS students…');
    students = [];
    for (const s of scoped) {
      const dueClearance = await feeManagement.getStudentDueClearance({
        id: s.id,
        admissionNumber: s.admissionNumber,
        pinNo: s.pinNo,
        studentName: s.studentName,
        college: s.college,
        course: s.course,
        branch: s.branch,
        batch: s.batch,
        currentYear: s.currentYear,
        currentSemester: s.currentSemester,
      });
      students.push({
        id: s.id,
        rollNumber: s.pinNo || s.admissionNumber,
        name: s.studentName,
        admissionNumber: s.admissionNumber,
        currentYear: s.currentYear,
        currentSemester: s.currentSemester,
        dueClearance,
      });
    }
    eligible = {
      exam: {
        id: null,
        name: '(no exam — direct due scan)',
        college: proto.college,
        course: proto.course,
        branch: proto.branch,
        batch: proto.batch,
        yearOfStudy,
        semester,
      },
      dueSummary: {
        asOfDate: new Date().toISOString().slice(0, 10),
        eligible: students.length,
        clearCount: students.filter((s) => !s.dueClearance?.blocked && !s.dueClearance?.skipped).length,
        blockedCount: students.filter((s) => s.dueClearance?.blocked).length,
        skippedCount: students.filter((s) => s.dueClearance?.skipped).length,
        totalOverdueAmount: students
          .filter((s) => s.dueClearance?.blocked)
          .reduce((sum, s) => sum + (Number(s.dueClearance?.totalDue) || 0), 0),
      },
    };
  }

  const blocked = students.filter((s) => s.dueClearance?.blocked);
  const clear = students.filter(
    (s) => !s.dueClearance?.blocked && !s.dueClearance?.skipped,
  );
  const skipped = students.filter((s) => s.dueClearance?.skipped);
  const totalDue = blocked.reduce(
    (sum, s) => sum + (Number(s.dueClearance?.totalDue) || 0),
    0,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    feeProbe,
    sdms: {
      total2023Cse: students2023Cse.length,
      groups,
      targetScope: {
        college: proto.college,
        course: proto.course,
        branch: proto.branch,
        batch: proto.batch,
        yearOfStudy,
        semester,
        scopedCount: scoped.length,
      },
    },
    exam: target
      ? {
          id: target.id,
          name: eligible.exam?.name || target.name,
          college: eligible.exam?.college,
          course: eligible.exam?.course,
          branch: eligible.exam?.branch,
          batch: eligible.exam?.batch,
          yearOfStudy: eligible.exam?.yearOfStudy,
          semester: eligible.exam?.semester,
          createdNewExam,
          publishDueSummary,
        }
      : {
          id: null,
          name: '(direct due scan — exam create failed)',
          createdNewExam: false,
        },
    dueSummary: eligible.dueSummary || null,
    totals: {
      eligibleDisplayed: students.length,
      clearToApply: clear.length,
      duesBlocked: blocked.length,
      dueCheckSkipped: skipped.length,
      totalOverdueAmount: Math.round(totalDue * 100) / 100,
    },
    topBlocked: blocked
      .slice()
      .sort(
        (a, b) =>
          (Number(b.dueClearance?.totalDue) || 0) -
          (Number(a.dueClearance?.totalDue) || 0),
      )
      .slice(0, 25)
      .map((s) => ({
        roll: s.rollNumber,
        name: s.name,
        admission: s.admissionNumber,
        year: s.currentYear,
        sem: s.currentSemester,
        totalDue: s.dueClearance?.totalDue,
        byTerm: s.dueClearance?.byTerm,
        heads: (s.dueClearance?.byHead || []).map((h) => ({
          name: h.feeHeadName,
          code: h.feeHeadCode,
          due: h.due,
        })),
        verificationNotes: s.dueClearance?.verification?.notes || [],
      })),
    clearSample: clear.slice(0, 20).map((s) => ({
      roll: s.rollNumber,
      name: s.name,
      admission: s.admissionNumber,
    })),
    skippedSample: skipped.slice(0, 10).map((s) => ({
      roll: s.rollNumber,
      reason: s.dueClearance?.reason || s.dueClearance?.message,
    })),
  };

  const outPath = path.join(__dirname, 'due-clearance-2023-cse-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\n=== REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  console.log('\nSaved:', outPath);

  await examPortalDataSource.destroy().catch(() => undefined);
  await studentDataSource.destroy().catch(() => undefined);
  await disconnectFeeManagementMongo().catch(() => undefined);
  process.exit(0);
}

main().catch(async (err) => {
  console.error('REPORT FAILED:', err);
  process.exit(1);
});
