import { SubjectType, SubjectStatus } from '../schemas/subject.enums';

export interface CreateSubjectDto {
  regulationId: number;
  code: string;
  name: string;
  type?: SubjectType;
  credits?: number;
  internalMarks?: number;
  externalMarks?: number;
  totalMarks?: number;
  status?: SubjectStatus;
  collegeId?: number;
  collegeName?: string;
  courseId?: number;
  courseName?: string;
  branchId?: number;
  branchName?: string;
  yearOfStudy?: number;
  semester?: number;
}

export type UpdateSubjectDto = Partial<CreateSubjectDto>;

export interface SubjectMappingAssignmentDto {
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

export interface CreateSubjectMappingBulkDto {
  regulationId: number;
  assignments: SubjectMappingAssignmentDto[];
}

export type UpdateSubjectMappingDto = Partial<SubjectMappingAssignmentDto>;
