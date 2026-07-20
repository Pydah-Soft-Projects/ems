'use strict';

const { EntitySchema } = require('typeorm');
const { BillType, BillStatus } = require('./remuneration.enums');

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
      length: 30,
      default: BillType.QP_SETTING,
    },
    status: {
      type: 'varchar',
      length: 20,
      default: BillStatus.DRAFT,
    },
    examId: { type: 'int', nullable: true },
    professionalId: { type: 'int', nullable: true },

    /** Snapshotted professional details */
    professionalName: { type: 'varchar', length: 200 },
    designation: { type: 'varchar', length: 150, nullable: true },
    organization: { type: 'text', nullable: true },
    contactNumber: { type: 'varchar', length: 30, nullable: true },
    email: { type: 'varchar', length: 150, nullable: true },
    bankName: { type: 'varchar', length: 150, nullable: true },
    accountHolderName: { type: 'varchar', length: 200, nullable: true },
    accountNumber: { type: 'varchar', length: 50, nullable: true },
    ifscCode: { type: 'varchar', length: 20, nullable: true },
    bankAddress: { type: 'text', nullable: true },

    /** Exam context (denormalized for print / historical display) */
    regulationId: { type: 'int', nullable: true },
    regulationCode: { type: 'varchar', length: 50, nullable: true },
    academicYear: { type: 'varchar', length: 50, nullable: true },
    course: { type: 'varchar', length: 100, nullable: true },
    branch: { type: 'varchar', length: 100, nullable: true },
    batch: { type: 'varchar', length: 50, nullable: true },
    yearOfStudy: { type: 'int', nullable: true },
    semester: { type: 'int', nullable: true },
    examName: { type: 'varchar', length: 200, nullable: true },

    /**
     * Selected papers: [{ subjectId, examSubjectId?, code, name }]
     */
    subjects: { type: 'simple-json', nullable: true },

    /** Lab/project duration */
    durationFrom: { type: 'date', nullable: true },
    durationTo: { type: 'date', nullable: true },
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

    billDate: { type: 'date', nullable: true },
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
