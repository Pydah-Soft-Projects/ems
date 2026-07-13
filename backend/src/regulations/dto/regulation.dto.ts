import { RegulationStatus } from '../schemas/regulation-status.enum';

export interface RegulationScopeInput {
  collegeId: number;
  collegeName: string;
  courseId: number;
  courseName: string;
  batches: string[];
}

export interface CreateRegulationDto {
  code: string;
  name: string;
  description?: string;
  effectiveDate?: string;
  status?: RegulationStatus;
  scopes?: RegulationScopeInput[];
}

export type UpdateRegulationDto = Partial<CreateRegulationDto>;

export interface RegulationBatchInsightQuery {
  collegeId: number;
  courseId: number;
  batch: string;
}
