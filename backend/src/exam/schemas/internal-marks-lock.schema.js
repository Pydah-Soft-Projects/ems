'use strict';

const { EntitySchema } = require('typeorm');

/**
 * Stores manual lock/unlock overrides and audit details for Internal Marks Entry
 * per examination notification and subject.
 */
const InternalMarksLock = new EntitySchema({
  name: 'InternalMarksLock',
  tableName: 'internal_marks_locks',
  indices: [
    {
      name: 'IDX_internal_marks_locks_lookup',
      columns: ['examId', 'subjectCode'],
      unique: true,
    },
    {
      name: 'IDX_internal_marks_locks_exam',
      columns: ['examId'],
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    examId: { type: 'int' },
    subjectCode: { type: 'varchar', length: 50 },
    isUnlocked: { type: 'boolean', default: false },
    unlockedBy: { type: 'varchar', length: 180, nullable: true },
    unlockedAt: { type: 'datetime', nullable: true },
    unlockReason: { type: 'text', nullable: true },
    facultyName: { type: 'varchar', length: 180, nullable: true },
    facultyEmail: { type: 'varchar', length: 180, nullable: true },
    relockedBy: { type: 'varchar', length: 180, nullable: true },
    relockedAt: { type: 'datetime', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
  relations: {
    exam: {
      type: 'many-to-one',
      target: 'Exam',
      joinColumn: { name: 'examId' },
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { InternalMarksLock };
