'use strict';

const { EntitySchema } = require('typeorm');
const { BillType, BillStatus } = require('./remuneration.enums');
const { dateTransformer } = require('../../common/date-transformer');

/**
 * Remuneration bill for external examination work
 * (QP setting, lab/project externals, evaluation, observer, examiner).
 *
 * Professional fields are snapshotted on the bill so historical bills
 * stay intact if the professional profile is later updated.
 */
const RemunerationBill = new EntitySchema({
  name: 'RemunerationBill',
  tableName: 'remuneration_bills',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    billNumber: { type: 'varchar', length: 40, unique: true },
    billType: {
      type: 'varchar',
      length: 40,
      enum: Object.values(BillType),
    },
    status: {
      type: 'varchar',
      length: 40,
      enum: Object.values(BillStatus),
      default: BillStatus.DRAFT,
    },

    // Snapshot of professional profile
    professionalId: { type: 'int', nullable: true },
    accountHolderName: { type: 'varchar', length: 200, nullable: true },
    designation: { type: 'varchar', length: 150, nullable: true },
    organization: { type: 'varchar', length: 255, nullable: true },
    pan: { type: 'varchar', length: 20, nullable: true },
    phone: { type: 'varchar', length: 30, nullable: true },
    email: { type: 'varchar', length: 150, nullable: true },
    bankName: { type: 'varchar', length: 150, nullable: true },
    branchName: { type: 'varchar', length: 150, nullable: true },
    accountNumber: { type: 'varchar', length: 60, nullable: true },
    ifscCode: { type: 'varchar', length: 30, nullable: true },

    // Academic / exam context
    examId: { type: 'int', nullable: true },
    collegeId: { type: 'int', nullable: true },
    courseId: { type: 'int', nullable: true },
    branchId: { type: 'int', nullable: true },
    collegeName: { type: 'varchar', length: 255, nullable: true },
    courseName: { type: 'varchar', length: 150, nullable: true },
    branchNameSnap: { type: 'varchar', length: 150, nullable: true },
    batch: { type: 'varchar', length: 50, nullable: true },
    yearOfStudy: { type: 'int', nullable: true },
    semester: { type: 'int', nullable: true },
    examName: { type: 'varchar', length: 200, nullable: true },

    /**
     * Selected papers: [{ subjectId, examSubjectId?, code, name }]
     */
    subjects: { type: 'simple-json', nullable: true },

    /** Lab/project duration */
    durationFrom: { type: 'date', nullable: true, transformer: dateTransformer },
    durationTo: { type: 'date', nullable: true, transformer: dateTransformer },
    numberOfDays: { type: 'int', nullable: true },

    /**
     * Line items:
     * [{ remunerationFor, quantity, unitPrice, amount }]
     */
    lineItems: { type: 'simple-json', nullable: true },
    grandTotalQuantity: {
      type: 'decimal',
      precision: 12,
      scale: 2,
      default: 0,
    },
    grandTotalAmount: {
      type: 'decimal',
      precision: 12,
      scale: 2,
      default: 0,
    },
    amountInWords: { type: 'varchar', length: 500, nullable: true },

    billDate: { type: 'date', nullable: true, transformer: dateTransformer },
    officeNotes: { type: 'text', nullable: true },
    /**
     * Audit timeline:
     * [{ action, status, fromStatus?, by, byUsername?, at, note? }]
     */
    statusHistory: { type: 'simple-json', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      joinColumn: { name: 'examId' },
      nullable: true,
      onDelete: 'SET NULL',
    },
    professional: {
      type: 'many-to-one',
      target: 'Professional',
      joinColumn: { name: 'professionalId' },
      nullable: true,
      onDelete: 'SET NULL',
    },
  },
});

module.exports = { RemunerationBill };
