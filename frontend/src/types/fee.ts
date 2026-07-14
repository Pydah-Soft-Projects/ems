import { Exam, ExamType } from './exam';

export type FeeStatus = 'pending' | 'paid';

export type PaymentMode = 'online' | 'offline';

export type PaymentMethod =
  | 'upi'
  | 'debit_card'
  | 'credit_card'
  | 'net_banking'
  | 'cash'
  | 'bank_transfer';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'voided';

export interface FeeBreakdownItem {
  subjectId: number;
  subjectCode: string;
  fee: number | string;
}

export interface Payment {
  id: number;
  feeRecordId: number;
  amountPaid: number | string;
  paymentMode: PaymentMode | string;
  paymentMethod: PaymentMethod | string;
  status: string;
  receiptNumber: string;
  transactionReference: string | null;
  collectedBy: string | null;
  collectorUsername: string | null;
  remarks: string | null;
  gatewayResponse: string | null;
  paidAt: string;
  verificationToken?: string;
  feeRecord?: ExamFeeRecord;
}

export interface ExamFeeRecord {
  id: number;
  examId: number;
  examType?: ExamType | string;
  studentRollNumber: string;
  studentName: string;
  selectedSubjectIds: number[];
  feeBreakdown: FeeBreakdownItem[];
  baseFee: number | string;
  lateFee: number | string;
  totalAmount: number | string;
  status: FeeStatus;
  dueDate: string | null;
  createdAt: string;
  exam?: Exam;
  payments?: Payment[];
}

export interface FeeCollectionLookup {
  rollNumber: string;
  studentName: string | null;
  records: ExamFeeRecord[];
  pendingCount: number;
  paidCount: number;
}

export interface OfflinePaymentInput {
  feeRecordId?: number;
  studentRollNumber?: string;
  examId?: number;
  paymentMethod: PaymentMethod;
  bankName?: string;
  transactionNumber?: string;
  collectedBy: string;
  remarks?: string;
}

export interface PaymentResult {
  payment: Payment;
  feeRecord: ExamFeeRecord;
}
