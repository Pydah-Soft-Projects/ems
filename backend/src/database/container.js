'use strict';

const { AppError } = require('../common/errors');
const { AuthService } = require('../auth/auth.service');
const { UsersService } = require('../auth/users.service');
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
const {
  MerchantStatement,
  MerchantStatementTxn,
} = require('../exam/schemas/merchant-statement.schema');
const { ResultUpload, SubjectResult } = require('../exam/schemas/result.schema');
const { ResultsService } = require('../exam/results.service');
const { SelfOnlineService } = require('../exam/self-online.service');
const { CanaraQrService } = require('../exam/canara/canara-qr.service');
const {
  PaymentGatewaySettings,
} = require('../settings/payment-gateway-settings.entity');
const {
  CanaraPaymentSettings,
} = require('../settings/canara-payment-settings.entity');
const {
  CanaraOauthAudit,
} = require('../settings/canara-oauth-audit.entity');
const { SettingsService } = require('../settings/settings.service');
const {
  CanaraSettingsService,
} = require('../settings/canara-settings.service');
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
const {
  EmsRole,
  EmsUser,
  EmsAuditLog,
} = require('../auth/schemas/ems-rbac.schema');

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

  const users = new UsersService(
    dataSource.getRepository(EmsRole),
    dataSource.getRepository(EmsUser),
    dataSource.getRepository(EmsAuditLog),
  );

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

  const canaraSettings = new CanaraSettingsService(
    dataSource.getRepository(CanaraPaymentSettings),
    dataSource.getRepository(CanaraOauthAudit),
  );
  settings.setCanaraSettings(canaraSettings);

  const feeManagement = new FeeManagementService(sdms);

  const exam = new ExamService(
    dataSource.getRepository(Exam),
    dataSource.getRepository(ExamSubject),
    dataSource.getRepository(ExamFeeRecord),
    dataSource.getRepository(Payment),
    dataSource.getRepository(ExamScope),
    dataSource.getRepository(ExamApplication),
    dataSource.getRepository(SubjectResult),
    subjects,
    regulations,
    sdms,
    settings,
    feeManagement,
  );

  const selfOnline = new SelfOnlineService(
    dataSource.getRepository(Payment),
    dataSource.getRepository(ExamFeeRecord),
    dataSource.getRepository(MerchantStatement),
    dataSource.getRepository(MerchantStatementTxn),
    settings,
    exam,
  );

  const canaraQr = new CanaraQrService(
    dataSource.getRepository(Payment),
    dataSource.getRepository(ExamFeeRecord),
    canaraSettings,
    exam,
  );

  const results = new ResultsService(
    dataSource.getRepository(ResultUpload),
    dataSource.getRepository(SubjectResult),
    dataSource.getRepository(Exam),
    dataSource.getRepository(ExamApplication),
    sdms,
  );

  const auth = new AuthService(sdms, users);

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

  // Ensure system Super Admin role exists on startup
  users.ensureSystemRole().catch(() => undefined);

  return {
    auth,
    users,
    regulations,
    subjects,
    exam,
    selfOnline,
    canaraQr,
    canaraSettings,
    sdms,
    settings,
    feeManagement,
    results,
    professionals,
    remuneration,
  };
}

module.exports = { createServices };
