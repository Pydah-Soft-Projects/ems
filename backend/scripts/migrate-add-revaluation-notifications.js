'use strict';

/** Migration: add notification-based revaluation tables. */
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
    for (const [column, definition] of [['feeType', "VARCHAR(30) NOT NULL DEFAULT 'EXAM'"], ['feeLabel', 'VARCHAR(200) NULL'], ['revaluationNotificationId', 'INT NULL']]) {
      if (!(await queryRunner.hasColumn('exam_fee_records', column))) {
        await queryRunner.query(`ALTER TABLE \`exam_fee_records\` ADD COLUMN \`${column}\` ${definition}`);
        console.log(`Added exam_fee_records.${column}`);
      }
    }
    await queryRunner.query('ALTER TABLE `exam_fee_records` MODIFY COLUMN `examId` INT NULL');
    console.log('Made exam_fee_records.examId nullable for revaluation fees');
    const hasNotifications = await queryRunner.hasTable('revaluation_notifications');
    if (!hasNotifications) {
      await queryRunner.query(`
        CREATE TABLE \`revaluation_notifications\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`regulationId\` INT NOT NULL,
          \`title\` VARCHAR(200) NOT NULL,
          \`message\` TEXT NOT NULL,
          \`startDate\` DATE NOT NULL,
          \`endDate\` DATE NOT NULL,
          \`selectedScopes\` TEXT NOT NULL,
          \`selectedYearSemesters\` TEXT NOT NULL,
          \`excludedBatches\` TEXT NULL,
          \`subjectIds\` TEXT NOT NULL,
          \`feesByCount\` TEXT NOT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'draft',
          \`createdBy\` VARCHAR(150) NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          CONSTRAINT \`FK_revaluation_notification_regulation\` FOREIGN KEY (\`regulationId\`) REFERENCES \`regulations\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('Created revaluation_notifications');
    } else if (!(await queryRunner.hasColumn('revaluation_notifications', 'selectedYearSemesters'))) {
      await queryRunner.query('ALTER TABLE `revaluation_notifications` ADD COLUMN `selectedYearSemesters` TEXT NOT NULL');
      console.log('Added revaluation_notifications.selectedYearSemesters');
    }
    if (await queryRunner.hasTable('revaluation_applications') && !(await queryRunner.hasColumn('revaluation_applications', 'feeRecordId'))) {
      await queryRunner.query('ALTER TABLE `revaluation_applications` ADD COLUMN `feeRecordId` INT NULL');
      console.log('Added revaluation_applications.feeRecordId');
    }
    const hasApplications = await queryRunner.hasTable('revaluation_applications');
    if (!hasApplications) {
      await queryRunner.query(`
        CREATE TABLE \`revaluation_applications\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`notificationId\` INT NOT NULL,
          \`studentRollNumber\` VARCHAR(50) NOT NULL,
          \`studentName\` VARCHAR(150) NOT NULL,
          \`selectedSubjectIds\` TEXT NOT NULL,
          \`feeAmount\` DECIMAL(10,2) NOT NULL,
          \`status\` VARCHAR(20) NOT NULL DEFAULT 'pending',
          \`feeRecordId\` INT NULL,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_revaluation_notification_student\` (\`notificationId\`, \`studentRollNumber\`),
          CONSTRAINT \`FK_revaluation_application_notification\` FOREIGN KEY (\`notificationId\`) REFERENCES \`revaluation_notifications\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('Created revaluation_applications');
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Revaluation migration failed:', error.message);
  process.exit(1);
});
