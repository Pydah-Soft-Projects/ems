'use strict';

const { EntitySchema } = require('typeorm');
const { ExamType, ExamStatus } = require('./exam.enums');

const Exam = new EntitySchema({
  name: 'Exam',
  tableName: 'exams',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    name: { type: 'varchar', length: 200 },
    type: { type: 'varchar', length: 30, default: ExamType.REGULAR },
    allowedTypes: { type: 'simple-json', nullable: true },
    regulationId: { type: 'int' },
    college: { type: 'varchar', length: 150, nullable: true },
    course: { type: 'varchar', length: 100 },
    branch: { type: 'varchar', length: 100 },
    batch: { type: 'varchar', length: 50 },
    yearOfStudy: { type: 'int', default: 1 },
    semester: { type: 'int' },
    status: { type: 'varchar', length: 30, default: ExamStatus.DRAFT },
    examinationStartDate: { type: 'date', nullable: true },
    examinationEndDate: { type: 'date', nullable: true },
    applicationStartDate: { type: 'date', nullable: true },
    applicationEndDate: { type: 'date', nullable: true },
    lateFeeStartDate: { type: 'date', nullable: true },
    packageFee: { type: 'decimal', precision: 10, scale: 2, nullable: true },
    instructions: { type: 'text', nullable: true },
    rejectionRemarks: { type: 'text', nullable: true },
    approvedBy: { type: 'varchar', length: 100, nullable: true },
    approvedAt: { type: 'datetime', nullable: true },
    publishedAt: { type: 'datetime', nullable: true },
    hallTicketsReleasedAt: { type: 'datetime', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    regulation: {
      type: 'many-to-one',
      target: 'Regulation',
      joinColumn: { name: 'regulationId' },
    },
    examSubjects: {
      type: 'one-to-many',
      target: 'ExamSubject',
      inverseSide: 'exam',
      cascade: true,
      eager: true,
    },
    lateFeeSlabs: {
      type: 'one-to-many',
      target: 'LateFeeSlab',
      inverseSide: 'exam',
      cascade: true,
      eager: true,
    },
    scopes: {
      type: 'one-to-many',
      target: 'ExamScope',
      inverseSide: 'exam',
      cascade: true,
      eager: true,
    },
  },
});

const ExamScope = new EntitySchema({
  name: 'ExamScope',
  tableName: 'exam_scopes',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    college: { type: 'varchar', length: 150, nullable: true },
    course: { type: 'varchar', length: 100 },
    branch: { type: 'varchar', length: 100 },
    branchId: { type: 'int', nullable: true },
    batch: { type: 'varchar', length: 50 },
    yearOfStudy: { type: 'int' },
    semester: { type: 'int' },
    section: { type: 'varchar', length: 64, nullable: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      inverseSide: 'scopes',
      joinColumn: { name: 'examId' },
      onDelete: 'CASCADE',
    },
  },
});

const ExamSubject = new EntitySchema({
  name: 'ExamSubject',
  tableName: 'exam_subjects',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    subjectId: { type: 'int' },
    fee: { type: 'decimal', precision: 10, scale: 2 },
    examDate: { type: 'date', nullable: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      inverseSide: 'examSubjects',
      joinColumn: { name: 'examId' },
      onDelete: 'CASCADE',
    },
    subject: {
      type: 'many-to-one',
      target: 'Subject',
      joinColumn: { name: 'subjectId' },
      eager: true,
    },
  },
});

const LateFeeSlab = new EntitySchema({
  name: 'LateFeeSlab',
  tableName: 'late_fee_slabs',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    fromDay: { type: 'int' },
    toDay: { type: 'int' },
    amount: { type: 'decimal', precision: 10, scale: 2 },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      inverseSide: 'lateFeeSlabs',
      joinColumn: { name: 'examId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { Exam, ExamScope, ExamSubject, LateFeeSlab };
