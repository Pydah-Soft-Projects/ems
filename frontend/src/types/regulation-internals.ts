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
    gradePoints?: number | null;
    formulaStep?: string;
  };
}
