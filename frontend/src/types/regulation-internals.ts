export type CalculationMethod =
  | 'WEIGHTED_TWO_MIDS'
  | 'AVERAGE_ALL_MIDS'
  | 'BEST_SINGLE_MID';

export type RoundingRule =
  | 'ROUND_2_DECIMALS'
  | 'ROUND_NEAREST_INT'
  | 'CEIL'
  | 'FLOOR';

export interface RegulationInternalSetting {
  id: number | null;
  regulationId: number | null;
  regulationCode: string;
  regulationName?: string | null;
  calculationMethod: CalculationMethod;
  bestMidWeightage: number;
  otherMidWeightage: number;
  maxInternalMarks: number;
  minPassMarks: number;
  minMidsRequired: number;
  roundingRule: RoundingRule;
  includeAssignments: boolean;
  assignmentMarks: number;
  status: string;
  remarks?: string | null;
  isCustomized?: boolean;
  isInherited?: boolean;
  formulaDescription?: string;
  updatedAt?: string | null;
}

export interface RegulationInternalSettingsOverview {
  globalDefault: RegulationInternalSetting;
  regulations: RegulationInternalSetting[];
}

export interface CalculationSimulationResult {
  marks: number | null;
  status: 'PASS' | 'FAIL' | 'PENDING';
  isPass: boolean | null;
  targetMax: number;
  minPass: number;
  bestMid: number | null;
  secondMid: number | null;
  method: string;
  formulaDescription: string;
  formulaStep?: string;
  rawScores?: number[];
}

