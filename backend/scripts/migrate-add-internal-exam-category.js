'use strict';

require('dotenv').config({
  path: require('node:path').resolve(__dirname, '../.env'),
});
const { createExamPortalDataSource } = require('../src/database/data-source');

async function main() {
  const dataSource = createExamPortalDataSource();
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    if (!(await queryRunner.hasColumn('exams', 'examCategory'))) {
      await queryRunner.query(
        "ALTER TABLE `exams` ADD COLUMN `examCategory` VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL'",
      );
      console.log('Added exams.examCategory (existing exams default to EXTERNAL).');
    } else {
      console.log('exams.examCategory already exists.');
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Internal exam category migration failed:', error.message);
  process.exit(1);
});
