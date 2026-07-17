'use strict';

const { EntitySchema } = require('typeorm');

const SdmsStudent = new EntitySchema({
  name: 'SdmsStudent',
  tableName: 'students',
  columns: {
    id: { type: 'int', primary: true, generated: true },
    college: { type: 'varchar', length: 255, nullable: true },
    course: { type: 'varchar', length: 100, nullable: true },
    branch: { type: 'varchar', length: 100, nullable: true },
    batch: { type: 'varchar', length: 50, nullable: true },
    section: { type: 'varchar', length: 100, nullable: true },
    currentYear: { type: 'tinyint', name: 'current_year', default: 1 },
    currentSemester: { type: 'tinyint', name: 'current_semester', default: 1 },
    studentName: { type: 'varchar', length: 255, name: 'student_name' },
    admissionNumber: {
      type: 'varchar',
      length: 100,
      name: 'admission_number',
      nullable: true,
    },
    pinNo: { type: 'varchar', length: 50, name: 'pin_no', nullable: true },
    studentMobile: {
      type: 'varchar',
      length: 20,
      name: 'student_mobile',
      nullable: true,
    },
    preferredMobileNumber: {
      type: 'varchar',
      length: 20,
      name: 'preferred_mobile_number',
      nullable: true,
    },
    email: { type: 'varchar', length: 150, nullable: true },
    studentStatus: {
      type: 'varchar',
      length: 50,
      name: 'student_status',
      nullable: true,
    },
  },
  relations: {
    studentSection: {
      type: 'one-to-one',
      target: 'SdmsStudentSection',
      inverseSide: 'student',
    },
  },
});

module.exports = { SdmsStudent };
