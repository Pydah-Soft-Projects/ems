'use strict';

/**
 * Checks late-fee slab dates and any audit history for exam slab edits.
 *
 * Usage:
 *   cd backend
 *   node scripts/check-late-fee-slab-audit.js
 */

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../.env'),
});

const { createExamPortalDataSource } = require('../src/database/data-source');

async function columnNames(dataSource, tableName) {
  const rows = await dataSource.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [tableName],
  );
  return new Set(rows.map((row) => row.name));
}

async function listAuditCandidates(dataSource) {
  const auditTable = await dataSource.query(
    `SELECT TABLE_NAME AS name
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ems_audit_logs'`,
  );

  if (!auditTable.length) {
    return [];
  }

  const rows = await dataSource.query(
    `SELECT id, action, targetType, targetId, detail, createdAt
     FROM ems_audit_logs
     WHERE LOWER(action) LIKE '%exam%'
        OR LOWER(action) LIKE '%late%'
        OR LOWER(targetType) IN ('exam', 'latefeeslab', 'late_fee_slab', 'latefee')
        OR JSON_EXTRACT(detail, '$.lateFeeSlabs') IS NOT NULL
     ORDER BY createdAt DESC
     LIMIT 50`,
  );

  return rows;
}

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();

  try {
    const tableExists = await ds.query(
      `SELECT TABLE_NAME AS name
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'late_fee_slabs'`,
    );

    if (!tableExists.length) {
      console.log('late_fee_slabs table not found. Nothing to audit.');
      return;
    }

    const cols = await columnNames(ds, 'late_fee_slabs');
    console.log('Late fee slab columns:', Array.from(cols).sort().join(', '));

    const slabRows = await ds.query(
      `SELECT s.id, s.examId, e.name AS examName, s.fromDate, s.toDate, s.amount
       FROM late_fee_slabs s
       LEFT JOIN exams e ON e.id = s.examId
       ORDER BY s.examId, s.id`,
    );

    const legacyCols = new Set(await columnNames(ds, 'late_fee_slabs'));
    const hasLegacyDayColumns = legacyCols.has('fromDay') || legacyCols.has('toDay');

    const missingDates = slabRows.filter((row) => row.fromDate == null || row.toDate == null);

    console.log('\n=== late_fee_slabs overview ===');
    console.log(`Rows: ${slabRows.length}`);
    console.log(`Rows missing date values: ${missingDates.length}`);

    if (missingDates.length > 0) {
      console.log('\nMissing date rows:');
      for (const row of missingDates) {
        console.log(JSON.stringify({
          id: row.id,
          examId: row.examId,
          examName: row.examName,
          fromDate: row.fromDate,
          toDate: row.toDate,
          amount: row.amount,
          legacyFromDay: hasLegacyDayColumns ? 'present' : 'not present',
          legacyToDay: hasLegacyDayColumns ? 'present' : 'not present',
        }, null, 2));
      }
    }

    const auditRows = await listAuditCandidates(ds);
    console.log('\n=== audit log candidates ===');
    if (!auditRows.length) {
      console.log('No exam / late-fee audit entries were found in ems_audit_logs.');
    } else {
      for (const row of auditRows) {
        console.log(JSON.stringify({
          id: row.id,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          createdAt: row.createdAt,
          detail: row.detail,
        }, null, 2));
      }
    }

    if (hasLegacyDayColumns) {
      console.log('\nLegacy day columns are still present. These rows may be using the old day-based slab format.');
    }

    console.log('\nSummary:');
    console.log('1) If fromDate/toDate are null, the slab was not migrated or was created without a date range.');
    console.log('2) The current code stores late-fee slabs as calendar dates only, not as audit snapshots.');
    console.log('3) If audit rows are absent, there is no historical reconstruction of previous slab dates in the current schema.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Late-fee slab audit check failed:', err?.stack || err?.message || err);
  process.exit(1);
});
