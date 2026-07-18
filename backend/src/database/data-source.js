'use strict';

const { DataSource } = require('typeorm');
const { config } = require('../config');
const {
  buildExamPortalMysqlOptions,
  buildSqliteOptions,
} = require('./mysql-options');
const { Regulation } = require('../regulations/schemas/regulation.schema');
const { RegulationScope } = require('../regulations/schemas/regulation-scope.schema');
const { Subject } = require('../subjects/schemas/subject.schema');
const {
  SubjectMappingEntry,
} = require('../subjects/schemas/subject-mapping-entry.schema');
const {
  Exam,
  ExamSubject,
  LateFeeSlab,
  ExamScope,
} = require('../exam/schemas/exam.schema');
const {
  ExamFeeRecord,
  ExamApplication,
  Payment,
} = require('../exam/schemas/fee.schema');
const {
  ResultUpload,
  SubjectResult,
} = require('../exam/schemas/result.schema');
const {
  PaymentGatewaySettings,
} = require('../settings/payment-gateway-settings.entity');

const entities = [
  Regulation,
  RegulationScope,
  Subject,
  SubjectMappingEntry,
  Exam,
  ExamSubject,
  LateFeeSlab,
  ExamScope,
  ExamFeeRecord,
  ExamApplication,
  Payment,
  ResultUpload,
  SubjectResult,
  PaymentGatewaySettings,
];

function createExamPortalDataSource() {
  const base = config.simulate.useSqlite
    ? buildSqliteOptions(config.simulate.sqlitePath)
    : buildExamPortalMysqlOptions();

  return new DataSource({
    ...base,
    entities,
    logging: false,
  });
}

module.exports = { entities, createExamPortalDataSource };
