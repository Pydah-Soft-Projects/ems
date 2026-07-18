/** One parsed row from the results Excel sheet. */
export interface ResultRowInput {
  rollNumber: string;
  subjectCode: string;
  subjectName?: string;
  grade: string;
  /** P / F (also accepts Pass / Fail / AB); inferred from grade when empty */
  result?: string;
  credits?: number | string;
}

export interface ResultRowError {
  row: number;
  message: string;
}

export interface ResultUploadResponse {
  success: boolean;
  errors?: ResultRowError[];
  validRows?: number;
  uploadId?: number;
  inserted?: number;
  updated?: number;
  students?: number;
  passCount?: number;
  failCount?: number;
}

export interface ExamResultSubject {
  subjectCode: string;
  subjectName: string;
  grade: string;
  passed: boolean;
  credits: number;
  attemptNumber: number;
}

export interface ExamResultStudent {
  rollNumber: string;
  studentName: string | null;
  examType: string | null;
  subjects: ExamResultSubject[];
  allPassed: boolean;
}

export interface ExamResultsResponse {
  exam: {
    id: number;
    name: string;
    status: string;
    yearOfStudy: number;
    semester: number;
  };
  uploads: {
    id: number;
    fileName: string | null;
    uploadedBy: string | null;
    rowCount: number;
    studentCount: number;
    createdAt: string;
  }[];
  totals: {
    students: number;
    allClear: number;
    withFailures: number;
    rows: number;
  };
  subjectStats: {
    subjectCode: string;
    subjectName: string;
    appeared: number;
    passed: number;
    failed: number;
  }[];
  students: ExamResultStudent[];
}

export interface ResultAttempt {
  attemptNumber: number;
  grade: string;
  passed: boolean;
  credits: number;
  examId: number;
  examName: string | null;
  examType: string | null;
  postedAt: string;
}

export interface StudentSubjectResult {
  subjectCode: string;
  subjectName: string;
  grade: string;
  passed: boolean;
  credits: number;
  attemptCount: number;
  attempts: ResultAttempt[];
}

export interface StudentSemesterResult {
  yearOfStudy: number;
  semester: number;
  status: 'passed' | 'backlogs';
  totalSubjects: number;
  cleared: number;
  backlogs: number;
  creditsEarned: number;
  subjects: StudentSubjectResult[];
}

export interface StudentResultsResponse {
  rollNumber: string;
  studentName: string | null;
  summary: {
    semesters: number;
    semestersPassed: number;
    totalBacklogs: number;
    totalCreditsEarned: number;
  };
  semesters: StudentSemesterResult[];
  student?: {
    id: number;
    name: string;
    pinNo: string;
    college: string;
    course: string;
    branch: string;
    batch: string;
  };
}
