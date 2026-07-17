'use strict';

const { EntitySchema } = require('typeorm');

const SdmsCourse = new EntitySchema({
  name: 'SdmsCourse',
  tableName: 'courses',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    collegeId: { type: 'int', name: 'college_id', nullable: true },
    name: { type: 'varchar', length: 255 },
    code: { type: 'varchar', length: 50, nullable: true },
    level: { type: 'varchar', length: 20, nullable: true },
    totalYears: { type: 'tinyint', name: 'total_years', default: 4 },
    semestersPerYear: { type: 'tinyint', name: 'semesters_per_year', default: 2 },
    yearSemesterConfig: {
      type: 'json',
      name: 'year_semester_config',
      nullable: true,
    },
    isActive: { type: 'boolean', name: 'is_active', default: true },
  },
  relations: {
    college: {
      type: 'many-to-one',
      target: 'SdmsCollege',
      inverseSide: 'courses',
      joinColumn: { name: 'college_id' },
    },
    branches: {
      type: 'one-to-many',
      target: 'SdmsCourseBranch',
      inverseSide: 'course',
    },
  },
});

module.exports = { SdmsCourse };
