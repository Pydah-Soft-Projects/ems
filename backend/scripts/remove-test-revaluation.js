'use strict';

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../.env'),
});
const { createExamPortalDataSource } = require('../src/database/data-source');

async function main() {
  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const notifications = await runner.query(
      'SELECT id FROM revaluation_notifications WHERE title = ? AND createdBy = ?',
      ['Revaluation Applications Open', ''],
    );
    const fallback = notifications.length
      ? notifications
      : await runner.query(
          'SELECT id FROM revaluation_notifications WHERE title = ?',
          ['Revaluation Applications Open'],
        );
    if (!fallback.length) {
      console.log('No matching test revaluation notification found.');
      return;
    }
    for (const row of fallback) {
      const applications = await runner.query(
        'SELECT feeRecordId FROM revaluation_applications WHERE notificationId = ?',
        [row.id],
      );
      await runner.query('DELETE FROM revaluation_applications WHERE notificationId = ?', [row.id]);
      for (const application of applications) {
        if (application.feeRecordId) {
          await runner.query('DELETE FROM payments WHERE feeRecordId = ?', [application.feeRecordId]);
          await runner.query('DELETE FROM exam_fee_records WHERE id = ? AND feeType = ?', [application.feeRecordId, 'REVALUATION']);
        }
      }
      await runner.query('DELETE FROM revaluation_notifications WHERE id = ?', [row.id]);
      console.log(`Removed test revaluation notification ${row.id}.`);
    }
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Failed to remove test revaluation:', error.message);
  process.exit(1);
});
