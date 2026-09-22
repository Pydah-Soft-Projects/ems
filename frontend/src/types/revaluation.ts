export interface RevaluationScope {
  collegeName: string;
  courseName: string;
  batch: string;
}

export interface RevaluationMappedSubject {
  id: number;
  code: string;
  name: string;
  yearOfStudy: number;
  semester: number;
}

export interface RevaluationYearSemester {
  yearOfStudy: number;
  semester: number;
}

export interface RevaluationNotification {
  id: number;
  regulationId: number;
  regulationCode: string;
  regulationName: string;
  title: string;
  message: string;
  startDate: string;
  endDate: string;
  selectedScopes: RevaluationScope[];
  selectedYearSemesters: RevaluationYearSemester[];
  excludedBatches: string[];
  subjectIds: number[];
  subjects: RevaluationMappedSubject[];
  feesByCount: number[];
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface RevaluationStudentDetail {
  notification: RevaluationNotification;
  student: {
    id: number;
    name: string;
    pinNo: string | null;
    admissionNumber: string | null;
    batch: string | null;
    college: string | null;
    course: string | null;
    branch: string | null;
  };
  subjects: Array<{ id: number; code: string; name: string; semester: number | null }>;
}
