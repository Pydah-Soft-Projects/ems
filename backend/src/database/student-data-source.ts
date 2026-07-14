import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { buildStudentMysqlOptions } from './mysql-options';
import { SdmsCollege } from '../sdms/entities/college.entity';
import { SdmsCourse } from '../sdms/entities/course.entity';
import { SdmsCourseBranch } from '../sdms/entities/course-branch.entity';
import { SdmsAcademicYear } from '../sdms/entities/academic-year.entity';
import { SdmsBranchAcademicYear } from '../sdms/entities/branch-academic-year.entity';
import { SdmsSemester } from '../sdms/entities/semester.entity';
import { SdmsStudent } from '../sdms/entities/student.entity';
import { SdmsStudentSection } from '../sdms/entities/student-section.entity';
import { SdmsStudentCredentials } from '../sdms/entities/student-credentials.entity';

export const sdmsEntities = [
  SdmsCollege,
  SdmsCourse,
  SdmsCourseBranch,
  SdmsAcademicYear,
  SdmsBranchAcademicYear,
  SdmsSemester,
  SdmsStudent,
  SdmsStudentSection,
  SdmsStudentCredentials,
];

export function createStudentDataSource() {
  return new DataSource({
    ...buildStudentMysqlOptions(),
    entities: sdmsEntities,
    logging: false,
  });
}
