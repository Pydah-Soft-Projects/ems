'use strict';

const { createExamPortalDataSource } = require('../src/database/data-source');
const { createServices } = require('../src/database/container');

async function main() {
  const ds = createExamPortalDataSource();
  await ds.initialize();
  const services = createServices(ds, null);
  try {
    const result = await services.canaraQr.createOrder(3, {
      actor: { role: 'Super Admin', username: 'debug', fullName: 'Debug User' },
    });
    console.log('RESULT', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('ERROR MESSAGE:', err.message);
    if (err.stack) console.error(err.stack);
    if (err.raw) console.error('ERROR RAW:', JSON.stringify(err.raw, null, 2));
    if (err.cause) console.error('ERROR CAUSE:', err.cause);
  }
  await ds.destroy();
}

main().catch((err) => {
  console.error('UNCAUGHT', err);
  process.exit(1);
});
