export type RemunerationBillType =
  | 'qp_setting'
  | 'lab_project'
  | 'evaluation'
  | 'observer'
  | 'examiner'
  | 'others';

export type RemunerationBillStatus =
  | 'draft'
  | 'submitted'
  | 'passed'
  | 'paid';

export interface Professional {
  id: number;
  name: string;
  designation: string | null;
  organization: string | null;
  contactNumber: string | null;
  email: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  bankAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateProfessionalInput = {
  name: string;
  designation?: string | null;
  organization?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankAddress?: string | null;
};

export type UpdateProfessionalInput = Partial<CreateProfessionalInput>;

export interface RemunerationSubjectRef {
  subjectId?: number | null;
  examSubjectId?: number | null;
  code?: string | null;
  name: string;
}

export interface RemunerationLineItem {
  remunerationFor: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface RemunerationStatusEvent {
  action: 'created' | 'updated' | 'status_changed' | string;
  status: RemunerationBillStatus;
  fromStatus?: RemunerationBillStatus | null;
  by: string;
  byUsername?: string | null;
  at: string;
  note?: string | null;
}

export interface RemunerationBill {
  id: number;
  billNumber: string;
  billType: RemunerationBillType;
  status: RemunerationBillStatus;
  examId: number | null;
  professionalId: number | null;
  professionalName: string;
  designation: string | null;
  organization: string | null;
  contactNumber: string | null;
  email: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  bankAddress: string | null;
  regulationId: number | null;
  regulationCode: string | null;
  academicYear: string | null;
  course: string | null;
  branch: string | null;
  batch: string | null;
  yearOfStudy: number | null;
  semester: number | null;
  examName: string | null;
  subjects: RemunerationSubjectRef[] | null;
  durationFrom: string | null;
  durationTo: string | null;
  numberOfDays: number | null;
  lineItems: RemunerationLineItem[] | null;
  grandTotalQuantity: number | string;
  grandTotalAmount: number | string;
  amountInWords: string | null;
  billDate: string | null;
  officeNotes: string | null;
  statusHistory?: RemunerationStatusEvent[] | null;
  createdAt: string;
  updatedAt: string;
  professional?: Professional | null;
  exam?: {
    id: number;
    name: string;
    status: string;
    college?: string | null;
  } | null;
}

export type CreateRemunerationBillInput = {
  billType: RemunerationBillType;
  status?: RemunerationBillStatus;
  examId?: number | null;
  professionalId?: number | null;
  professionalName: string;
  designation?: string | null;
  organization?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankAddress?: string | null;
  regulationId?: number | null;
  regulationCode?: string | null;
  academicYear?: string | null;
  course?: string | null;
  branch?: string | null;
  batch?: string | null;
  yearOfStudy?: number | null;
  semester?: number | null;
  examName?: string | null;
  subjects?: RemunerationSubjectRef[];
  durationFrom?: string | null;
  durationTo?: string | null;
  numberOfDays?: number | null;
  lineItems: RemunerationLineItem[];
  billDate?: string | null;
  officeNotes?: string | null;
  saveToDirectory?: boolean;
};

export type UpdateRemunerationBillInput = Partial<CreateRemunerationBillInput>;

export interface RemunerationMeta {
  billTypes: { value: RemunerationBillType; label: string }[];
  statuses: RemunerationBillStatus[];
  defaultLineSuggestions: Record<RemunerationBillType, string[]>;
}

export interface ExamBillSubject {
  examSubjectId: number;
  subjectId: number;
  code: string | null;
  name: string;
  branch: string | null;
  section: string | null;
  type: string | null;
  examDate: string | null;
}

export interface ExamBillBranch {
  branch: string;
  branchId: number | null;
  course: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
}

export interface RemunerationSimulateResult {
  exam: {
    id: number;
    name: string;
    status: string;
    course: string;
    branch: string;
    yearOfStudy: number;
    semester: number;
  };
  professionals: Professional[];
  bills: RemunerationBill[];
}

export const BILL_TYPE_LABELS: Record<RemunerationBillType, string> = {
  qp_setting: 'QP Setting',
  lab_project: 'Lab / Project Externals',
  evaluation: 'Evaluation',
  observer: 'Observer',
  examiner: 'Examiner',
  others: 'Others',
};

export const BILL_STATUS_LABELS: Record<RemunerationBillStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  passed: 'Passed for payment',
  paid: 'Paid',
};

/** Forward workflow steps shown as action buttons on the bill view. */
export const BILL_STATUS_ACTIONS: {
  from: RemunerationBillStatus;
  to: RemunerationBillStatus;
  label: string;
}[] = [
  { from: 'draft', to: 'submitted', label: 'Submit bill' },
  { from: 'submitted', to: 'passed', label: 'Pass for payment' },
  { from: 'passed', to: 'paid', label: 'Mark as paid' },
];

export const BILL_STATUS_FLOW: RemunerationBillStatus[] = [
  'draft',
  'submitted',
  'passed',
  'paid',
];
