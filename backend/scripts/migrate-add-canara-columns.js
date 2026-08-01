'use strict';

/**
 * Ensure canara_payment_settings table exists (and migrate legacy columns).
 * Run: npm run migrate:add-canara
 */

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../.env'),
});
const { createExamPortalDataSource } = require('../src/database/data-source');
const {
  ensureCanaraPaymentSettingsTable,
} = require('../src/settings/ensure-canara-table');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  try {
    const result = await ensureCanaraPaymentSettingsTable(ds, console);
    console.log(
      result.created
        ? 'Created canara_payment_settings table.'
        : 'canara_payment_settings already exists.',
    );
    if (result.migrated) {
      console.log('Migrated legacy Canara columns into the new table.');
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
