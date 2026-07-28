'use strict';

/**
 * Migrates late_fee_slabs from day-count (fromDay/toDay) to calendar dates
 * (fromDate/toDate). Day N = lateFeeStartDate + (N - 1) days.
 *
 * Run: npm run migrate:late-fee-slab-dates
 * Also invoked on backend boot for MySQL.
 */

function addDaysIso(isoDate, days) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function columnNames(dataSource, table) {
  const rows = await dataSource.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?`,
    [table],
  );
  return new Set(rows.map((r) => r.name));
}

async function ensureLateFeeSlabDateColumns(dataSource, log = console) {
  if (!dataSource?.isInitialized) return { migrated: false, skipped: true };

  const cols = await columnNames(dataSource, 'late_fee_slabs');
  if (cols.size === 0) {
    return { migrated: false, skipped: true };
  }

  const hasFromDay = cols.has('fromDay');
  const hasFromDate = cols.has('fromDate');

  if (!hasFromDate) {
    await dataSource.query(
      `ALTER TABLE late_fee_slabs
       ADD COLUMN fromDate DATE NULL COMMENT 'Inclusive late-fee slab start date'`,
    );
    await dataSource.query(
      `ALTER TABLE late_fee_slabs
       ADD COLUMN toDate DATE NULL COMMENT 'Inclusive late-fee slab end date; NULL = until application end'`,
    );
    if (typeof log.info === 'function') {
      log.info(
        { event: 'schema.late_fee_slab_dates_added' },
        'Added fromDate/toDate columns to late_fee_slabs',
      );
    }
  }

  const colsAfter = await columnNames(dataSource, 'late_fee_slabs');
  if (colsAfter.has('fromDay')) {
    // Convert day indices → calendar dates using each exam's lateFeeStartDate.
    const slabs = await dataSource.query(
      `SELECT s.id, s.fromDay, s.toDay, e.lateFeeStartDate AS lateFeeStartDate
       FROM late_fee_slabs s
       INNER JOIN exams e ON e.id = s.examId
       WHERE s.fromDate IS NULL AND s.fromDay IS NOT NULL`,
    );
    for (const row of slabs) {
      const start = row.lateFeeStartDate
        ? String(row.lateFeeStartDate).slice(0, 10)
        : null;
      if (!start) continue;
      const fromDate = addDaysIso(start, Number(row.fromDay) - 1);
      const toDate =
        row.toDay == null || row.toDay === ''
          ? null
          : addDaysIso(start, Number(row.toDay) - 1);
      if (!fromDate) continue;
      await dataSource.query(
        `UPDATE late_fee_slabs SET fromDate = ?, toDate = ? WHERE id = ?`,
        [fromDate, toDate, row.id],
      );
    }

    // Drop legacy day columns once dates are populated (or unconvertible rows remain null).
    await dataSource.query(
      `ALTER TABLE late_fee_slabs DROP COLUMN fromDay, DROP COLUMN toDay`,
    );
    if (typeof log.info === 'function') {
      log.info(
        {
          event: 'schema.late_fee_slab_days_removed',
          converted: slabs.length,
        },
        'Converted late fee slabs from day counts to dates',
      );
    }
    return { migrated: true, skipped: false, converted: slabs.length };
  }

  // Repair rows where TypeORM/MySQL cast old int day values into invalid dates.
  const bad = await dataSource.query(
    `SELECT s.id,
            DATE_FORMAT(e.lateFeeStartDate, '%Y-%m-%d') AS lateFeeStartDate
     FROM late_fee_slabs s
     INNER JOIN exams e ON e.id = s.examId
     WHERE s.fromDate IS NULL
        OR YEAR(s.fromDate) < 2000`,
  );
  let repaired = 0;
  for (const row of bad) {
    const start = row.lateFeeStartDate
      ? String(row.lateFeeStartDate).slice(0, 10)
      : null;
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
    if (parseInt(start.slice(0, 4), 10) < 2000) continue;
    await dataSource.query(
      `UPDATE late_fee_slabs SET fromDate = ?, toDate = NULL WHERE id = ?`,
      [start, row.id],
    );
    repaired += 1;
  }
  if (repaired && typeof log.info === 'function') {
    log.info(
      { event: 'schema.late_fee_slab_dates_repaired', repaired },
      'Repaired invalid late fee slab dates from lateFeeStartDate',
    );
  }

  return {
    migrated: repaired > 0,
    skipped: false,
    alreadyDated: true,
    repaired,
  };
}

module.exports = {
  addDaysIso,
  ensureLateFeeSlabDateColumns,
};
