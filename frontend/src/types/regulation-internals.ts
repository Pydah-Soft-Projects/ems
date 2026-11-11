export type CalculationMethod =
  | 'WEIGHTED_TWO_MIDS'
  | 'AVERAGE_ALL_MIDS'
  | 'BEST_SINGLE_MID';

export type RoundingRule =
  | 'ROUND_2_DECIMALS'
  | 'ROUND_NEAREST_INT'
  | 'CEIL'
  | 'FLOOR';

export type PassStrategy =
  | 'EXTERNAL_AND_TOTAL' // Standard JNTU/University rule: External >= Min AND Total >= Min
  | 'ALL_THREE' // Internal >= Min AND External >= Min AND Total >= Min
  | 'TOTAL_ONLY' // Total aggregate >= Min only
  | 'EXTERNAL_ONLY'; // External >= Min only

export interface GradePointRule {
  minPercentage: number;
  maxPercentage: number;
  grade: string;
  gradeDescription: string;
  gradePoints: number;
  isPass: boolean;
}

export const DEFAULT_GRADING_SCALE: GradePointRule[] = [
  { minPercentage: 90, maxPercentage: 100, grade: 'S', gradeDescription: 'Superior', gradePoints: 10, isPass: true },
  { minPercentage: 80, maxPercentage: 89, grade: 'A', gradeDescription: 'Excellent', gradePoints: 9, isPass: true },
  { minPercentage: 70, maxPercentage: 79, grade: 'B', gradeDescription: 'Very Good', gradePoints: 8, isPass: true },
  { minPercentage: 60, maxPercentage: 69, grade: 'C', gradeDescription: 'Good', gradePoints: 7, isPass: true },
  { minPercentage: 50, maxPercentage: 59, grade: 'D', gradeDescription: 'Average', gradePoints: 6, isPass: true },
  { minPercentage: 40, maxPercentage: 49, grade: 'E', gradeDescription: 'Pass', gradePoints: 5, isPass: true },
  { minPercentage: 0, maxPercentage: 39, grade: 'F', gradeDescription: 'Fail', gradePoints: 0, isPass: false },
  { minPercentage: 0, maxPercentage: 0, grade: 'Ab', gradeDescription: 'Absent', gradePoints: 0, isPass: false },
];

export const UGC_GRADING_SCALE: GradePointRule[] = [
  { minPercentage: 90, maxPercentage: 100, grade: 'O', gradeDescription: 'Outstanding', gradePoints: 10, isPass: true },
  { minPercentage: 80, maxPercentage: 89, grade: 'A+', gradeDescription: 'Excellent', gradePoints: 9, isPass: true },
  { minPercentage: 70, maxPercentage: 79, grade: 'A', gradeDescription: 'Very Good', gradePoints: 8, isPass: true },
  { minPercentage: 60, maxPercentage: 69, grade: 'B+', gradeDescription: 'Good', gradePoints: 7, isPass: true },
  { minPercentage: 50, maxPercentage: 59, grade: 'B', gradeDescription: 'Above Average', gradePoints: 6, isPass: true },
  { minPercentage: 40, maxPercentage: 49, grade: 'C', gradeDescription: 'Pass', gradePoints: 5, isPass: true },
  { minPercentage: 0, maxPercentage: 39, grade: 'F', gradeDescription: 'Fail', gradePoints: 0, isPass: false },
  { minPercentage: 0, maxPercentage: 0, grade: 'Ab', gradeDescription: 'Absent', gradePoints: 0, isPass: false },
];

export interface RegulationInternalSetting {
  id: number | null;
  regulationId: number | null;
  regulationCode: string;
  regulationName?: string | null;

  // Internal CIE Setup
  calculationMethod: CalculationMethod;
  bestMidWeightage: number;
  otherMidWeightage: number;
  maxInternalMarks: number;
  minPassMarks: number;
  minMidsRequired: number;
  roundingRule: RoundingRule;
  includeAssignments: boolean;
  assignmentMarks: number;

  // External SEE Setup
  maxExternalMarks: number;
  minExternalPassMarks: number;
  minExternalPassPercentage: number;
  requireExternalPass: boolean;

  // Combo / Aggregate Setup
  maxTotalMarks: number;
  minTotalPassMarks: number;
  minTotalPassPercentage: number;
  requireInternalPass: boolean;
  requireTotalPass: boolean;
  passStrategy: PassStrategy;
  gradingScale?: GradePointRule[];

  status: string;
  remarks?: string | null;
  isCustomized?: boolean;
  isInherited?: boolean;
  internalDescription?: string;
  externalDescription?: string;
  comboDescription?: string;
  formulaDescription?: string;
  updatedAt?: string | null;
}

export type RegulationMarksSetting = RegulationInternalSetting;

export interface RegulationInternalSettingsOverview {
  globalDefault: RegulationInternalSetting;
  regulations: RegulationInternalSetting[];
}

export interface RegulationMarksSimulationDto {
  midEntries: Array<number | { marks: number; maxMarks?: number; isAbsent?: boolean }>;
  calculationMethod?: string;
  bestMidWeightage?: number;
  otherMidWeightage?: number;
  maxInternalMarks?: number;
  minPassMarks?: number;
  roundingRule?: string;
  minMidsRequired?: number;
  externalMarks?: number | string;
  externalAbsent?: boolean;
  maxExternalMarks?: number;
  minExternalPassMarks?: number;
  minExternalPassPercentage?: number;
  maxTotalMarks?: number;
  minTotalPassMarks?: number;
  minTotalPassPercentage?: number;
  passStrategy?: string;
  requireInternalPass?: boolean;
  requireExternalPass?: boolean;
  requireTotalPass?: boolean;
  gradingScale?: GradePointRule[];
}

export interface RegulationMarksDiff {
  field: string;
  label: string;
  from: any;
  to: any;
}

export interface RegulationMarksAuditRecord {
  id: number;
  regulationId: number | null;
  regulationCode: string;
  regulationName: string | null;
  action: 'CREATED' | 'UPDATED' | 'RESET_TO_DEFAULT';
  changedByEmail: string | null;
  changedByName: string | null;
  changedByRole: string | null;
  fromState: Record<string, any> | null;
  toState: Record<string, any> | null;
  changes: RegulationMarksDiff[];
  remarks: string | null;
  createdAt: string;
  formattedDate?: string;
}

export interface CalculationSimulationResult {
  // Top-level / legacy fields
  marks: number | null;
  status: 'PASS' | 'FAIL' | 'PENDING' | 'ABSENT';
  isPass: boolean | null;
  targetMax: number;
  minPass: number;
  bestMid: number | null;
  secondMid: number | null;
  method?: string;
  formulaDescription?: string;
  formulaStep?: string;
  rawScores?: number[];

  // Detailed Structured Assessment Sections
  internal?: {
    marks: number | null;
    targetMax: number;
    minPass: number;
    isPass: boolean | null;
    status: string;
    formulaStep?: string;
    bestMid?: number | null;
    secondMid?: number | null;
  };

  external?: {
    marks: number | null;
    targetMax: number;
    minPass: number;
    minPassPercentage: number;
    isPass: boolean | null;
    isAbsent: boolean;
    status: string;
    formulaStep?: string;
  };

  combo?: {
    totalMarks: number | null;
    targetMax: number;
    minPass: number;
    minPassPercentage: number;
    isTotalPass: boolean | null;
    overallPass: boolean | null;
    overallStatus: 'PASS' | 'FAIL' | 'ABSENT' | 'PENDING';
    passStrategy: string;
    grade?: string | null;
    gradeDescription?: string | null;
    gradePoints?: number | null;
    percentage?: number | null;
    formulaStep?: string;
  };
}
