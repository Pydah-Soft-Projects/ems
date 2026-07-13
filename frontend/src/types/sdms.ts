export interface SdmsCollege {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
}

export interface SdmsCourse {
  id: number;
  collegeId: number | null;
  name: string;
  code: string | null;
  level: string | null;
  totalYears: number;
  semestersPerYear: number;
  yearSemesterConfig?: { year: number; semesters: number }[] | null;
  isActive: boolean;
  college?: Pick<SdmsCollege, 'id' | 'name' | 'code'>;
}

export interface SdmsBranch {
  id: number;
  courseId: number;
  name: string;
  code: string | null;
  totalYears?: number | null;
  semestersPerYear?: number | null;
  yearSemesterConfig?: { year: number; semesters: number }[] | null;
  isActive: boolean;
  metadata?: Record<string, unknown> | null;
  course?: SdmsCourse;
}

export interface SdmsAcademicYear {
  id: number;
  yearLabel: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export interface SdmsSection {
  name: string;
  strength?: number;
  source: 'metadata' | 'assigned';
}

export interface SdmsBranchYearSemesters {
  branch: Pick<SdmsBranch, 'id' | 'name' | 'code' | 'courseId'>;
  course: Pick<SdmsCourse, 'id' | 'name' | 'code'>;
  years: {
    yearOfStudy: number;
    semesters: { semesterNumber: number; label: string }[];
  }[];
}

export interface SdmsSemester {
  id: number;
  collegeId: number | null;
  courseId: number;
  academicYearId: number;
  yearOfStudy: number;
  batch: string | null;
  semesterNumber: number;
  startDate: string | null;
  endDate: string | null;
}

export interface SdmsStudent {
  id: number;
  studentName: string;
  admissionNumber: string | null;
  pinNo: string | null;
  college: string | null;
  course: string | null;
  branch: string | null;
  batch: string | null;
  section: string | null;
  currentYear: number;
  currentSemester: number;
  studentStatus: string | null;
}

export interface SdmsStudentSection {
  id: number;
  studentId: number;
  branchId: number;
  batch: string;
  sectionName: string;
  isManual: boolean;
  student: Pick<
    SdmsStudent,
    | 'id'
    | 'studentName'
    | 'admissionNumber'
    | 'pinNo'
    | 'college'
    | 'course'
    | 'branch'
  > | null;
  branch: Pick<SdmsBranch, 'id' | 'name' | 'code'> | null;
}

export interface SdmsStudentListResponse {
  items: SdmsStudent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SdmsStudentFilters {
  college?: string;
  course?: string;
  branch?: string;
  batch?: string;
  currentYear?: number;
  currentSemester?: number;
  section?: string;
  admissionNumber?: string;
  pinNo?: string;
  search?: string;
  page?: number;
  limit?: number;
}
