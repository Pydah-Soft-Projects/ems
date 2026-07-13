export type RegulationStatus = 'active' | 'inactive';

export interface RegulationScope {
  id: number;
  regulationId: number;
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  batch: string;
  createdAt: string;
}

export interface RegulationScopeInput {
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  batches: string[];
}

export interface ClaimedRegulationBatch {
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  batch: string;
  regulationId: number;
  regulationCode: string;
  regulationName: string;
}

export interface Regulation {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  effectiveDate?: string | null;
  status: RegulationStatus;
  scopes?: RegulationScope[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRegulationInput {
  code: string;
  name: string;
  description?: string;
  effectiveDate?: string;
  status?: RegulationStatus;
  scopes?: RegulationScopeInput[];
}

export type UpdateRegulationInput = Partial<CreateRegulationInput>;

export interface RegulationScopeBatch {
  batch: string;
  scopeId: number;
  studentCount?: number;
}

export interface RegulationScopeCourse {
  courseId: number;
  courseName: string;
  batches: RegulationScopeBatch[];
}

export interface RegulationScopeCollege {
  collegeId: number;
  collegeName: string;
  courses: RegulationScopeCourse[];
}

export interface RegulationDetail extends Regulation {
  colleges: RegulationScopeCollege[];
  summary: {
    collegeCount: number;
    courseCount: number;
    batchCount: number;
    totalStudents: number;
  };
}

export interface RegulationBatchInsight {
  college: { id: number; name: string; code: string | null };
  course: { id: number; name: string; code: string | null };
  batch: string;
  totalStudents: number;
  yearSemesterBreakdown: {
    yearOfStudy: number;
    semesterNumber: number;
    studentCount: number;
  }[];
  yearSemesterStatusBreakdown: {
    yearOfStudy: number;
    semesterNumber: number;
    totalStudents: number;
    byStatus: { status: string; studentCount: number }[];
  }[];
  statusTotals: { status: string; studentCount: number }[];
  sectionBreakdown: { section: string; studentCount: number }[];
  branchBreakdown: { branch: string; studentCount: number }[];
  calendarSemesters: {
    id: number;
    yearOfStudy: number;
    semesterNumber: number;
    academicYearLabel: string | null;
    startDate: string | null;
    endDate: string | null;
  }[];
}
