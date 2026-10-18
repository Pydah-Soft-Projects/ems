export type LockStatusType = 'Locked' | 'Unlocked';
export type CompletionStatusType = 'COMPLETED' | 'PARTIALLY_SUBMITTED' | 'PENDING' | 'NO_ELIGIBLE_STUDENTS';
export type MarksEntryStatusType = 'Entered' | 'Not Entered' | 'Absent';

export interface InternalMarksNotification {
  id: number;
  name: string;
  type: string;
  course: string;
  branch: string;
  batch: string;
  academicYear: string;
  yearOfStudy: number;
  semester: number;
  regulationId: number;
  regulationCode: string | null;
  regulationName: string | null;
  examinationStartDate: string | null;
  examinationEndDate: string | null;
  status: string;
}

export interface StudentSubmissionItem {
  rollNumber: string;
  name: string;
  branch: string;
  section: string | null;
  marks?: number | null;
  isAbsent?: boolean;
  updatedAt?: string | null;
}

export interface InternalSubjectSummary {
  sNo: number;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  type: string;
  maxMarks: number;
  totalEligibleStudents: number;
  marksEntered: number;
  marksNotEntered: number;
  submissionPercentage: number;
  completionStatus: CompletionStatusType;
  isLocked: boolean;
  lockStatus: LockStatusType;
  isManuallyUnlocked: boolean;
  lockReason: string;
  examDate: string | null;
  examDateFormatted?: string;
  marksEntryDeadline: string;
  deadlineDate: string | null;
  isUpcoming?: boolean;
  isExpired: boolean;
  branch?: string;
  facultyName?: string | null;
  facultyEmail?: string | null;
  unlockedBy?: string | null;
  unlockedAt?: string | null;
  enteredStudents: StudentSubmissionItem[];
  missingStudents: StudentSubmissionItem[];
}

export interface InternalStudentMarkRow {
  sNo: number;
  studentRollNumber: string;
  studentName: string;
  academicYear: string;
  college?: string | null;
  course?: string | null;
  yearOfStudy: number;
  semester: number;
  branch: string;
  section: string;
  examNotificationName: string;
  examType: string;
  examDate: string | null;
  subjectCode: string;
  subjectName: string;
  maxMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
  isEntered: boolean;
  marksEntryStatus: MarksEntryStatusType;
  isLocked: boolean;
  lockStatus: LockStatusType;
  lockReason: string;
  deadline: string;
  deadlineDate: string | null;
  isExpired: boolean;
  isManuallyUnlocked: boolean;
  marksEntryDate: string | null;
  uploadedBy: string | null;
}

export interface InternalMarksSummary {
  notificationName: string;
  examinationDate: string;
  totalStudents: number;
  totalSubjects: number;
  totalExpectedEntries: number;
  entriesSubmitted: number;
  entriesNotEntered: number;
  submissionPercentage: number;
  lockedEntries: number;
  unlockedEntries: number;
  completedSubjects: number;
  partiallySubmittedSubjects: number;
  pendingSubjects: number;
  lockedSubjects: number;
  unlockedSubjects: number;
}

export interface InternalMarksOverviewResponse {
  notification: InternalMarksNotification;
  branches: string[];
  sections: string[];
  subjects: InternalSubjectSummary[];
  studentEntries: InternalStudentMarkRow[];
  summary: InternalMarksSummary;
}

export interface UnlockMarksInput {
  subjectCode?: string;
  reason: string;
  facultyName?: string;
  facultyEmail?: string;
}

export interface RelockMarksInput {
  subjectCode?: string;
  reason?: string;
}

export interface LockActionResponse {
  success: boolean;
  message: string;
  lock?: any;
}
