export type SubjectTypeCode = string;
/** @deprecated Prefer SubjectTypeCode — kept for older call sites */
export type SubjectType = SubjectTypeCode;
export type SubjectStatus = 'active' | 'inactive';

export interface SubjectTypeOption {
  id: number;
  code: string;
  name: string;
  status: SubjectStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubjectTypeInput {
  name: string;
  code?: string;
  status?: SubjectStatus;
  sortOrder?: number;
}

export type UpdateSubjectTypeInput = Partial<CreateSubjectTypeInput>;

export interface SubjectTypeUsageSubject {
  id: number;
  code: string;
  name: string;
  type: SubjectTypeCode;
  status: SubjectStatus;
  regulationId: number;
  regulationCode: string | null;
  regulationName: string | null;
}

export interface SubjectTypeUsage {
  type: SubjectTypeOption;
  total: number;
  subjects: SubjectTypeUsageSubject[];
}

export interface ReassignSubjectTypeInput {
  toTypeCode: string;
  /** Omit to reassign every subject currently using this type */
  subjectIds?: number[];
}

export interface ReassignSubjectTypeResult {
  fromType: SubjectTypeOption;
  toType: SubjectTypeOption;
  updated: number;
  remaining: number;
}

export interface Subject {
  id: number;
  regulationId: number;
  collegeId: number | null;
  collegeName: string | null;
  courseId: number | null;
  courseName: string | null;
  branchId: number | null;
  branchName: string | null;
  code: string;
  name: string;
  semester: number | null;
  type: SubjectTypeCode;
  credits: number | string;
  internalMarks: number;
  externalMarks: number;
  totalMarks: number;
  status: SubjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubjectInput {
  regulationId: number;
  code: string;
  name: string;
  type?: SubjectTypeCode;
  credits?: number;
  internalMarks?: number;
  externalMarks?: number;
  totalMarks?: number;
  status?: SubjectStatus;
}

export type UpdateSubjectInput = Partial<CreateSubjectInput>;

export interface SubjectMappingAssignment {
  subjectId: number;
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  branchId: number;
  branchName: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  sectionMode?: 'all' | 'selected';
  sections?: string[];
}

export interface SubjectMappingEntry {
  id: number;
  regulationId: number;
  subjectId: number;
  subject: Subject;
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  branchId: number;
  branchName: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  sectionMode: 'all' | 'selected';
  sections: string[] | null;
  sectionKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubjectMappingInput {
  regulationId: number;
  assignments: SubjectMappingAssignment[];
}

export interface ReplaceScopeMappingInput {
  regulationId: number;
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  branchId: number;
  branchName: string;
  batch: string;
  yearOfStudy: number;
  semester: number;
  sectionMode?: 'all' | 'selected';
  sections?: string[];
  subjectIds: number[];
  previous?: {
    collegeId: number;
    courseId: number;
    branchId: number;
    batch: string;
    yearOfStudy: number;
    semester: number;
    sectionKey: string;
  };
}

export type UpdateSubjectMappingInput = Partial<SubjectMappingAssignment>;

export interface SubjectMappingFilters {
  regulationId?: number;
  course?: string;
  branch?: string;
  batch?: string;
  yearOfStudy?: number;
  semester?: number;
}
