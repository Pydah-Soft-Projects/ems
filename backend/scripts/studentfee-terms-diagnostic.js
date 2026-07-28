'use strict';

/**
 * Diagnostic dump: raw StudentFee / concessions / payments for 2023 CSE
 * so we can verify term splits (especially Tuition) before due math.
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
const { idStr } = require('../src/fee-management/due-clearance');

async function loadScopedStudents(sdms) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await sdms.listStudents({
      batch: '2023',
      branch: 'CSE',
      currentYear: 4,
      currentSemester: 1,
      page,
      limit: 200,
    });
    totalPages = result.totalPages || 1;
    all.push(...(result.items || []));
    page += 1;
  } while (page <= totalPages);
  return all;
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function main() {
  await connectFeeManagementMongo();
  const examDs = createExamPortalDataSource();
  const studentDs = createStudentDataSource();
  await examDs.initialize();
  await studentDs.initialize();
  const { sdms, feeManagement } = createServices(examDs, studentDs);

  if (!feeManagement.isEnabled()) {
    throw new Error('Fee Management not connected');
  }

  const {
    StudentFee,
    FeeHead,
    FeeStructure,
    Transaction,
    OverallConcessionRequest,
    ConcessionRequest,
  } = feeManagement.getModels();

  const students = await loadScopedStudents(sdms);
  console.log('Scoped students Y4/S1 2023 CSE:', students.length);

  // Limit detailed dump to first N + a few known blocked from prior report
  const focusRolls = new Set([
    '236T1A0547', // Korapu Jahnavi
    '236T1A0521', // Damerla Sai Saketh
    '236T1A0501', // Achanta Mohini
    '236T1A0511', // clear sample
    '236T1A0532', // clear sample
  ]);
  const focus = students.filter(
    (s) =>
      focusRolls.has(String(s.pinNo || '').trim()) ||
      focusRolls.has(String(s.admissionNumber || '').trim()),
  );
  // Also take first 8 alphabetically for breadth
  const sample = [
    ...focus,
    ...students
      .filter((s) => !focus.some((f) => f.id === s.id))
      .slice(0, 8),
  ];

  const heads = await FeeHead.find({}).lean();
  const headById = new Map(heads.map((h) => [String(h._id), h]));

  const studentReports = [];
  const termNumberStats = {
    nullOrMissing: 0,
    present: 0,
    byHeadAndTerm: {},
  };

  // Also scan ALL scoped students' tuition StudentFee termNumbers (summary only)
  const allKeys = [
    ...new Set(
      students.flatMap((s) => [s.admissionNumber, s.pinNo].filter(Boolean)),
    ),
  ];
  const allFees = await StudentFee.find({
    studentId: { $in: allKeys },
    isActive: { $ne: false },
  }).lean();

  for (const fee of allFees) {
    const head = headById.get(String(fee.feeHead)) || {};
    const headName = head.name || String(fee.feeHead);
    const tn = fee.termNumber;
    if (tn == null || tn === '') termNumberStats.nullOrMissing += 1;
    else termNumberStats.present += 1;
    const k = `${headName} | term=${tn == null ? 'NULL' : tn}`;
    termNumberStats.byHeadAndTerm[k] =
      (termNumberStats.byHeadAndTerm[k] || 0) + 1;
  }

  for (const s of sample) {
    const keys = [s.admissionNumber, s.pinNo].filter(Boolean).map(String);
    const escapeRe = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const identityOr = (field) => ({
      $or: keys.flatMap((k) => [
        { [field]: k },
        { [field]: new RegExp(`^${escapeRe(k)}$`, 'i') },
      ]),
    });

    const [fees, txns, overall, apps] = await Promise.all([
      StudentFee.find({
        ...identityOr('studentId'),
        isActive: { $ne: false },
      })
        .sort({ studentYear: 1, semester: 1, termNumber: 1 })
        .lean(),
      Transaction.find({
        ...identityOr('studentId'),
        status: { $ne: 'cancelled' },
      })
        .sort({ paymentDate: 1 })
        .lean(),
      OverallConcessionRequest.find({
        status: 'APPROVED',
        $or: [
          ...identityOr('admissionNumber').$or,
          ...identityOr('pinNo').$or,
        ],
      }).lean(),
      ConcessionRequest.find({
        status: 'APPROVED',
        $or: [
          ...identityOr('studentId').$or,
          ...identityOr('studentPin').$or,
        ],
      }).lean(),
    ]);

    const structureIds = [
      ...new Set(fees.map((f) => f.structureId).filter(Boolean).map(String)),
    ];
    const structures = structureIds.length
      ? await FeeStructure.find({ _id: { $in: structureIds } }).lean()
      : [];
    const structureById = new Map(structures.map((x) => [String(x._id), x]));

    // Group StudentFee by head + year + sem, show each term row raw
    const byHead = new Map();
    for (const fee of fees) {
      const head = headById.get(String(fee.feeHead)) || {};
      const headName = head.name || 'UNKNOWN';
      const headCode = head.code || null;
      const gKey = `${headName}|Y${fee.studentYear}|S${fee.semester ?? 'null'}|${fee.academicYear}`;
      if (!byHead.has(gKey)) {
        byHead.set(gKey, {
          feeHeadName: headName,
          feeHeadCode: headCode,
          feeHeadId: String(fee.feeHead),
          academicYear: fee.academicYear,
          studentYear: fee.studentYear,
          semester: fee.semester,
          isTermsDividedFlags: [],
          terms: [],
          structureIds: new Set(),
        });
      }
      const g = byHead.get(gKey);
      g.isTermsDividedFlags.push(fee.isTermsDivided);
      if (fee.structureId) g.structureIds.add(String(fee.structureId));
      g.terms.push({
        studentFeeId: String(fee._id),
        termNumber: fee.termNumber,
        amount: fee.amount,
        remarks: fee.remarks || null,
        isTermsDivided: fee.isTermsDivided,
        structureId: fee.structureId ? String(fee.structureId) : null,
        stud_type: fee.stud_type || null,
        rawKeys: Object.keys(fee),
      });
    }

    const headsDetailed = [...byHead.values()].map((g) => {
      const structs = [...g.structureIds].map((id) => {
        const st = structureById.get(id);
        if (!st) return { id, missing: true };
        // Try to surface term config from structure
        const heads =
          st.feeHeads || st.heads || st.feeHeadDetails || st.items || [];
        const matched = Array.isArray(heads)
          ? heads.find((h) => {
              const hid = String(h.feeHead || h.feeHeadId || h.headId || h._id || '');
              return hid && hid === g.feeHeadId;
            })
          : null;
        const source = matched || st;
        const terms =
          source.terms || source.termSplits || source.installments || st.terms || [];
        return {
          id,
          batch: st.batch,
          category: st.category,
          studentYear: st.studentYear,
          semester: st.semester,
          structureKeys: Object.keys(st),
          matchedHeadKeys: matched ? Object.keys(matched) : null,
          structureTerms: Array.isArray(terms)
            ? terms.map((t, i) => ({
                index: i,
                termNumber: t.termNumber ?? t.term ?? null,
                amount: t.amount ?? null,
                percent: t.percent ?? t.percentage ?? null,
                dueDate: t.dueDate || t.due_date || null,
                offsetDays: t.offsetDays ?? t.dueDays ?? t.dueOffsetDays ?? null,
                keys: Object.keys(t),
              }))
            : [],
        };
      });

      return {
        feeHeadName: g.feeHeadName,
        feeHeadCode: g.feeHeadCode,
        academicYear: g.academicYear,
        studentYear: g.studentYear,
        semester: g.semester,
        termRowCount: g.terms.length,
        distinctTermNumbers: [
          ...new Set(g.terms.map((t) => t.termNumber)),
        ],
        totalDemand: money(g.terms.reduce((s, t) => s + Number(t.amount || 0), 0)),
        isTermsDividedFlags: g.isTermsDividedFlags,
        studentFeeTerms: g.terms,
        structures: structs,
      };
    });

    const overallMapped = overall.map((o) => ({
      id: String(o._id),
      status: o.status,
      admissionNumber: o.admissionNumber,
      pinNo: o.pinNo,
      category: o.category,
      concessions: (o.concessions || []).map((c) => ({
        feeHeadId: c.feeHeadId,
        feeHeadCode: c.feeHeadCode,
        feeHeadName: headById.get(String(c.feeHeadId))?.name || null,
        studentYear: c.studentYear,
        semester: c.semester,
        amount: c.amount,
        concessionType: c.concessionType,
      })),
    }));

    const appsMapped = apps.map((a) => ({
      id: String(a._id),
      status: a.status,
      feeHeadId: String(a.feeHead),
      feeHeadName: headById.get(String(a.feeHead))?.name || null,
      feeHeadCode: headById.get(String(a.feeHead))?.code || null,
      amount: a.amount,
      studentYear: a.studentYear,
      semester: a.semester,
      reason: a.reason,
    }));

    const txnsMapped = txns.map((t) => ({
      id: String(t._id),
      feeHeadId: t.feeHead ? String(t.feeHead) : null,
      feeHeadName: t.feeHead
        ? headById.get(String(t.feeHead))?.name || null
        : null,
      amount: t.amount,
      transactionType: t.transactionType,
      paymentMode: t.paymentMode,
      studentYear: t.studentYear,
      semester: t.semester,
      paymentDate: t.paymentDate,
      remarks: t.remarks || null,
      status: t.status,
    }));

    // Also run current calculator for comparison
    let calculated = null;
    try {
      calculated = await feeManagement.getStudentDueClearance({
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
    } catch (err) {
      calculated = { error: err.message };
    }

    studentReports.push({
      student: {
        id: s.id,
        name: s.studentName,
        pinNo: s.pinNo,
        admissionNumber: s.admissionNumber,
        college: s.college,
        course: s.course,
        branch: s.branch,
        batch: s.batch,
        currentYear: s.currentYear,
        currentSemester: s.currentSemester,
        lookupKeys: keys,
      },
      rawStudentFeeCount: fees.length,
      heads: headsDetailed,
      overallConcessionsApproved: overallMapped,
      applicationConcessionsApproved: appsMapped,
      transactions: txnsMapped,
      calculatedDueClearance: calculated,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      college: 'Pydah College of Engineering',
      course: 'B.Tech',
      branch: 'CSE',
      batch: '2023',
      year: 4,
      semester: 1,
      studentCount: students.length,
    },
    termNumberStatsAcrossAllScopedStudentFees: {
      ...termNumberStats,
      byHeadAndTerm: Object.fromEntries(
        Object.entries(termNumberStats.byHeadAndTerm).sort((a, b) => b[1] - a[1]),
      ),
    },
    sampleStudentCount: sample.length,
    students: studentReports,
  };

  const out = path.join(__dirname, 'studentfee-terms-diagnostic-2023-cse.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  // Console summary focused on tuition terms
  console.log('\n=== TERM NUMBER STATS (all matched StudentFee for scoped students) ===');
  console.log('present termNumber:', termNumberStats.present);
  console.log('null/missing termNumber:', termNumberStats.nullOrMissing);
  console.log('by head+term (top):');
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(termNumberStats.byHeadAndTerm)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40),
      ),
      null,
      2,
    ),
  );

  console.log('\n=== PER SAMPLE STUDENT: Tuition term rows ===');
  for (const sr of studentReports) {
    const tuition = sr.heads.filter((h) =>
      /tuition/i.test(h.feeHeadName),
    );
    console.log('\n---', sr.student.pinNo, sr.student.name, '---');
    console.log('StudentFee rows:', sr.rawStudentFeeCount);
    if (!tuition.length) {
      console.log('NO TUITION StudentFee rows found for keys', sr.student.lookupKeys);
    }
    for (const t of tuition) {
      console.log(
        `Tuition Y${t.studentYear}/S${t.semester} AY=${t.academicYear} rows=${t.termRowCount} distinctTerms=${JSON.stringify(t.distinctTermNumbers)} total=${t.totalDemand}`,
      );
      console.log(
        '  terms:',
        t.studentFeeTerms.map((x) => ({
          termNumber: x.termNumber,
          amount: x.amount,
          isTermsDivided: x.isTermsDivided,
          remarks: x.remarks,
        })),
      );
      if (t.structures?.[0]?.structureTerms?.length) {
        console.log('  structureTerms:', t.structures[0].structureTerms);
      }
    }
    console.log(
      'Calculated byHead terms:',
      (sr.calculatedDueClearance?.byHead || []).map((h) => ({
        name: h.feeHeadName,
        due: h.due,
        terms: (h.terms || []).map((tm) => ({
          termNumber: tm.termNumber,
          demand: tm.demand,
          balance: tm.balance,
          overdue: tm.overdue,
        })),
      })),
    );
  }

  console.log('\nSaved full diagnostic:', out);

  await examDs.destroy().catch(() => undefined);
  await studentDs.destroy().catch(() => undefined);
  await disconnectFeeManagementMongo().catch(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
