import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from '../config';
import { buildExamPortalMysqlOptions, buildSqliteOptions } from './mysql-options';
import { Regulation } from '../regulations/schemas/regulation.schema';
import { RegulationScope } from '../regulations/schemas/regulation-scope.schema';
import { Subject } from '../subjects/schemas/subject.schema';
import { SubjectMappingEntry } from '../subjects/schemas/subject-mapping-entry.schema';
import {
  Exam,
  ExamSubject,
  LateFeeSlab,
} from '../exam/schemas/exam.schema';
import { ExamFeeRecord, Payment } from '../exam/schemas/fee.schema';

export const entities = [
  Regulation,
  RegulationScope,
  Subject,
  SubjectMappingEntry,
  Exam,
  ExamSubject,
  LateFeeSlab,
  ExamFeeRecord,
  Payment,
];

export function createExamPortalDataSource() {
  const base =
    config.simulate.useSqlite
      ? buildSqliteOptions(config.simulate.sqlitePath)
      : buildExamPortalMysqlOptions();

  return new DataSource({
    ...base,
    entities,
    logging: false,
  });
}
