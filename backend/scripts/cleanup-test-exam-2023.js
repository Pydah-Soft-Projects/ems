'use strict';

/**
 * Remove the test regulation R2023BTECH and all dependent examination-portal data.
 *
 * This test regulation was created by seed-test-exam-2023.js for workflow testing.
 * While active, it claims Pydah College / B.Tech / batch 2023 — blocking creation
 * of the real R23 regulation for that batch in the UI.
 *
 * Targets ONLY the Examination Portal MySQL database (EXAM_PORTAL_DB_*).
 * Does NOT touch SDMS (student DB) or MongoDB.
 *
 * Safety:
 *   Default is DRY-RUN (reports rows that would be deleted; deletes nothing).
 *   To actually delete:
 *
 *     node scripts/cleanup-test-exam-2023.js --execute --i-understand-test-data-only
 *
 * Optional:
 *   --reg-code=R2023BTECH   override regulation code (default: R2023BTECH)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createExamPortalDataSource } = require('../src/database/data-source');

const DEFAULT_REG_CODE = 'R2023BTECH';

/** Known test artifacts from seed-test-exam-2023.js */
const TEST_MARKERS = {
  subjectCodes: ['CSE401', 'CSE402'],
  examName: 'B.Tech 2023 CSE Sem1 - Test Exam',
  feeRecordRoll: 'TEST2023CSE1',
};

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  let regCode = DEFAULT_REG_CODE;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--reg-code=')) {
      regCode = arg.slice('--reg-code='.length).trim();
    }
  }
  return {
    execute: flags.has('--execute'),
    confirmed: flags.has('--i-understand-test-data-only'),
    help: flags.has('--help') || flags.has('-h'),
    regCode,
  };
}

function printHelp() {
  console.log(`
Remove test regulation R2023BTECH and all dependent exam-portal data.

Dry-run (safe, default):
  node scripts/cleanup-test-exam-2023.js

Execute deletion:
  node scripts/cleanup-test-exam-2023.js --execute --i-understand-test-data-only

Options:
  --reg-code=CODE   Regulation code to remove (default: R2023BTECH)
  --help            Show this help
`);
}

function requireExamPortalEnv() {
  const examDb = String(process.env.EXAM_PORTAL_DB_NAME || '').trim();
  const studentDb = String(process.env.STUDENT_DB_NAME || '').trim().toLowerCase();
  if (!examDb) {
    throw new Error('Missing EXAM_PORTAL_DB_NAME in .env');
  }
  if (studentDb && examDb.toLowerCase() === studentDb) {
    throw new Error(
      `Refusing to run: EXAM_PORTAL_DB_NAME ("${examDb}") equals STUDENT_DB_NAME.`,
    );
  }
  return examDb;
}

function scopeKey(collegeId, courseId, batch) {
  return `${collegeId}:${courseId}:${batch}`;
}

async function countByExamIds(ds, table, examIds) {
  if (examIds.length === 0) return 0;
  const placeholders = examIds.map(() => '?').join(',');
  const rows = await ds.query(
    `SELECT COUNT(*) AS n FROM \`${table}\` WHERE examId IN (${placeholders})`,
    examIds,
  );
  return Number(rows[0]?.n || 0);
}

async function countPaymentsByExamIds(ds, examIds) {
  if (examIds.length === 0) return 0;
  const placeholders = examIds.map(() => '?').join(',');
  const rows = await ds.query(
    `SELECT COUNT(*) AS n
     FROM payments p
     INNER JOIN exam_fee_records f ON p.feeRecordId = f.id
     WHERE f.examId IN (${placeholders})`,
    examIds,
  );
  return Number(rows[0]?.n || 0);
}

async function collectReport(ds, regCode) {
  const regulationRepo = ds.getRepository('Regulation');
  const reg = await regulationRepo.findOne({
    where: { code: regCode },
    relations: ['scopes'],
  });

  if (!reg) {
    return { found: false, regCode };
  }

  const subjects = await ds.query(
    'SELECT id, code, name FROM subjects WHERE regulationId = ? ORDER BY code',
    [reg.id],
  );
  const subjectIds = subjects.map((s) => s.id);

  const exams = await ds.query(
    'SELECT id, name, batch, status FROM exams WHERE regulationId = ? ORDER BY id',
    [reg.id],
  );
  const examIds = exams.map((e) => e.id);

  const mappingCount =
    subjectIds.length > 0
      ? Number(
          (
            await ds.query(
              `SELECT COUNT(*) AS n FROM subject_mapping_entries
               WHERE regulationId = ? OR subjectId IN (${subjectIds.map(() => '?').join(',')})`,
              [reg.id, ...subjectIds],
            )
          )[0]?.n || 0,
        )
      : Number(
          (
            await ds.query(
              'SELECT COUNT(*) AS n FROM subject_mapping_entries WHERE regulationId = ?',
              [reg.id],
            )
          )[0]?.n || 0,
        );

  const dependent = {
    regulation_scopes: reg.scopes?.length ?? 0,
    subjects: subjects.length,
    subject_mapping_entries: mappingCount,
    exams: exams.length,
    exam_subjects: await countByExamIds(ds, 'exam_subjects', examIds),
    exam_scopes: await countByExamIds(ds, 'exam_scopes', examIds),
    late_fee_slabs: await countByExamIds(ds, 'late_fee_slabs', examIds),
    exam_fee_records: await countByExamIds(ds, 'exam_fee_records', examIds),
    exam_applications: await countByExamIds(ds, 'exam_applications', examIds),
    payments: await countPaymentsByExamIds(ds, examIds),
    result_uploads: await countByExamIds(ds, 'result_uploads', examIds),
    subject_results: await countByExamIds(ds, 'subject_results', examIds),
    regulations: 1,
  };

  const totalRows = Object.values(dependent).reduce((sum, n) => sum + n, 0);

  const claimedScopes = (reg.scopes ?? []).map((s) => ({
    collegeId: s.collegeId,
    collegeName: s.collegeName,
    courseId: s.courseId,
    courseName: s.courseName,
    batch: s.batch,
    key: scopeKey(s.collegeId, s.courseId, s.batch),
  }));

  const otherActiveClaims = await ds.query(
    `SELECT rs.collegeId, rs.collegeName, rs.courseId, rs.courseName, rs.batch,
            r.id AS regulationId, r.code AS regulationCode, r.name AS regulationName
     FROM regulation_scopes rs
     INNER JOIN regulations r ON r.id = rs.regulationId
     WHERE r.status = 'active' AND r.id != ?
     ORDER BY rs.collegeName, rs.courseName, rs.batch DESC`,
    [reg.id],
  );

  const blockedBatches = claimedScopes.filter((scope) =>
    otherActiveClaims.some(
      (row) =>
        row.collegeId === scope.collegeId &&
        row.courseId === scope.courseId &&
        row.batch === scope.batch,
    ),
  );

  return {
    found: true,
    regCode,
    regulation: {
      id: reg.id,
      code: reg.code,
      name: reg.name,
      status: reg.status,
      scopes: reg.scopes ?? [],
    },
    subjects,
    exams,
    dependent,
    totalRows,
    claimedScopes,
    otherActiveClaims,
    blockedBatches,
  };
}

function printReport(report) {
  const examDb = requireExamPortalEnv();

  console.log('=== R2023BTECH test regulation cleanup ===');
  console.log(`Target database: ${examDb}`);
  console.log(`Regulation code: ${report.regCode}`);
  console.log('');
  console.log('Will NOT touch:');
  console.log(`  student DB:  ${process.env.STUDENT_DB_NAME || '(not set)'}`);
  console.log(
    `  fee mgmt:    ${process.env.FEE_MANAGEMENT_MONGODB_URI ? '(configured — ignored)' : '(not set)'}`,
  );
  console.log(
    `  hrms:        ${process.env.HRMS_MONGODB_URI ? '(configured — ignored)' : '(not set)'}`,
  );
  console.log('');

  if (!report.found) {
    console.log(`No regulation with code "${report.regCode}" found. Nothing to clean.`);
    console.log('');
    console.log('If batch 2023 is still blocked in the UI, check other active regulations:');
    console.log('  GET /api/regulations/claimed-batches');
    return;
  }

  const { regulation, subjects, exams, dependent, claimedScopes } = report;

  console.log('Regulation:');
  console.log(`  id:     ${regulation.id}`);
  console.log(`  code:   ${regulation.code}`);
  console.log(`  name:   ${regulation.name}`);
  console.log(`  status: ${regulation.status}`);
  console.log('');

  console.log('Scopes (batch claims released after cleanup):');
  for (const scope of claimedScopes) {
    console.log(
      `  - ${scope.collegeName} / ${scope.courseName} / batch ${scope.batch}`,
    );
  }
  console.log('');

  console.log('Why batch selection was blocked:');
  console.log(
    '  Each (college, programme, batch) can belong to only ONE active regulation.',
  );
  console.log(
    `  While "${regulation.code}" is active, its scopes appear in GET /api/regulations/claimed-batches`,
  );
  console.log(
    '  and the RegulationScopeMapper UI disables those batches for new regulations.',
  );
  if (claimedScopes.length > 0) {
    const s = claimedScopes[0];
    console.log(
      `  → Batch "${s.batch}" for ${s.collegeName} / ${s.courseName} is currently claimed by ${regulation.code}.`,
    );
  }
  console.log('');

  if (subjects.length > 0) {
    console.log('Subjects:');
    for (const s of subjects) {
      const marker = TEST_MARKERS.subjectCodes.includes(s.code) ? ' (test)' : '';
      console.log(`  - [${s.id}] ${s.code}: ${s.name}${marker}`);
    }
    console.log('');
  }

  if (exams.length > 0) {
    console.log('Exams:');
    for (const e of exams) {
      const marker = e.name === TEST_MARKERS.examName ? ' (test)' : '';
      console.log(`  - [${e.id}] ${e.name} (batch ${e.batch}, ${e.status})${marker}`);
    }
    console.log('');
  }

  console.log('Rows that would be deleted (child → parent order on execute):');
  const deleteOrder = [
    'payments',
    'exam_applications',
    'exam_fee_records',
    'subject_results',
    'result_uploads',
    'exams',
    'exam_subjects',
    'exam_scopes',
    'late_fee_slabs',
    'subject_mapping_entries',
    'subjects',
    'regulation_scopes',
    'regulations',
  ];
  let total = 0;
  for (const table of deleteOrder) {
    const n = dependent[table] ?? 0;
    if (n > 0) {
      total += n;
      console.log(`  ${table.padEnd(28)} ${n}`);
    }
  }
  console.log('');
  console.log(`Total rows: ${total}`);

  if (report.otherActiveClaims?.length) {
    console.log('');
    console.log('Other active regulations (unchanged):');
    for (const row of report.otherActiveClaims) {
      console.log(
        `  - ${row.regulationCode}: ${row.collegeName} / ${row.courseName} / batch ${row.batch}`,
      );
    }
  }

  console.log('');
  console.log('After cleanup you can create the real regulation (e.g. R23) and select batch 2023.');
}

async function executeCleanup(ds, report) {
  const regId = report.regulation.id;
  const examIds = report.exams.map((e) => e.id);
  const subjectIds = report.subjects.map((s) => s.id);

  const paymentRepo = ds.getRepository('Payment');
  const applicationRepo = ds.getRepository('ExamApplication');
  const feeRecordRepo = ds.getRepository('ExamFeeRecord');
  const subjectResultRepo = ds.getRepository('SubjectResult');
  const resultUploadRepo = ds.getRepository('ResultUpload');
  const examRepo = ds.getRepository('Exam');
  const mappingRepo = ds.getRepository('SubjectMappingEntry');
  const subjectRepo = ds.getRepository('Subject');
  const regulationRepo = ds.getRepository('Regulation');

  const deleted = {};

  async function del(repo, criteria, label) {
    const result = await repo.delete(criteria);
    const n = result.affected ?? 0;
    deleted[label] = (deleted[label] ?? 0) + n;
    return n;
  }

  if (examIds.length > 0) {
    const feeRecords = await feeRecordRepo.find({
      where: examIds.map((examId) => ({ examId })),
    });
    const feeRecordIds = feeRecords.map((f) => f.id);

    if (feeRecordIds.length > 0) {
      for (const feeRecordId of feeRecordIds) {
        await del(paymentRepo, { feeRecordId }, 'payments');
      }
      for (const examId of examIds) {
        await del(applicationRepo, { examId }, 'exam_applications');
      }
      for (const examId of examIds) {
        await del(feeRecordRepo, { examId }, 'exam_fee_records');
      }
    }

    for (const examId of examIds) {
      await del(subjectResultRepo, { examId }, 'subject_results');
      await del(resultUploadRepo, { examId }, 'result_uploads');
    }

    for (const examId of examIds) {
      await del(examRepo, { id: examId }, 'exams');
    }
  }

  if (subjectIds.length > 0) {
    for (const subjectId of subjectIds) {
      await del(mappingRepo, { subjectId }, 'subject_mapping_entries');
    }
    await del(mappingRepo, { regulationId: regId }, 'subject_mapping_entries');
    for (const subjectId of subjectIds) {
      await del(subjectRepo, { id: subjectId }, 'subjects');
    }
  }

  await del(regulationRepo, { id: regId }, 'regulations');

  console.log('');
  console.log('Deleted rows:');
  for (const [table, n] of Object.entries(deleted)) {
    if (n > 0) console.log(`  ${table.padEnd(28)} ${n}`);
  }
  console.log('');
  console.log(`Done. Regulation "${report.regCode}" and dependents removed from exam portal.`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  requireExamPortalEnv();

  const ds = createExamPortalDataSource();
  await ds.initialize();

  try {
    const report = await collectReport(ds, opts.regCode);
    printReport(report);

    if (!report.found) {
      return;
    }

    if (!opts.execute) {
      console.log('DRY-RUN only — nothing deleted.');
      console.log(
        'To delete for real:\n  node scripts/cleanup-test-exam-2023.js --execute --i-understand-test-data-only',
      );
      return;
    }

    if (!opts.confirmed) {
      throw new Error(
        'Refusing to execute without --i-understand-test-data-only',
      );
    }

    if (opts.regCode !== DEFAULT_REG_CODE) {
      console.log('');
      console.log(
        `WARNING: deleting regulation code "${opts.regCode}" (not default ${DEFAULT_REG_CODE}).`,
      );
    }

    console.log('');
    console.log('EXECUTING deletion…');
    await executeCleanup(ds, report);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
