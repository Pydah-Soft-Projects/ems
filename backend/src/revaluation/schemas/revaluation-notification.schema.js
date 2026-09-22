'use strict';

const { EntitySchema } = require('typeorm');
const { dateTransformer } = require('../../common/date-transformer');

const RevaluationNotification = new EntitySchema({
  name: 'RevaluationNotification',
  tableName: 'revaluation_notifications',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    regulationId: { type: 'int' },
    title: { type: 'varchar', length: 200 },
    message: { type: 'text' },
    startDate: { type: 'date', transformer: dateTransformer },
    endDate: { type: 'date', transformer: dateTransformer },
    selectedScopes: { type: 'simple-json' },
    selectedYearSemesters: { type: 'simple-json' },
    excludedBatches: { type: 'simple-json', nullable: true },
    subjectIds: { type: 'simple-json' },
    feesByCount: { type: 'simple-json' },
    status: { type: 'varchar', length: 20, default: 'draft' },
    createdBy: { type: 'varchar', length: 150, nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    regulation: {
      type: 'many-to-one',
      target: 'Regulation',
      joinColumn: { name: 'regulationId' },
      onDelete: 'CASCADE',
    },
  },
});

const RevaluationApplication = new EntitySchema({
  name: 'RevaluationApplication',
  tableName: 'revaluation_applications',
  indices: [
    { name: 'UQ_revaluation_notification_student', columns: ['notificationId', 'studentRollNumber'], unique: true },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    notificationId: { type: 'int' },
    studentRollNumber: { type: 'varchar', length: 50 },
    studentName: { type: 'varchar', length: 150 },
    selectedSubjectIds: { type: 'simple-json' },
    feeAmount: { type: 'decimal', precision: 10, scale: 2 },
    status: { type: 'varchar', length: 20, default: 'pending' },
    feeRecordId: { type: 'int', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
  },
  relations: {
    notification: {
      type: 'many-to-one',
      target: 'RevaluationNotification',
      joinColumn: { name: 'notificationId' },
      onDelete: 'CASCADE',
    },
    feeRecord: {
      type: 'one-to-one',
      target: 'ExamFeeRecord',
      joinColumn: { name: 'feeRecordId' },
    },
  },
});

module.exports = { RevaluationNotification, RevaluationApplication };
