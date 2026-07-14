export type ExamType =
  | 'regular'
  | 'supply'
  | 'improvement'
  | 'special_supply';

export type ExamStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'published';

export interface ExamSubject {
  id: number;
  examId: number;
  subjectId: number;
  fee: number | string;
  examDate?: string | null;
  subject?: {
    id: number;
    code: string;
    name: string;
  };
}

export interface LateFeeSlab {
  id?: number;
  fromDay: number;
  toDay: number;
  amount: number | string;
}

export interface ExamScope {
  id?: number;
  examId?: number;
  college?: string | null;
  course: string;
  branch: string;
  branchId?: number | null;
  batch: string;
  yearOfStudy: number;
  semester: number;
  section: string | null;
}

export interface Exam {
  id: number;
  name: string;
  type: ExamType;
  /** Types students may choose when enrolling (Regular and/or Supply). */
  allowedTypes?: ExamType[] | null;
  regulationId: number;
  college: string | null;
  course: string;
  branch: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  status: ExamStatus;
  examinationStartDate: string | null;
  examinationEndDate: string | null;
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  lateFeeStartDate: string | null;
  packageFee: number | string | null;
  instructions: string | null;
  rejectionRemarks: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  hallTicketsReleasedAt?: string | null;
  examSubjects: ExamSubject[];
  lateFeeSlabs: LateFeeSlab[];
  scopes?: ExamScope[];
  createdAt: string;
  updatedAt: string;
}

export interface ExamSubjectFeeInput {
  subjectId: number;
  fee: number;
  examDate: string;
}

export interface LateFeeSlabInput {
  fromDay: number;
  toDay: number;
  amount: number;
}

export interface ExamScopeInput {
  branch: string;
  branchId?: number;
  sections?: string[];
}

export interface CreateExamInput {
  name: string;
  type?: ExamType;
  /** Allowed enrollment types on this single exam (e.g. regular + supply) */
  types?: ExamType[];
  regulationId: number;
  college: string;
  course: string;
  /** Legacy single branch — prefer `scopes` */
  branch?: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  scopes?: ExamScopeInput[];
  subjects: ExamSubjectFeeInput[];
  packageFee?: number;
  examinationStartDate?: string;
  examinationEndDate?: string;
  applicationStartDate?: string;
  applicationEndDate?: string;
  lateFeeStartDate?: string;
  lateFeeSlabs?: LateFeeSlabInput[];
  instructions?: string;
  submitForApproval?: boolean;
}

export type UpdateExamInput = Partial<CreateExamInput>;

export interface PublishExamInput {
  students?: { rollNumber: string; name: string; selectedSubjectIds?: number[] }[];
}

export interface EligibleExamStudent {
  id: number;
  rollNumber: string;
  name: string;
  admissionNumber: string | null;
  section: string | null;
  studentStatus: string | null;
  college: string | null;
  course: string | null;
  branch: string | null;
  batch: string | null;
  currentYear: number;
  currentSemester: number;
}

export interface EligibleStudentsResponse {
  exam: {
    id: number;
    name: string;
    college: string;
    course: string;
    branch: string;
    batch: string;
    yearOfStudy: number;
    semester: number;
    scopes?: {
      branch: string;
      section: string | null;
      yearOfStudy: number;
      semester: number;
    }[];
  };
  students: EligibleExamStudent[];
  total: number;
}

export interface StudentExamListItem {
  id: number;
  name: string;
  type: ExamType;
  allowedTypes: ExamType[];
  college: string | null;
  course: string;
  branch: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  applicationStartDate: string | null;
  applicationEndDate: string | null;
  examinationStartDate: string | null;
  examinationEndDate: string | null;
  packageFee: number | string | null;
  subjectCount: number;
  alreadyApplied: boolean;
  openTypes: ExamType[];
  applications: {
    id: number;
    examType: ExamType;
    feeRecordId: number;
    feeStatus: 'pending' | 'paid' | null;
  }[];
}

export interface StudentExamDetail {
  exam: {
    id: number;
    name: string;
    type: ExamType;
    allowedTypes: ExamType[];
    college: string | null;
    course: string;
    branch: string;
    batch: string;
    yearOfStudy: number;
    semester: number;
    packageFee: number | string | null;
    applicationStartDate: string | null;
    applicationEndDate: string | null;
    examinationStartDate: string | null;
    examinationEndDate: string | null;
    instructions: string | null;
    subjects: {
      subjectId: number;
      fee: number;
      examDate?: string | null;
      code: string;
      name: string;
    }[];
  };
  openTypes: ExamType[];
  alreadyApplied: boolean;
  applications: {
    id: number;
    examType: ExamType;
    selectedSubjectIds: number[];
    feeRecordId: number;
    feeStatus: 'pending' | 'paid' | null;
    submittedAt: string;
  }[];
  application: {
    id: number;
    examType?: ExamType;
    selectedSubjectIds: number[];
    feeRecordId: number;
    feeStatus: 'pending' | 'paid' | null;
    submittedAt: string;
  } | null;
}

export interface CreateExamApplicationInput {
  examType?: ExamType;
  selectedSubjectIds?: number[];
  declarationAccepted: boolean;
  consentAccepted: boolean;
}

export interface ExamAnalytics {
  examId: number;
  examName: string;
  type: ExamType;
  eligibleCount: number;
  enrolledCount: number;
  paidCount: number;
  pendingPaymentCount: number;
  notEnrolledCount: number;
  estimatedPerStudent: number;
  estimatedRevenue: number;
  collectedRevenue: number;
  byScope: {
    course: string;
    branch: string;
    semester: number;
    yearOfStudy: number;
    eligible: number;
    enrolled: number;
    paid: number;
    pendingPayment: number;
    notEnrolled: number;
    estimatedRevenue: number;
    collectedRevenue: number;
  }[];
}

export interface HallTicketPaper {
  subjectId: number;
  code: string;
  name: string;
  examDate: string | null;
  fee: number;
}

export interface HallTicket {
  applicationId: number;
  examId: number;
  examName: string;
  examType: ExamType;
  college: string | null;
  course: string;
  branch: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  studentRollNumber: string;
  studentName: string;
  feeRecordId: number;
  feeStatus: string;
  paidAt: string | null;
  hallTicketsReleasedAt: string;
  papers: HallTicketPaper[];
}
