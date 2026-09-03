'use strict';

/**
 * Remove testing regulations and ALL dependent exam-portal data.
 *
 * Dry run (safe, default — shows exactly what would be deleted):
 *   node scripts/cleanup-testing-regulations.js --code TESTING
 *   node scripts/cleanup-testing-regulations.js --name "Testing 2000 batch"
 *
 * Actual delete:
 *   node scripts/cleanup-testing-regulations.js --code TESTING --execute --i-understand-test-data-only
 *
 * Pattern match (default: test, testing):
 *   node scripts/cleanup-testing-regulations.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createExamPortalDataSource } = require('../src/database/data-source');

const DEFAULT_PATTERNS = ['test', 'testing'];

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set();
  const positional = [];
  let code = null;
  let name = null;
  let id = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--code') {
      code = args[++i] ?? '';
      continue;
    }
    if (arg === '--name') {
      name = args[++i] ?? '';
      continue;
    }
    if (arg === '--id') {
      id = Number(args[++i]);
      continue;
    }
    if (arg.startsWith('--')) {
      flags.add(arg);
      continue;
    }
    positional.push(arg);
  }

  return {
    execute: flags.has('--execute'),
    confirmed: flags.has('--i-understand-test-data-only'),
    help: flags.has('--help') || flags.has('-h'),
    patterns: positional.length ? positional : DEFAULT_PATTERNS,
    code: code?.trim() || null,
    name: name?.trim() || null,
    id: Number.isFinite(id) && id > 0 ? id : null,
  };
}

function printHelp() {
  console.log(`
Remove testing regulations and all dependent exam-portal records.

Dry run (default):
  node scripts/cleanup-testing-regulations.js --code TESTING
  node scripts/cleanup-testing-regulations.js --name "Testing 2000 batch"
  node scripts/cleanup-testing-regulations.js --id 7

Pattern match (name OR code contains "test" / "testing"):
  node scripts/cleanup-testing-regulations.js

Execute delete:
  node scripts/cleanup-testing-regulations.js --code TESTING --execute --i-understand-test-data-only
`);
}

async function tableExists(ds, table) {
  const rows = await ds.query('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

async function countWhere(ds, table, whereClause, params = []) {
  if (!(await tableExists(ds, table))) return 0;
  const rows = await ds.query(
    `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${whereClause}`,
    params,
  );
  return Number(rows[0]?.n || 0);
}

async function selectRows(ds, sql, params = []) {
  return ds.query(sql, params);
}

async function findTargetRegulations(ds, opts) {
  if (opts.id) {
    return selectRows(
      ds,
      `SELECT id, code, name, status, createdAt
       FROM regulations
       WHERE id = ?
       ORDER BY id`,
      [opts.id],
    );
  }

  if (opts.code) {
    return selectRows(
      ds,
      `SELECT id, code, name, status, createdAt
       FROM regulations
       WHERE LOWER(code) = LOWER(?)
       ORDER BY id`,
      [opts.code],
    );
  }

  if (opts.name) {
    return selectRows(
      ds,
      `SELECT id, code, name, status, createdAt
       FROM regulations
       WHERE LOWER(name) = LOWER(?)
       ORDER BY id`,
      [opts.name],
    );
  }

  const clauses = opts.patterns.map(() => '(LOWER(code) LIKE ? OR LOWER(name) LIKE ?)');
  const params = [];
  for (const pattern of opts.patterns) {
    const term = `%${String(pattern).trim().toLowerCase()}%`;
    params.push(term, term);
  }

  return selectRows(
    ds,
    `SELECT id, code, name, status, createdAt
     FROM regulations
     WHERE ${clauses.join(' OR ')}
     ORDER BY id`,
    params,
  );
}

async function buildRegulationPlan(ds, regulation) {
  const regulationId = regulation.id;
  const subjects = await selectRows(
    ds,
    'SELECT id, code, name FROM subjects WHERE regulationId = ? ORDER BY id',
    [regulationId],
  );
  const subjectIds = subjects.map((row) => row.id);

  const exams = await selectRows(
    ds,
    'SELECT id, name, status, batch, course, branch FROM exams WHERE regulationId = ? ORDER BY id',
    [regulationId],
  );
  const examIds = exams.map((row) => row.id);

  const scopes = await selectRows(
    ds,
    `SELECT id, collegeId, courseId, batch
     FROM regulation_scopes
     WHERE regulationId = ?
     ORDER BY id`,
    [regulationId],
  );

  const plan = {
    regulation,
    subjects,
    exams,
    scopes,
    counts: {
      regulation_scopes: scopes.length,
      subjects: subjects.length,
      subject_mapping_entries: 0,
      exams: exams.length,
      exam_subjects: 0,
      exam_scopes: 0,
      late_fee_slabs: 0,
      exam_applications: 0,
      payments: 0,
      merchant_statement_txns_unlink: 0,
      exam_fee_records: 0,
      subject_results: 0,
      result_uploads: 0,
      remuneration_bills: 0,
      regulations: 1,
    },
    samples: {},
  };

  if (subjectIds.length) {
    const placeholders = subjectIds.map(() => '?').join(',');
    plan.counts.subject_mapping_entries = await countWhere(
      ds,
      'subject_mapping_entries',
      `regulationId = ? OR subjectId IN (${placeholders})`,
      [regulationId, ...subjectIds],
    );
    plan.samples.subject_mapping_entries = await selectRows(
      ds,
      `SELECT id, subjectId, collegeId, courseId, branchId, batch, yearOfStudy, semester
       FROM subject_mapping_entries
       WHERE regulationId = ? OR subjectId IN (${placeholders})
       ORDER BY id
       LIMIT 20`,
      [regulationId, ...subjectIds],
    );
  } else {
    plan.counts.subject_mapping_entries = await countWhere(
      ds,
      'subject_mapping_entries',
      'regulationId = ?',
      [regulationId],
    );
  }

  if (!examIds.length) {
    return plan;
  }

  const examPlaceholders = examIds.map(() => '?').join(',');

  plan.counts.exam_subjects = await countWhere(
    ds,
    'exam_subjects',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.exam_scopes = await countWhere(
    ds,
    'exam_scopes',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.late_fee_slabs = await countWhere(
    ds,
    'late_fee_slabs',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.exam_applications = await countWhere(
    ds,
    'exam_applications',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.exam_fee_records = await countWhere(
    ds,
    'exam_fee_records',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.payments = await countWhere(
    ds,
    'payments',
    `feeRecordId IN (SELECT id FROM exam_fee_records WHERE examId IN (${examPlaceholders}))`,
    examIds,
  );
  plan.counts.subject_results = await countWhere(
    ds,
    'subject_results',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.result_uploads = await countWhere(
    ds,
    'result_uploads',
    `examId IN (${examPlaceholders})`,
    examIds,
  );
  plan.counts.remuneration_bills = await countWhere(
    ds,
    'remuneration_bills',
    `examId IN (${examPlaceholders}) OR regulationId = ?`,
    [...examIds, regulationId],
  );

  if (await tableExists(ds, 'merchant_statement_txns')) {
    plan.counts.merchant_statement_txns_unlink = await countWhere(
      ds,
      'merchant_statement_txns',
      `matchedPaymentId IN (
         SELECT p.id
         FROM payments p
         INNER JOIN exam_fee_records f ON f.id = p.feeRecordId
         WHERE f.examId IN (${examPlaceholders})
       )`,
      examIds,
    );
  }

  plan.samples.exam_fee_records = await selectRows(
    ds,
    `SELECT id, examId, studentRollNumber, studentName, status, totalAmount
     FROM exam_fee_records
     WHERE examId IN (${examPlaceholders})
     ORDER BY id
     LIMIT 20`,
    examIds,
  );
  plan.samples.payments = await selectRows(
    ds,
    `SELECT p.id, p.feeRecordId, p.receiptNumber, p.status, p.amountPaid, f.examId, f.studentRollNumber
     FROM payments p
     INNER JOIN exam_fee_records f ON f.id = p.feeRecordId
     WHERE f.examId IN (${examPlaceholders})
     ORDER BY p.id
     LIMIT 20`,
    examIds,
  );
  plan.samples.exam_applications = await selectRows(
    ds,
    `SELECT id, examId, studentRollNumber, studentName, feeRecordId
     FROM exam_applications
     WHERE examId IN (${examPlaceholders})
     ORDER BY id
     LIMIT 20`,
    examIds,
  );

  return plan;
}

function printPlan(plan, index) {
  const { regulation, subjects, exams, scopes, counts } = plan;
  console.log(`\n${'='.repeat(72)}`);
  console.log(`REGULATION ${index + 1}: #${regulation.id} | ${regulation.code} | ${regulation.name}`);
  console.log(`Status: ${regulation.status} | Created: ${regulation.createdAt}`);
  console.log(`${'='.repeat(72)}`);

  console.log('\nRegulation scopes to delete:');
  if (!scopes.length) {
    console.log('  (none)');
  } else {
    for (const scope of scopes) {
      console.log(
        `  - scope #${scope.id} | collegeId=${scope.collegeId} courseId=${scope.courseId} batch=${scope.batch}`,
      );
    }
  }

  console.log('\nSubjects to delete:');
  if (!subjects.length) {
    console.log('  (none)');
  } else {
    for (const subject of subjects) {
      console.log(`  - subject #${subject.id} | ${subject.code} | ${subject.name}`);
    }
  }

  console.log('\nExams to delete:');
  if (!exams.length) {
    console.log('  (none)');
  } else {
    for (const exam of exams) {
      console.log(
        `  - exam #${exam.id} | ${exam.name} | status=${exam.status} | ${exam.course}/${exam.branch} batch=${exam.batch}`,
      );
    }
  }

  console.log('\nRow counts that WILL BE DELETED:');
  const order = [
    ['merchant_statement_txns_unlink', 'merchant_statement_txns (unlink matchedPaymentId)'],
    ['payments', 'payments'],
    ['exam_applications', 'exam_applications'],
    ['exam_fee_records', 'exam_fee_records'],
    ['subject_results', 'subject_results'],
    ['result_uploads', 'result_uploads'],
    ['exam_subjects', 'exam_subjects'],
    ['exam_scopes', 'exam_scopes'],
    ['late_fee_slabs', 'late_fee_slabs'],
    ['remuneration_bills', 'remuneration_bills'],
    ['exams', 'exams'],
    ['subject_mapping_entries', 'subject_mapping_entries'],
    ['subjects', 'subjects'],
    ['regulation_scopes', 'regulation_scopes'],
    ['regulations', 'regulations'],
  ];

  let total = 0;
  for (const [key, label] of order) {
    const n = counts[key] ?? 0;
    if (key === 'merchant_statement_txns_unlink') {
      if (n > 0) console.log(`  ${label.padEnd(42)} ${n} (set matchedPaymentId = NULL)`);
      continue;
    }
    total += n;
    console.log(`  ${label.padEnd(42)} ${n}`);
  }
  console.log(`  ${'TOTAL ROWS (excluding unlink-only)'.padEnd(42)} ${total}`);

  if (plan.samples.exam_fee_records?.length) {
    console.log('\nSample fee records:');
    for (const row of plan.samples.exam_fee_records) {
      console.log(
        `  - fee #${row.id} | exam ${row.examId} | ${row.studentRollNumber} | ${row.studentName} | ${row.status} | ${row.totalAmount}`,
      );
    }
  }

  if (plan.samples.payments?.length) {
    console.log('\nSample payments:');
    for (const row of plan.samples.payments) {
      console.log(
        `  - payment #${row.id} | fee ${row.feeRecordId} | ${row.receiptNumber} | ${row.status} | ${row.amountPaid}`,
      );
    }
  }

  if (plan.samples.exam_applications?.length) {
    console.log('\nSample applications:');
    for (const row of plan.samples.exam_applications) {
      console.log(
        `  - application #${row.id} | exam ${row.examId} | ${row.studentRollNumber} | feeRecord ${row.feeRecordId}`,
      );
    }
  }

  if (plan.samples.subject_mapping_entries?.length) {
    console.log('\nSample subject mappings:');
    for (const row of plan.samples.subject_mapping_entries) {
      console.log(
        `  - mapping #${row.id} | subject ${row.subjectId} | Y${row.yearOfStudy}/S${row.semester} | batch ${row.batch}`,
      );
    }
  }
}

async function deleteRegulationData(ds, plan) {
  const regulationId = plan.regulation.id;
  const subjectIds = plan.subjects.map((row) => row.id);
  const examIds = plan.exams.map((row) => row.id);
  const deleted = { ...plan.counts };

  if (examIds.length) {
    const examPlaceholders = examIds.map(() => '?').join(',');

    if (await tableExists(ds, 'merchant_statement_txns')) {
      const unlink = await ds.query(
        `UPDATE merchant_statement_txns
         SET matchedPaymentId = NULL,
             matchStatus = 'unmatched',
             matchConfidence = NULL,
             matchReason = NULL
         WHERE matchedPaymentId IN (
           SELECT p.id
           FROM payments p
           INNER JOIN exam_fee_records f ON f.id = p.feeRecordId
           WHERE f.examId IN (${examPlaceholders})
         )`,
        examIds,
      );
      deleted.merchant_statement_txns_unlink = unlink.affectedRows ?? 0;
    }

    const payments = await ds.query(
      `DELETE p FROM payments p
       INNER JOIN exam_fee_records f ON f.id = p.feeRecordId
       WHERE f.examId IN (${examPlaceholders})`,
      examIds,
    );
    deleted.payments = payments.affectedRows ?? 0;

    const applications = await ds.query(
      `DELETE FROM exam_applications WHERE examId IN (${examPlaceholders})`,
      examIds,
    );
    deleted.exam_applications = applications.affectedRows ?? 0;

    const feeRecords = await ds.query(
      `DELETE FROM exam_fee_records WHERE examId IN (${examPlaceholders})`,
      examIds,
    );
    deleted.exam_fee_records = feeRecords.affectedRows ?? 0;

    if (await tableExists(ds, 'subject_results')) {
      const subjectResults = await ds.query(
        `DELETE FROM subject_results WHERE examId IN (${examPlaceholders})`,
        examIds,
      );
      deleted.subject_results = subjectResults.affectedRows ?? 0;
    }

    if (await tableExists(ds, 'result_uploads')) {
      const resultUploads = await ds.query(
        `DELETE FROM result_uploads WHERE examId IN (${examPlaceholders})`,
        examIds,
      );
      deleted.result_uploads = resultUploads.affectedRows ?? 0;
    }

    const examSubjects = await ds.query(
      `DELETE FROM exam_subjects WHERE examId IN (${examPlaceholders})`,
      examIds,
    );
    deleted.exam_subjects = examSubjects.affectedRows ?? 0;

    const examScopes = await ds.query(
      `DELETE FROM exam_scopes WHERE examId IN (${examPlaceholders})`,
      examIds,
    );
    deleted.exam_scopes = examScopes.affectedRows ?? 0;

    const lateFeeSlabs = await ds.query(
      `DELETE FROM late_fee_slabs WHERE examId IN (${examPlaceholders})`,
      examIds,
    );
    deleted.late_fee_slabs = lateFeeSlabs.affectedRows ?? 0;

    if (await tableExists(ds, 'remuneration_bills')) {
      const bills = await ds.query(
        `DELETE FROM remuneration_bills
         WHERE examId IN (${examPlaceholders}) OR regulationId = ?`,
        [...examIds, regulationId],
      );
      deleted.remuneration_bills = bills.affectedRows ?? 0;
    }

    const exams = await ds.query(
      `DELETE FROM exams WHERE id IN (${examPlaceholders})`,
      examIds,
    );
    deleted.exams = exams.affectedRows ?? 0;
  }

  if (subjectIds.length) {
    const subjectPlaceholders = subjectIds.map(() => '?').join(',');
    const mappings = await ds.query(
      `DELETE FROM subject_mapping_entries
       WHERE regulationId = ? OR subjectId IN (${subjectPlaceholders})`,
      [regulationId, ...subjectIds],
    );
    deleted.subject_mapping_entries = mappings.affectedRows ?? 0;

    const subjects = await ds.query(
      `DELETE FROM subjects WHERE id IN (${subjectPlaceholders})`,
      subjectIds,
    );
    deleted.subjects = subjects.affectedRows ?? 0;
  } else {
    const mappings = await ds.query(
      'DELETE FROM subject_mapping_entries WHERE regulationId = ?',
      [regulationId],
    );
    deleted.subject_mapping_entries = mappings.affectedRows ?? 0;
  }

  const regulationScopes = await ds.query(
    'DELETE FROM regulation_scopes WHERE regulationId = ?',
    [regulationId],
  );
  deleted.regulation_scopes = regulationScopes.affectedRows ?? 0;

  const regulations = await ds.query('DELETE FROM regulations WHERE id = ?', [
    regulationId,
  ]);
  deleted.regulations = regulations.affectedRows ?? 0;

  return deleted;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const ds = createExamPortalDataSource();
  await ds.initialize();

  try {
    const database = ds.options?.database || process.env.EXAM_PORTAL_DB_NAME;
    console.log('=== Testing regulation cleanup ===');
    console.log(`Database: ${database}`);
    console.log(
      opts.execute
        ? 'Mode: EXECUTE (rows will be deleted)'
        : 'Mode: DRY RUN (no data will be deleted)',
    );

    const regulations = await findTargetRegulations(ds, opts);
    if (!regulations.length) {
      const target =
        opts.id != null
          ? `id=${opts.id}`
          : opts.code
            ? `code="${opts.code}"`
            : opts.name
              ? `name="${opts.name}"`
              : `patterns: ${opts.patterns.map((p) => `"${p}"`).join(', ')}`;
      console.log(`\nNo regulations matched ${target}.`);
      return;
    }

    console.log(`\nMatched ${regulations.length} regulation(s). Building delete plan…`);

    const plans = [];
    for (const regulation of regulations) {
      plans.push(await buildRegulationPlan(ds, regulation));
    }

    for (const [index, plan] of plans.entries()) {
      printPlan(plan, index);
    }

    if (!opts.execute) {
      console.log(`\n${'='.repeat(72)}`);
      console.log('DRY RUN complete — nothing was deleted.');
      console.log('To delete for real, run:');
      if (opts.code) {
        console.log(
          `  node scripts/cleanup-testing-regulations.js --code ${opts.code} --execute --i-understand-test-data-only`,
        );
      } else if (opts.id) {
        console.log(
          `  node scripts/cleanup-testing-regulations.js --id ${opts.id} --execute --i-understand-test-data-only`,
        );
      } else if (opts.name) {
        console.log(
          `  node scripts/cleanup-testing-regulations.js --name "${opts.name}" --execute --i-understand-test-data-only`,
        );
      } else {
        console.log(
          '  node scripts/cleanup-testing-regulations.js --code TESTING --execute --i-understand-test-data-only',
        );
      }
      return;
    }

    if (!opts.confirmed) {
      console.error('\nRefusing to delete without --i-understand-test-data-only');
      process.exit(1);
    }

    console.log(`\n${'='.repeat(72)}`);
    console.log('EXECUTING DELETE…');

    for (const plan of plans) {
      const deleted = await deleteRegulationData(ds, plan);
      console.log(
        `\nDeleted regulation #${plan.regulation.id} (${plan.regulation.code}):`,
      );
      console.log(`  payments: ${deleted.payments}`);
      console.log(`  applications: ${deleted.exam_applications}`);
      console.log(`  fee records: ${deleted.exam_fee_records}`);
      console.log(`  exams: ${deleted.exams}`);
      console.log(`  subjects: ${deleted.subjects}`);
      console.log(`  regulation scopes: ${deleted.regulation_scopes}`);
      console.log(`  regulations: ${deleted.regulations}`);
    }

    console.log('\nCleanup complete.');
  } finally {
    await ds.destroy().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
