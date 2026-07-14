import { ExamType, PaymentMethod } from '../schemas/exam.enums';

export interface ExamSubjectFeeDto {
  subjectId: number;
  fee: number;
  /** Required — date of this paper */
  examDate: string;
}

export interface LateFeeSlabDto {
  fromDay: number;
  toDay: number;
  amount: number;
}

/** One branch audience; empty/omitted sections = all sections */
export interface ExamScopeInputDto {
  branch: string;
  branchId?: number;
  /** Specific sections; omit or empty = all sections */
  sections?: string[];
}

export interface CreateExamDto {
  name: string;
  /** Single type (legacy). Prefer `types` for Regular + Supply together. */
  type?: ExamType;
  /** Allowed enrollment types on THIS exam (student picks at apply time) */
  types?: ExamType[];
  regulationId: number;
  college: string;
  course: string;
  /** Legacy single branch — used when `scopes` omitted */
  branch?: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  /** Multi-branch (+ section) audiences */
  scopes?: ExamScopeInputDto[];
  subjects: ExamSubjectFeeDto[];
  packageFee?: number;
  examinationStartDate?: string;
  examinationEndDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  lateFeeStartDate?: string;
  lateFeeSlabs?: LateFeeSlabDto[];
  instructions?: string;
  submitForApproval?: boolean;
}

export type UpdateExamDto = Partial<CreateExamDto>;

export interface RejectExamDto {
  remarks: string;
}

export interface StudentRefDto {
  rollNumber: string;
  name: string;
  selectedSubjectIds?: number[];
}

export interface PublishExamDto {
  /** @deprecated Fees are created on student enrollment, not publish */
  students?: StudentRefDto[];
}

export interface CreateExamApplicationDto {
  /** Regular / supply / … — required when exam allows more than one */
  examType?: ExamType;
  selectedSubjectIds?: number[];
  declarationAccepted: boolean;
  consentAccepted: boolean;
}

export interface OnlinePaymentDto {
  paymentMethod: PaymentMethod;
  transactionReference?: string;
}

export interface OfflinePaymentDto {
  feeRecordId?: number;
  studentRollNumber?: string;
  examId?: number;
  paymentMethod: PaymentMethod;
  bankName?: string;
  transactionNumber?: string;
  collectedBy: string;
  collectorUsername?: string;
  remarks?: string;
}
