'use strict';

const { AppError } = require('../common/errors');
const { AuthService } = require('../auth/auth.service');
const { RegulationsService } = require('../regulations/regulations.service');
const { SubjectsService } = require('../subjects/subjects.service');
const { ExamService } = require('../exam/exam.service');
const { createSdmsService } = require('../sdms/sdms.service');
const { Regulation } = require('../regulations/schemas/regulation.schema');
const { RegulationScope } = require('../regulations/schemas/regulation-scope.schema');
const { Subject } = require('../subjects/schemas/subject.schema');
const {
  SubjectMappingEntry,
} = require('../subjects/schemas/subject-mapping-entry.schema');
const { Exam, ExamSubject, ExamScope } = require('../exam/schemas/exam.schema');
const {
  ExamFeeRecord,
  Payment,
  ExamApplication,
} = require('../exam/schemas/fee.schema');
const { ResultUpload, SubjectResult } = require('../exam/schemas/result.schema');
const { ResultsService } = require('../exam/results.service');
const {
  PaymentGatewaySettings,
} = require('../settings/payment-gateway-settings.entity');
const { SettingsService } = require('../settings/settings.service');
const {
  FeeManagementService,
} = require('../fee-management/fee-management.service');
const { Professional } = require('../remuneration/schemas/professional.schema');
const {
  RemunerationBill,
} = require('../remuneration/schemas/remuneration-bill.schema');
const {
  ProfessionalsService,
} = require('../remuneration/professionals.service');
const {
  RemunerationService,
} = require('../remuneration/remuneration.service');

function createSdmsStub() {
  const unavailable = async () => {
    throw AppError.serviceUnavailable('Student database not connected');
  };
  return new Proxy(
    {},
    {
      get: () => unavailable,
    },
  );
}

function createServices(dataSource, studentDataSource) {
  const sdms = studentDataSource
    ? createSdmsService(studentDataSource)
    : createSdmsStub();

  const regulations = new RegulationsService(
    dataSource.getRepository(Regulation),
    dataSource.getRepository(RegulationScope),
    dataSource.getRepository(Subject),
    sdms,
  );

  const subjects = new SubjectsService(
    dataSource.getRepository(Subject),
    dataSource.getRepository(SubjectMappingEntry),
    dataSource.getRepository(Regulation),
  );

  const settings = new SettingsService(
    dataSource.getRepository(PaymentGatewaySettings),
  );

  const feeManagement = new FeeManagementService(sdms);

  const exam = new ExamService(
    dataSource.getRepository(Exam),
    dataSource.getRepository(ExamSubject),
    dataSource.getRepository(ExamFeeRecord),
    dataSource.getRepository(Payment),
    dataSource.getRepository(ExamScope),
    dataSource.getRepository(ExamApplication),
    subjects,
    regulations,
    sdms,
    settings,
    feeManagement,
  );

  const results = new ResultsService(
    dataSource.getRepository(ResultUpload),
    dataSource.getRepository(SubjectResult),
    dataSource.getRepository(Exam),
    dataSource.getRepository(ExamApplication),
    sdms,
  );

  const auth = new AuthService(sdms);

  const professionals = new ProfessionalsService(
    dataSource.getRepository(Professional),
  );

  const remuneration = new RemunerationService(
    dataSource.getRepository(RemunerationBill),
    dataSource.getRepository(Professional),
    dataSource.getRepository(Exam),
    dataSource.getRepository(Regulation),
    professionals,
  );

  return {
    auth,
    regulations,
    subjects,
    exam,
    sdms,
    settings,
    feeManagement,
    results,
    professionals,
    remuneration,
  };
}

module.exports = { createServices };
