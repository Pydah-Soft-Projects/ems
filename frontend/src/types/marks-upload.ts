export type CourseCategoryType = 'THEORY' | 'LAB';
export type MarksTabType = 'INTERNAL' | 'EXTERNAL' | 'RESULT' | 'REVALUATION';

export interface MarksNotificationItem {
  id: number;
  notificationType: 'EXAM' | 'REVALUATION';
  examCategory?: 'EXTERNAL' | 'INTERNAL';
  title: string;
  type: string;
  course?: string;
  branch?: string;
  batch?: string;
  yearOfStudy?: number;
  semester?: number;
  regulationCode?: string;
  academicYear?: string;
  status: string;
  subjectCount: number;
  createdAt: string;
}

export interface MarksNotificationResponse {
  exams: MarksNotificationItem[];
  revaluations: MarksNotificationItem[];
}

export interface NotificationSubjectItem {
  id?: number;
  code: string;
  name: string;
  type?: string;
  internalMarks?: number;
  externalMarks?: number;
  totalMarks?: number;
}

export interface NotificationStudentItem {
  rollNumber: string;
  name: string;
  examType?: string;
  branch?: string;
  section?: string;
  feeStatus?: string;
}

export interface NotificationDetailsResponse {
  notification: MarksNotificationItem;
  branches: string[];
  subjects: NotificationSubjectItem[];
  students: NotificationStudentItem[];
}

export interface ParsedMarkRow {
  rollNumber?: string;
  studentName?: string;
  subjectCode?: string;
  subjectName?: string;
  internalMarks?: string | number;
  maxInternalMarks?: string | number;
  externalMarks?: string | number;
  maxExternalMarks?: string | number;
  totalMarks?: string | number;
  maxTotalMarks?: string | number;
  grade?: string;
  gradePoints?: string | number;
  credits?: string | number;
  result?: string;
  passed?: boolean;
  isAbsent?: boolean;
  originalGrade?: string;
  updatedGrade?: string;
  originalMarks?: string | number;
  updatedMarks?: string | number;
  status?: string;
  remarks?: string;
  [key: string]: any;
}

export interface ParseDocumentResponse {
  success: boolean;
  headers?: string[];
  rows: ParsedMarkRow[];
  rowCount: number;
  textSample?: string;
}

export interface UploadMarksResult {
  success: boolean;
  category?: string;
  notificationId?: number;
  inserted?: number;
  updated?: number;
  totalRows?: number;
  validRows?: number;
  passCount?: number;
  failCount?: number;
  errors?: Array<{ row: number; message: string }>;
}

export interface StudentMarkRecord {
  id: number;
  category: MarksTabType;
  examId?: number;
  revaluationId?: number;
  studentRollNumber: string;
  studentName?: string;
  subjectCode: string;
  subjectName?: string;
  internalMarks?: number;
  maxInternalMarks?: number;
  externalMarks?: number;
  maxExternalMarks?: number;
  totalMarks?: number;
  maxTotalMarks?: number;
  grade?: string;
  gradePoints?: number;
  credits?: number;
  passed?: boolean;
  isAbsent?: boolean;
  originalGrade?: string;
  updatedGrade?: string;
  originalMarks?: number;
  updatedMarks?: number;
  status?: string;
  remarks?: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface MarksHistoryResponse {
  category: string;
  notificationId: number;
  totalRecords: number;
  studentCount: number;
  stats: {
    passCount: number;
    failCount: number;
    absentCount: number;
  };
  records: StudentMarkRecord[];
}

export interface ConsolidatedSubjectMark {
  subjectCode: string;
  subjectName: string;
  examId?: number | null;
  examTitle?: string | null;
  examType?: string | null;
  regulationCode?: string | null;
  semester?: string | number | null;
  internalMarks?: number | null;
  maxInternalMarks?: number;
  externalMarks?: number | null;
  maxExternalMarks?: number;
  totalMarks?: number | null;
  maxTotalMarks?: number;
  grade?: string | null;
  gradePoints?: number | null;
  credits?: number;
  passed?: boolean | null;
  isAbsent?: boolean;
  revaluation?: {
    originalGrade?: string;
    updatedGrade?: string;
    originalMarks?: number | null;
    updatedMarks?: number | null;
    status?: string;
  } | null;
}

export interface ExamGroupResult {
  examId?: number | null;
  revaluationId?: number | null;
  notificationTitle: string;
  examType: string;
  regulationCode: string;
  semester?: string | number | null;
  academicYear?: string | null;
  subjectCount: number;
  passedCount: number;
  backlogs: number;
  totalCredits: number;
  sgpa: number;
  status: 'PASSED' | 'BACKLOGS';
  subjects: ConsolidatedSubjectMark[];
}

export interface ConsolidatedStudentItem {
  rollNumber: string;
  studentName: string;
  examId?: number | null;
  revaluationId?: number | null;
  subjectCount: number;
  passedCount: number;
  backlogs: number;
  totalCredits: number;
  sgpa: number;
  status: 'PASSED' | 'BACKLOGS';
  examGroups?: ExamGroupResult[];
  subjects: ConsolidatedSubjectMark[];
}

export interface ConsolidatedResultsResponse {
  totalStudents: number;
  allClearCount: number;
  backlogCount: number;
  students: ConsolidatedStudentItem[];
}
