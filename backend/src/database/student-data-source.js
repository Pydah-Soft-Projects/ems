'use strict';

const { DataSource } = require('typeorm');
const { buildStudentMysqlOptions } = require('./mysql-options');
const { SdmsCollege } = require('../sdms/entities/college.entity');
const { SdmsCourse } = require('../sdms/entities/course.entity');
const { SdmsCourseBranch } = require('../sdms/entities/course-branch.entity');
const { SdmsAcademicYear } = require('../sdms/entities/academic-year.entity');
const {
  SdmsBranchAcademicYear,
} = require('../sdms/entities/branch-academic-year.entity');
const { SdmsSemester } = require('../sdms/entities/semester.entity');
const { SdmsStudent } = require('../sdms/entities/student.entity');
const { SdmsStudentSection } = require('../sdms/entities/student-section.entity');
const {
  SdmsStudentCredentials,
} = require('../sdms/entities/student-credentials.entity');
const { SdmsEvent } = require('../sdms/entities/event.entity');

const sdmsEntities = [
  SdmsCollege,
  SdmsCourse,
  SdmsCourseBranch,
  SdmsAcademicYear,
  SdmsBranchAcademicYear,
  SdmsSemester,
  SdmsStudent,
  SdmsStudentSection,
  SdmsStudentCredentials,
  SdmsEvent,
];

function createStudentDataSource() {
  return new DataSource({
    ...buildStudentMysqlOptions(),
    entities: sdmsEntities,
    logging: false,
  });
}

module.exports = { sdmsEntities, createStudentDataSource };
