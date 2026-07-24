'use strict';

/**
 * Migration: Add selfOnline payment columns to payment_gateway_settings table
 * Run: npm run migrate:add-self-online
 */

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../.env'),
});
const { createExamPortalDataSource } = require('../src/database/data-source');
const {
  ensurePaymentGatewaySelfOnlineColumns,
} = require('../src/settings/ensure-self-online-columns');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  try {
    const result = await ensurePaymentGatewaySelfOnlineColumns(ds, console);
    if (result.added.length === 0) {
      console.log('All Self Online columns already present.');
    } else {
      console.log('Added columns:', result.added.join(', '));
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
