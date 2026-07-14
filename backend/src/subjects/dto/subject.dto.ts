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
  /** Default `all` when branch has no sections or user picks all */
  sectionMode?: 'all' | 'selected';
  sections?: string[];
}

export interface CreateSubjectMappingBulkDto {
  regulationId: number;
  assignments: SubjectMappingAssignmentDto[];
}

export type UpdateSubjectMappingDto = Partial<SubjectMappingAssignmentDto>;

/** Replace all subjects for one academic scope (same table as per-subject assignments). */
export interface ReplaceScopeMappingDto {
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
  /** When editing, if scope identity changed, clear these old rows first */
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

export function buildSectionKey(
  sectionMode: 'all' | 'selected' = 'all',
  sections?: string[] | null,
): string {
  if (sectionMode !== 'selected' || !sections?.length) return '*';
  return [...new Set(sections.map((s) => s.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

export function normalizeSectionFields(input: {
  sectionMode?: 'all' | 'selected';
  sections?: string[] | null;
}): {
  sectionMode: 'all' | 'selected';
  sections: string[] | null;
  sectionKey: string;
} {
  const mode = input.sectionMode ?? 'all';
  if (mode !== 'selected' || !input.sections?.length) {
    return { sectionMode: 'all', sections: null, sectionKey: '*' };
  }
  const sections = [
    ...new Set(input.sections.map((s) => s.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return {
    sectionMode: 'selected',
    sections,
    sectionKey: buildSectionKey('selected', sections),
  };
}
