'use strict';

const { EntitySchema } = require('typeorm');

const SdmsSemester = new EntitySchema({
  name: 'SdmsSemester',
  tableName: 'semesters',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    collegeId: { type: 'int', name: 'college_id', nullable: true },
    courseId: { type: 'int', name: 'course_id' },
    academicYearId: { type: 'int', name: 'academic_year_id' },
    yearOfStudy: { type: 'tinyint', name: 'year_of_study' },
    batch: { type: 'varchar', length: 20, nullable: true },
    semesterNumber: { type: 'tinyint', name: 'semester_number' },
    startDate: { type: 'date', name: 'start_date', nullable: true },
    endDate: { type: 'date', name: 'end_date', nullable: true },
  },
});

module.exports = { SdmsSemester };
