'use strict';

const { EntitySchema } = require('typeorm');
const { ExamType, FeeStatus } = require('./exam.enums');

/**
 * Date transformer to handle timezone issues.
 * Converts DATE columns from MySQL to/from YYYY-MM-DD strings to prevent
 * timezone-based date shifts between local and hosted environments.
 */
const dateTransformer = {
  to: (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value;
  },
  from: (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value instanceof Date) {
      const year = value.getUTCFullYear();
      const month = String(value.getUTCMonth() + 1).padStart(2, '0');
      const day = String(value.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return value;
  },
};

const ExamFeeRecord = new EntitySchema({
  name: 'ExamFeeRecord',
  tableName: 'exam_fee_records',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    examType: { type: 'varchar', length: 30, default: ExamType.REGULAR },
    studentRollNumber: { type: 'varchar', length: 50 },
    studentName: { type: 'varchar', length: 150 },
    selectedSubjectIds: { type: 'simple-json' },
    feeBreakdown: { type: 'simple-json' },
    baseFee: { type: 'decimal', precision: 10, scale: 2, default: 0 },
    lateFee: { type: 'decimal', precision: 10, scale: 2, default: 0 },
    totalAmount: { type: 'decimal', precision: 10, scale: 2 },
    status: { type: 'varchar', length: 20, default: FeeStatus.PENDING },
    dueDate: { type: 'date', nullable: true, transformer: dateTransformer },
    createdAt: { type: 'datetime', createDate: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      joinColumn: { name: 'examId' },
    },
    payments: {
      type: 'one-to-many',
      target: 'Payment',
      inverseSide: 'feeRecord',
    },
    application: {
      type: 'one-to-one',
      target: 'ExamApplication',
      inverseSide: 'feeRecord',
    },
  },
});

const ExamApplication = new EntitySchema({
  name: 'ExamApplication',
  tableName: 'exam_applications',
  indices: [
    { name: 'IDX_exam_applications_examId', columns: ['examId'] },
    {
      name: 'UQ_exam_app_enrollment',
      columns: ['examId', 'studentRollNumber'],
      unique: true,
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    examType: { type: 'varchar', length: 30, default: ExamType.REGULAR },
    studentRollNumber: { type: 'varchar', length: 50 },
    studentName: { type: 'varchar', length: 150 },
    /** Snapshot of the student's branch/section at application time, used to
     * resolve branch/section-specific papers on the hall ticket. */
    studentBranch: { type: 'varchar', length: 100, nullable: true },
    studentSection: { type: 'varchar', length: 64, nullable: true },
    selectedSubjectIds: { type: 'simple-json' },
    feeBreakdown: { type: 'simple-json' },
    declarationAccepted: { type: 'boolean', default: false },
    consentAccepted: { type: 'boolean', default: false },
    feeRecordId: { type: 'int' },
    submittedAt: { type: 'datetime', createDate: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      joinColumn: { name: 'examId' },
    },
    feeRecord: {
      type: 'one-to-one',
      target: 'ExamFeeRecord',
      joinColumn: { name: 'feeRecordId' },
      onDelete: 'CASCADE',
    },
  },
});

const Payment = new EntitySchema({
  name: 'Payment',
  tableName: 'payments',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    feeRecordId: { type: 'int' },
    amountPaid: { type: 'decimal', precision: 10, scale: 2 },
    paymentMode: { type: 'varchar', length: 20 },
    paymentMethod: { type: 'varchar', length: 30 },
    status: { type: 'varchar', length: 30 },
    receiptNumber: { type: 'varchar', length: 100, unique: true },
    transactionReference: { type: 'varchar', length: 100, nullable: true },
    collectedBy: { type: 'varchar', length: 100, nullable: true },
    collectorUsername: { type: 'varchar', length: 150, nullable: true },
    remarks: { type: 'text', nullable: true },
    gatewayResponse: { type: 'text', nullable: true },
    paidAt: { type: 'datetime', createDate: true },
  },
  relations: {
    feeRecord: {
      type: 'many-to-one',
      target: 'ExamFeeRecord',
      inverseSide: 'payments',
      joinColumn: { name: 'feeRecordId' },
    },
  },
});

module.exports = { ExamFeeRecord, ExamApplication, Payment };
