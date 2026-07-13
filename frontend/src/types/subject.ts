export type SubjectType = 'theory' | 'practical' | 'laboratory';
export type SubjectStatus = 'active' | 'inactive';

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
  type: SubjectType;
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
  type?: SubjectType;
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubjectMappingInput {
  regulationId: number;
  assignments: SubjectMappingAssignment[];
}

export type UpdateSubjectMappingInput = Partial<SubjectMappingAssignment>;

export interface SubjectMappingFilters {
  regulationId?: number;
  course?: string;
  branch?: string;
  batch?: string;
  semester?: number;
}
