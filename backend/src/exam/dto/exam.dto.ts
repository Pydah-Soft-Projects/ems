import { ExamType, PaymentMethod } from '../schemas/exam.enums';

export interface ExamSubjectFeeDto {
  subjectId: number;
  fee: number;
}

export interface LateFeeSlabDto {
  fromDay: number;
  toDay: number;
  amount: number;
}

export interface CreateExamDto {
  name: string;
  type?: ExamType;
  regulationId: number;
  course: string;
  branch: string;
  batch: string;
  semester: number;
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
  students?: StudentRefDto[];
}

export interface OnlinePaymentDto {
  paymentMethod: PaymentMethod;
  transactionReference?: string;
}

export interface OfflinePaymentDto {
  studentRollNumber: string;
  examId: number;
  paymentMethod: PaymentMethod;
  bankName?: string;
  transactionNumber?: string;
  collectedBy: string;
}
