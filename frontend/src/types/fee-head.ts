export type FeeHeadType = 'GLOBAL' | 'REGULATION_SPECIFIC';

export type FeeHeadSlab = {
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null;   // YYYY-MM-DD
  amount: number;
  label?: string | null;
};

export type RegulationAmountInput = {
  regulationId?: number | string;
  regulationCode: string;
  amount: number;
  effectiveUntil?: string | null; // YYYY-MM-DD
  amountAfterEnd?: number | null;
  slabs?: FeeHeadSlab[];
};

export type FeeHead = {
  id: number | string;
  name: string;
  code: string;
  description?: string | null;
  type: FeeHeadType;
  defaultAmount: number;
  regulationAmounts: RegulationAmountInput[];
  isMandatory: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateFeeHeadInput = {
  name: string;
  code: string;
  description?: string;
  type: FeeHeadType;
  defaultAmount: number;
  regulationAmounts?: RegulationAmountInput[];
  isMandatory?: boolean;
  isActive?: boolean;
};

export type UpdateFeeHeadInput = Partial<CreateFeeHeadInput>;

export type FeeHeadResolution = {
  feeHeadId: number | string;
  code: string;
  name: string;
  type: FeeHeadType;
  appliedRegulation: string | null;
  isCustomForRegulation?: boolean;
  isTimePeriodExpired?: boolean;
  effectiveUntil?: string | null;
  amountAfterEnd?: number | null;
  amount: number;
};
