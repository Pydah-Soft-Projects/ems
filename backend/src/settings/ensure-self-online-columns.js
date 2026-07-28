'use strict';

/**
 * Ensures Self Online columns exist on payment_gateway_settings.
 * Older DBs created before Self Online only had Razorpay columns; TypeORM
 * SELECT/UPDATE then fails with "Unknown column selfOnline*", and the
 * Settings UI falls back to empty defaults (looks like settings were lost).
 */
const SELF_ONLINE_COLUMNS = [
  {
    name: 'selfOnlineEnabled',
    definition:
      "TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Enable college UPI / Self Online'",
  },
  {
    name: 'selfOnlineUpiId',
    definition:
      "VARCHAR(150) NULL COMMENT 'College merchant UPI ID'",
  },
  {
    name: 'selfOnlineMerchantName',
    definition:
      "VARCHAR(150) NULL COMMENT 'Merchant name on UPI QR'",
  },
  {
    name: 'selfOnlinePaymentNote',
    definition:
      "VARCHAR(100) NULL DEFAULT 'Exam Fee' COMMENT 'Default UPI payment note'",
  },
  {
    name: 'selfOnlineExpiryHours',
    definition:
      "INT NOT NULL DEFAULT 48 COMMENT 'Pending Self Online expiry hours'",
  },
  {
    name: 'restrictExamApplyOnFeeDues',
    definition:
      "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Block exam apply / hall tickets when student has overdue fee dues'",
  },
];

async function ensurePaymentGatewaySelfOnlineColumns(dataSource, log = console) {
  if (!dataSource?.isInitialized) return { added: [], skipped: true };

  const rows = await dataSource.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payment_gateway_settings'`,
  );
  const existing = new Set(rows.map((r) => r.name));

  if (!existing.has('id') && existing.size === 0) {
    // Table missing — let TypeORM synchronize create it.
    return { added: [], skipped: true };
  }

  const added = [];
  for (const col of SELF_ONLINE_COLUMNS) {
    if (existing.has(col.name)) continue;
    await dataSource.query(
      `ALTER TABLE payment_gateway_settings ADD COLUMN \`${col.name}\` ${col.definition}`,
    );
    added.push(col.name);
  }

  if (added.length && typeof log.info === 'function') {
    log.info(
      { event: 'schema.self_online_columns_added', columns: added },
      'Added missing Self Online payment settings columns',
    );
  }

  return { added, skipped: false };
}

module.exports = {
  SELF_ONLINE_COLUMNS,
  ensurePaymentGatewaySelfOnlineColumns,
};
