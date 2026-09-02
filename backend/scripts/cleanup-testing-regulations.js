'use strict';

/**
 * Remove only testing-created regulations and all dependent exam-portal data.
 *
 * Safe by default: dry run only. To actually delete rows, run:
 *   node scripts/cleanup-testing-regulations.js --execute --i-understand-test-data-only
 *
 * This script targets regulations where the name/code contains 'test' or 'testing',
 * and removes their related exam fee collections, payments, applications, results,
 * subject mappings, subjects, exams, scopes, and the regulation rows themselves.
 * It intentionally does not touch non-test regulations or other modules.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createExamPortalDataSource } = require('../src/database/data-source');

const TEST_PATTERNS = ['test', 'testing'];

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  const positional = argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const patterns = positional.length ? positional : TEST_PATTERNS;

  return {
    execute: flags.has('--execute'),
    confirmed: flags.has('--i-understand-test-data-only'),
    help: flags.has('--help') || flags.has('-h'),
    patterns,
  };
}

function printHelp() {
  console.log(`
Remove only testing-related regulations and their dependent exam records.

Dry run (safe, default):
  node scripts/cleanup-testing-regulations.js

Actual delete:
  node scripts/cleanup-testing-regulations.js --execute --i-understand-test-data-only

Optional custom matchers:
  node scripts/cleanup-testing-regulations.js test testing
`);
}

async function getTestingRegulations(ds, patterns) {
  const clauses = patterns.map((p) => {
    const term = `%${String(p).trim().toLowerCase()}%`;
    return `(LOWER(code) LIKE ? OR LOWER(name) LIKE ?)`;
  });

  const params = [];
  for (const pattern of patterns) {
    const term = `%${String(pattern).trim().toLowerCase()}%`;
    params.push(term, term);
  }

  const rows = await ds.query(
    `SELECT id, code, name, status, createdAt
     FROM regulations
     WHERE ${clauses.join(' OR ')}
     ORDER BY id`,
    params,
  );

  return rows;
}

async function countRows(ds, table, whereClause, params = []) {
  const rows = await ds.query(
    `SELECT COUNT(*) AS n FROM \`${table}\` ${whereClause ? `WHERE ${whereClause}` : ''}`,
    params,
  );
  return Number(rows[0]?.n || 0);
}

async function deleteDependentExamRows(ds, examIds) {
  if (!examIds.length) {
    return { examSubjects: 0, examScopes: 0, lateFeeSlabs: 0, feeRecords: 0, applications: 0, payments: 0, resultUploads: 0, subjectResults: 0 };
  }

  const placeholders = examIds.map(() => '?').join(',');

  const examSubjects = await ds.query(`DELETE FROM exam_subjects WHERE examId IN (${placeholders})`, examIds);
  const examScopes = await ds.query(`DELETE FROM exam_scopes WHERE examId IN (${placeholders})`, examIds);
  const lateFeeSlabs = await ds.query(`DELETE FROM late_fee_slabs WHERE examId IN (${placeholders})`, examIds);
  const feeRecords = await ds.query(`DELETE FROM exam_fee_records WHERE examId IN (${placeholders})`, examIds);
  const applications = await ds.query(`DELETE FROM exam_applications WHERE examId IN (${placeholders})`, examIds);

  const paymentRows = await ds.query(
    `SELECT p.id
     FROM payments p
     INNER JOIN exam_fee_records f ON f.id = p.feeRecordId
     WHERE f.examId IN (${placeholders})`,
    examIds,
  );
  const paymentIds = paymentRows.map((row) => row.id);
  let payments = 0;
  if (paymentIds.length) {
    const paymentPlaceholders = paymentIds.map(() => '?').join(',');
    const result = await ds.query(`DELETE FROM payments WHERE id IN (${paymentPlaceholders})`, paymentIds);
    payments = result.affectedRows ?? paymentIds.length;
  }

  let resultUploads = 0;
  const resultUploadTableExists = await ds.query('SHOW TABLES LIKE ?', ['result_uploads']);
  if (resultUploadTableExists.length) {
    const r = await ds.query(`DELETE FROM result_uploads WHERE examId IN (${placeholders})`, examIds);
    resultUploads = r.affectedRows ?? 0;
  }

  let subjectResults = 0;
  const subjectResultsTableExists = await ds.query('SHOW TABLES LIKE ?', ['subject_results']);
  if (subjectResultsTableExists.length) {
    const r = await ds.query(`DELETE FROM subject_results WHERE examId IN (${placeholders})`, examIds);
    subjectResults = r.affectedRows ?? 0;
  }

  return {
    examSubjects: examSubjects.affectedRows ?? 0,
    examScopes: examScopes.affectedRows ?? 0,
    lateFeeSlabs: lateFeeSlabs.affectedRows ?? 0,
    feeRecords: feeRecords.affectedRows ?? 0,
    applications: applications.affectedRows ?? 0,
    payments,
    resultUploads,
    subjectResults,
  };
}

async function deleteRegulationData(ds, regulationId, code, name) {
  const subjectRows = await ds.query('SELECT id FROM subjects WHERE regulationId = ?', [regulationId]);
  const subjectIds = subjectRows.map((row) => row.id);

  const examRows = await ds.query('SELECT id FROM exams WHERE regulationId = ?', [regulationId]);
  const examIds = examRows.map((row) => row.id);

  if (subjectIds.length) {
    const placeholders = subjectIds.map(() => '?').join(',');
    await ds.query(`DELETE FROM subject_mapping_entries WHERE regulationId = ? OR subjectId IN (${placeholders})`, [regulationId, ...subjectIds]);
  } else {
    await ds.query('DELETE FROM subject_mapping_entries WHERE regulationId = ?', [regulationId]);
  }

  const dependent = examIds.length ? await deleteDependentExamRows(ds, examIds) : {
    examSubjects: 0,
    examScopes: 0,
    lateFeeSlabs: 0,
    feeRecords: 0,
    applications: 0,
    payments: 0,
    resultUploads: 0,
    subjectResults: 0,
  };

  if (examIds.length) {
    const placeholders = examIds.map(() => '?').join(',');
    await ds.query(`DELETE FROM exams WHERE id IN (${placeholders})`, examIds);
  }

  if (subjectIds.length) {
    const placeholders = subjectIds.map(() => '?').join(',');
    await ds.query(`DELETE FROM subjects WHERE id IN (${placeholders})`, subjectIds);
  }

  await ds.query('DELETE FROM regulation_scopes WHERE regulationId = ?', [regulationId]);
  const regDelete = await ds.query('DELETE FROM regulations WHERE id = ?', [regulationId]);

  return {
    regulationId,
    code,
    name,
    examIds,
    subjectIds,
    dependent,
    deletedRegulationRows: regDelete.affectedRows ?? 0,
  };
}

async function main() {
  const { execute, confirmed, help, patterns } = parseArgs(process.argv);
  if (help) {
    printHelp();
    return;
  }

  if (!execute && !confirmed) {
    console.log('Dry-run mode: no data will be deleted. Use --execute --i-understand-test-data-only to actually remove test data.');
  }

  if (execute && !confirmed) {
    console.error('Refusing to delete data without --i-understand-test-data-only');
    process.exit(1);
  }

  const ds = createExamPortalDataSource();
  await ds.initialize();

  try {
    const regs = await getTestingRegulations(ds, patterns);

    if (!regs.length) {
      console.log(`No regulations matched patterns: ${patterns.map((p) => `"${p}"`).join(', ')}`);
      return;
    }

    console.log('Matching regulations:');
    for (const reg of regs) {
      console.log(`  - ${reg.id}: ${reg.code} | ${reg.name} | status=${reg.status}`);
    }

    if (!execute) {
      console.log('\nDry run only. Nothing was deleted.');
      return;
    }

    const summary = [];
    for (const reg of regs) {
      const result = await deleteRegulationData(ds, reg.id, reg.code, reg.name);
      summary.push(result);
    }

    console.log('\nDeleted test regulations and dependent data:');
    for (const item of summary) {
      console.log(`  - ${item.code} | ${item.name}`);
      console.log(`      exams: ${item.examIds.length}, subjects: ${item.subjectIds.length}`);
      console.log(`      payments: ${item.dependent.payments}, feeRecords: ${item.dependent.feeRecords}, applications: ${item.dependent.applications}`);
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
