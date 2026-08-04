'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  throw new Error(`Missing environment file: ${envPath}`);
}
dotenv.config({ path: envPath, override: true });
if (!process.env.EXAM_PORTAL_DB_PASSWORD) {
  throw new Error('EXAM_PORTAL_DB_PASSWORD is not set in backend/.env or environment.');
}

const { createExamPortalDataSource } = require('../src/database/data-source');

function formatValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function printTable(title, rows) {
  console.log(`\n=== ${title} (${rows.length} rows) ===`);
  if (!rows.length) {
    console.log('No rows found.');
    return;
  }
  rows.forEach((row, index) => {
    console.log(`\n--- row ${index + 1} ---`);
    Object.keys(row).forEach((key) => {
      console.log(`${key}: ${formatValue(row[key])}`);
    });
  });
}

async function main() {
  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();

  const canaraRepo = dataSource.getRepository('CanaraPaymentSettings');
  const oauthAuditRepo = dataSource.getRepository('CanaraOauthAudit');

  const canaraRows = await canaraRepo.find();
  const auditRows = await oauthAuditRepo.find({ order: { id: 'ASC' } });

  printTable('canara_payment_settings', canaraRows);
  printTable('canara_oauth_audit', auditRows);

  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Failed to read Canara data:', err.message || err);
  process.exit(1);
});
