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

export type ExamSession = 'FN' | 'AN';

export interface ExamSubject {
  id: number;
  examId: number;
  subjectId: number;
  /** Branch this paper belongs to; null = common to all scoped branches */
  branch?: string | null;
  /** Section within the branch; null = all sections of the branch */
  section?: string | null;
  fee: number | string;
  examDate?: string | null;
  session?: ExamSession | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  subject?: {
    id: number;
    code: string;
    name: string;
  };
}

export interface PackageFeeEntry {
  branch: string;
  /** null/undefined = applies to the whole branch */
  section?: string | null;
  amount: number;
}

export interface LateFeeSlab {
  id?: number;
  fromDate: string;
  /** null on the last slab = until application end date */
  toDate: string | null;
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
  /** Branch/section-wise package fees; section null = whole branch */
  packageFees?: PackageFeeEntry[] | null;
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
  branch?: string;
  section?: string;
  fee: number;
  examDate: string;
  session?: ExamSession;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
}

export interface LateFeeSlabInput {
  fromDate: string;
  /** Omit or null on the last slab only — applies until application end */
  toDate?: string | null;
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
  packageFees?: PackageFeeEntry[];
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

export interface DueClearanceTerm {
  termNumber: number;
  academicYear?: string;
  studentYear?: number | null;
  semester?: number | null;
  demand?: number;
  declarationConcession?: number;
  paid?: number;
  applicationConcession?: number;
  balance?: number;
  due: number;
  dueDate?: string | null;
  overdue?: boolean;
}

export interface DueClearanceHead {
  feeHeadId: string;
  feeHeadCode: string | null;
  feeHeadName: string;
  due: number;
  terms: DueClearanceTerm[];
}

export interface DueClearance {
  blocked: boolean;
  canApply: boolean;
  asOfDate: string;
  totalDue: number;
  currency: string;
  byHead: DueClearanceHead[];
  byTerm: { termNumber: number; due: number }[];
  message: string;
  verification?: { matched: boolean; notes: string[] };
  skipped?: boolean;
  reason?: string;
  overridden?: boolean;
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
  dueClearance?: DueClearance;
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
  dueSummary?: {
    asOfDate: string;
    eligible: number;
    clearCount: number;
    blockedCount: number;
    skippedCount: number;
    totalOverdueAmount: number;
  };
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
  canApply?: boolean;
  dueClearance?: DueClearance;
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
      session?: ExamSession | null;
      startTime?: string | null;
      endTime?: string | null;
      durationMinutes?: number | null;
      code: string;
      name: string;
      supplyStatus: {
        eligible: boolean;
        grade: string | null;
        gradePoints: number | null;
        passed: boolean | null;
        attemptNumber: number | null;
      } | null;
    }[];
  };
  openTypes: ExamType[];
  alreadyApplied: boolean;
  canApply?: boolean;
  dueClearance?: DueClearance;
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
  /** Staff only — requires fees:due_override or Super Admin */
  overrideDues?: boolean;
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
  session?: ExamSession | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
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
