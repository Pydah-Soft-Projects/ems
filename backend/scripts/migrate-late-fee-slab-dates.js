'use strict';

/**
 * Migration: late_fee_slabs fromDay/toDay → fromDate/toDate
 * Run: npm run migrate:late-fee-slab-dates
 */

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../.env'),
});
const { createExamPortalDataSource } = require('../src/database/data-source');
const {
  ensureLateFeeSlabDateColumns,
} = require('../src/exam/ensure-late-fee-slab-dates');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  try {
    const result = await ensureLateFeeSlabDateColumns(ds, console);
    console.log(result);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
