'use strict';

const { EntitySchema } = require('typeorm');

const SdmsStudentSection = new EntitySchema({
  name: 'SdmsStudentSection',
  tableName: 'student_sections',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    studentId: { type: 'int', name: 'student_id', unique: true },
    branchId: { type: 'int', name: 'branch_id' },
    batch: { type: 'varchar', length: 32 },
    sectionName: { type: 'varchar', length: 64, name: 'section_name' },
    isManual: { type: 'tinyint', name: 'is_manual', default: 0 },
  },
  relations: {
    student: {
      type: 'one-to-one',
      target: 'SdmsStudent',
      inverseSide: 'studentSection',
      joinColumn: { name: 'student_id' },
    },
    branch: {
      type: 'many-to-one',
      target: 'SdmsCourseBranch',
      inverseSide: 'studentSections',
      joinColumn: { name: 'branch_id' },
    },
  },
});

module.exports = { SdmsStudentSection };
