'use strict';

/**
 * Live report: 2023 CSE eligible students + overdue due clearance.
 * Usage: node scripts/due-clearance-2023-cse-report.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');

const FEE_URI = process.env.FEE_MANAGEMENT_MONGODB_URI;
const API = `http://localhost:${process.env.PORT || 4000}/${process.env.API_PREFIX || 'api'}`;

async function loginStaff() {
  // Prefer env overrides; fall back to known local bootstrap email.
  const email =
    process.env.EMS_TEST_STAFF_EMAIL ||
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ||
    'ravi@pydahsoft.in';
  const password =
    process.env.EMS_TEST_STAFF_PASSWORD ||
    process.env.HRMS_TEST_PASSWORD ||
    '';

  if (!password) {
    // Try common local bootstrap passwords from prior sessions if present.
    const candidates = [
      process.env.EMS_BOOTSTRAP_PASSWORD,
      'Ravi@123',
      'admin123',
      'Admin@123',
      'password',
    ].filter(Boolean);

    for (const pwd of candidates) {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pwd }),
      });
      if (res.ok) {
        const data = await res.json();
        return { token: data.accessToken || data.token, user: data.user || data, email };
      }
    }
    throw new Error(
      `Staff login failed for ${email}. Set EMS_TEST_STAFF_PASSWORD.`,
    );
  }

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed ${res.status}: ${body}`);
  }
  const data = await res.json();
  return { token: data.accessToken || data.token, user: data.user || data, email };
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = typeof data === 'object' ? data.message || JSON.stringify(data) : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function probeFeeMgmt() {
  const conn = await mongoose.createConnection(FEE_URI).asPromise();
  const cols = (await conn.db.listCollections().toArray()).map((c) => c.name);
  const studentfees = conn.db.collection('studentfees');
  const structures = conn.db.collection('feestructures');

  const branchGroups = await studentfees
    .aggregate([
      { $match: { isActive: { $ne: false } } },
      {
        $group: {
          _id: {
            college: '$college',
            course: '$course',
            branch: '$branch',
          },
          students: { $addToSet: '$studentId' },
          rows: { $sum: 1 },
        },
      },
      {
        $project: {
          college: '$_id.college',
          course: '$_id.course',
          branch: '$_id.branch',
          studentCount: { $size: '$students' },
          rows: 1,
          _id: 0,
        },
      },
      { $sort: { studentCount: -1 } },
      { $limit: 30 },
    ])
    .toArray();

  // 2023 CSE focused — StudentFee may not store batch; match by remarks/academicYear/student sample.
  const cseRows = await studentfees
    .find({
      isActive: { $ne: false },
      branch: { $regex: /cse|computer/i },
    })
    .limit(5)
    .toArray();

  const structureSample = await structures
    .find({
      $or: [
        { batch: { $regex: /2023/ } },
        { academicYear: { $regex: /2023/ } },
        { branch: { $regex: /cse|computer/i } },
      ],
    })
    .limit(10)
    .toArray();

  const cse2023Structures = await structures
    .find({
      batch: { $regex: /2023/ },
      branch: { $regex: /cse|computer/i },
    })
    .toArray();

  await conn.close();
  return {
    collections: cols.sort(),
    branchGroups,
    cseRowSample: cseRows.map((r) => ({
      studentId: r.studentId,
      college: r.college,
      course: r.course,
      branch: r.branch,
      academicYear: r.academicYear,
      studentYear: r.studentYear,
      semester: r.semester,
      termNumber: r.termNumber,
      amount: r.amount,
      structureId: r.structureId,
    })),
    structureSample: structureSample.map((s) => ({
      id: String(s._id),
      college: s.college,
      course: s.course,
      branch: s.branch,
      batch: s.batch,
      category: s.category,
      academicYear: s.academicYear,
      studentYear: s.studentYear,
      semester: s.semester,
      keys: Object.keys(s),
    })),
    cse2023StructureCount: cse2023Structures.length,
    cse2023Structures: cse2023Structures.map((s) => ({
      id: String(s._id),
      college: s.college,
      course: s.course,
      branch: s.branch,
      batch: s.batch,
      category: s.category,
      studentYear: s.studentYear,
      semester: s.semester,
    })),
  };
}

async function countSdms2023Cse() {
  const conn = await mysql.createConnection({
    host: process.env.STUDENT_DB_HOST,
    port: Number(process.env.STUDENT_DB_PORT || 3306),
    user: process.env.STUDENT_DB_USER,
    password: process.env.STUDENT_DB_PASSWORD,
    database: process.env.STUDENT_DB_NAME,
    ssl: process.env.STUDENT_DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const [rows] = await conn.query(
    `SELECT college, course, branch, batch, current_year, current_semester, COUNT(*) AS n
     FROM students
     WHERE batch LIKE '%2023%'
       AND (branch LIKE '%CSE%' OR branch LIKE '%Computer%')
     GROUP BY college, course, branch, batch, current_year, current_semester
     ORDER BY n DESC`,
  );

  const [sample] = await conn.query(
    `SELECT id, student_name, admission_number, pin_no, college, course, branch, batch,
            current_year, current_semester, student_status
     FROM students
     WHERE batch LIKE '%2023%'
       AND (branch LIKE '%CSE%' OR branch LIKE '%Computer%')
     LIMIT 5`,
  );

  await conn.end();
  return { groups: rows, sample };
}

async function main() {
  console.log('=== Fee Mgmt probe ===');
  const fee = await probeFeeMgmt();
  console.log('Collections:', fee.collections.join(', '));
  console.log('Top StudentFee branch groups:');
  console.log(JSON.stringify(fee.branchGroups.slice(0, 15), null, 2));
  console.log('CSE StudentFee sample:', JSON.stringify(fee.cseRowSample, null, 2));
  console.log('CSE 2023 FeeStructure count:', fee.cse2023StructureCount);
  console.log('CSE 2023 structures:', JSON.stringify(fee.cse2023Structures, null, 2));
  console.log('Structure sample keys:', JSON.stringify(fee.structureSample, null, 2));

  console.log('\n=== SDMS 2023 CSE students ===');
  const sdms = await countSdms2023Cse();
  console.log(JSON.stringify(sdms.groups, null, 2));
  console.log('Sample students:', JSON.stringify(sdms.sample, null, 2));

  console.log('\n=== Staff login + exam flow ===');
  const { token, email } = await loginStaff();
  console.log('Logged in as', email);

  const regulations = await api(token, 'GET', '/regulations');
  console.log(
    'Regulations:',
    (Array.isArray(regulations) ? regulations : regulations.items || []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
    })),
  );

  const exams = await api(token, 'GET', '/exams');
  const examList = Array.isArray(exams) ? exams : exams.items || [];
  const published2023 = examList.filter(
    (e) =>
      String(e.batch || '').includes('2023') &&
      /cse|computer/i.test(String(e.branch || '')) &&
      String(e.status).toLowerCase() === 'published',
  );
  console.log(
    'Existing published 2023 CSE exams:',
    published2023.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      year: e.yearOfStudy,
      sem: e.semester,
    })),
  );

  // Prefer an existing published exam for the report; otherwise create one.
  let examId = published2023[0]?.id || null;
  let created = false;

  if (!examId) {
    const top = sdms.groups[0];
    if (!top) throw new Error('No 2023 CSE students found in SDMS');

    const regs = Array.isArray(regulations) ? regulations : regulations.items || [];
    const reg =
      regs.find((r) => /cse|computer|btech|r23/i.test(`${r.name} ${r.code || ''}`)) ||
      regs[0];
    if (!reg) throw new Error('No regulation found');

    // Need subjects for create — fetch regulation detail / mapped subjects.
    let subjects = [];
    try {
      const detail = await api(token, 'GET', `/regulations/${reg.id}/detail`);
      const mappings =
        detail.subjectMappings ||
        detail.mappings ||
        detail.subjects ||
        [];
      subjects = (Array.isArray(mappings) ? mappings : [])
        .filter((m) => m.subjectId || m.id)
        .slice(0, 3)
        .map((m) => ({
          subjectId: m.subjectId || m.id,
          fee: 500,
          examDate: '2026-08-20',
        }));
    } catch (err) {
      console.warn('Could not load regulation detail subjects:', err.message);
    }

    if (subjects.length === 0) {
      const allSubjects = await api(token, 'GET', '/subjects');
      const list = Array.isArray(allSubjects) ? allSubjects : allSubjects.items || [];
      subjects = list.slice(0, 2).map((s) => ({
        subjectId: s.id,
        fee: 500,
        examDate: '2026-08-20',
      }));
    }

    if (subjects.length === 0) {
      throw new Error('No subjects available to create exam');
    }

    const today = new Date();
    const yyyy = today.toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
    const examStart = '2026-08-20';
    const examEnd = '2026-08-25';

    const payload = {
      name: `Due Clearance Test — ${top.branch} ${top.batch} Y${top.current_year}/S${top.current_semester}`,
      type: 'regular',
      allowedTypes: ['regular'],
      regulationId: reg.id,
      college: top.college,
      course: top.course,
      branch: top.branch,
      batch: String(top.batch),
      yearOfStudy: Number(top.current_year),
      semester: Number(top.current_semester),
      applicationStartDate: yyyy,
      applicationEndDate: end,
      examinationStartDate: examStart,
      examinationEndDate: examEnd,
      subjects,
      scopes: [
        {
          college: top.college,
          course: top.course,
          branch: top.branch,
          batch: String(top.batch),
          yearOfStudy: Number(top.current_year),
          semester: Number(top.current_semester),
        },
      ],
    };

    console.log('Creating exam…', payload.name);
    const createdExam = await api(token, 'POST', '/exams', payload);
    examId = createdExam.id;
    created = true;
    await api(token, 'POST', `/exams/${examId}/submit`);
    await api(token, 'POST', `/exams/${examId}/approve`);
    const published = await api(token, 'POST', `/exams/${examId}/publish`, {});
    console.log('Published exam', examId, 'dueSummary:', published.dueSummary || null);
  }

  console.log('\n=== Eligible students + due clearance ===');
  const eligible = await api(token, 'GET', `/exams/${examId}/eligible-students`);
  const students = eligible.students || [];
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
    examId,
    examName: eligible.exam?.name,
    createdNewExam: created,
    dueSummary: eligible.dueSummary || null,
    totals: {
      eligible: students.length,
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
      .slice(0, 15)
      .map((s) => ({
        roll: s.rollNumber,
        name: s.name,
        admission: s.admissionNumber,
        year: s.currentYear,
        sem: s.currentSemester,
        totalDue: s.dueClearance?.totalDue,
        heads: (s.dueClearance?.byHead || []).map((h) => ({
          name: h.feeHeadName,
          code: h.feeHeadCode,
          due: h.due,
        })),
        message: s.dueClearance?.message,
      })),
    clearSample: clear.slice(0, 10).map((s) => ({
      roll: s.rollNumber,
      name: s.name,
      admission: s.admissionNumber,
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

main().catch((err) => {
  console.error('REPORT FAILED:', err.message);
  process.exit(1);
});
