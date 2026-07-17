'use strict';

const { EntitySchema } = require('typeorm');

const SdmsBranchAcademicYear = new EntitySchema({
  name: 'SdmsBranchAcademicYear',
  tableName: 'branch_academic_years',
  columns: {
    branchId: { type: 'int', name: 'branch_id', primary: true },
    academicYearId: { type: 'int', name: 'academic_year_id', primary: true },
    createdAt: { type: 'timestamp', name: 'created_at', nullable: true },
  },
  relations: {
    branch: {
      type: 'many-to-one',
      target: 'SdmsCourseBranch',
      joinColumn: { name: 'branch_id' },
    },
    academicYear: {
      type: 'many-to-one',
      target: 'SdmsAcademicYear',
      joinColumn: { name: 'academic_year_id' },
    },
  },
});

module.exports = { SdmsBranchAcademicYear };
