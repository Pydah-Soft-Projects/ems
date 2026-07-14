import { DataSource } from 'typeorm';
import { AppError } from '../common/errors';
import { AuthService } from '../auth/auth.service';
import { RegulationsService } from '../regulations/regulations.service';
import { SubjectsService } from '../subjects/subjects.service';
import { ExamService } from '../exam/exam.service';
import { SdmsService, createSdmsService } from '../sdms/sdms.service';

function createSdmsStub(): SdmsService {
  const unavailable = async () => {
    throw AppError.serviceUnavailable('Student database not connected');
  };
  return new Proxy({} as SdmsService, {
    get: () => unavailable,
  });
}
import { Regulation } from '../regulations/schemas/regulation.schema';
import { RegulationScope } from '../regulations/schemas/regulation-scope.schema';
import { Subject } from '../subjects/schemas/subject.schema';
import { SubjectMappingEntry } from '../subjects/schemas/subject-mapping-entry.schema';
import {
  Exam,
  ExamSubject,
  LateFeeSlab,
  ExamScope,
} from '../exam/schemas/exam.schema';
import {
  ExamFeeRecord,
  ExamApplication,
  Payment,
} from '../exam/schemas/fee.schema';
import { PaymentGatewaySettings } from '../settings/payment-gateway-settings.entity';
import { SettingsService } from '../settings/settings.service';

export interface Services {
  auth: AuthService;
  regulations: RegulationsService;
  subjects: SubjectsService;
  exam: ExamService;
  sdms: SdmsService;
  settings: SettingsService;
}

export function createServices(
  dataSource: DataSource,
  studentDataSource?: DataSource,
): Services {
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
  );

  const auth = new AuthService(sdms);

  return { auth, regulations, subjects, exam, sdms, settings };
}
