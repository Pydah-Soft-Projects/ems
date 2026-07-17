'use strict';

const { EntitySchema } = require('typeorm');

const SdmsCourseBranch = new EntitySchema({
  name: 'SdmsCourseBranch',
  tableName: 'course_branches',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    courseId: { type: 'int', name: 'course_id' },
    name: { type: 'varchar', length: 255 },
    code: { type: 'varchar', length: 50, nullable: true },
    totalYears: { type: 'tinyint', name: 'total_years', nullable: true },
    semestersPerYear: {
      type: 'tinyint',
      name: 'semesters_per_year',
      nullable: true,
    },
    yearSemesterConfig: {
      type: 'json',
      name: 'year_semester_config',
      nullable: true,
    },
    metadata: { type: 'json', nullable: true },
    isActive: { type: 'boolean', name: 'is_active', default: true },
  },
  relations: {
    course: {
      type: 'many-to-one',
      target: 'SdmsCourse',
      inverseSide: 'branches',
      joinColumn: { name: 'course_id' },
    },
    studentSections: {
      type: 'one-to-many',
      target: 'SdmsStudentSection',
      inverseSide: 'branch',
    },
  },
});

module.exports = { SdmsCourseBranch };
