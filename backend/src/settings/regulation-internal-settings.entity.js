'use strict';

const { EntitySchema } = require('typeorm');

const CalculationMethod = {
  WEIGHTED_TWO_MIDS: 'WEIGHTED_TWO_MIDS',
  AVERAGE_ALL_MIDS: 'AVERAGE_ALL_MIDS',
  BEST_SINGLE_MID: 'BEST_SINGLE_MID',
};

const RoundingRule = {
  ROUND_2_DECIMALS: 'ROUND_2_DECIMALS',
  ROUND_NEAREST_INT: 'ROUND_NEAREST_INT',
  CEIL: 'CEIL',
  FLOOR: 'FLOOR',
};

const PassStrategy = {
  EXTERNAL_AND_TOTAL: 'EXTERNAL_AND_TOTAL', // Standard JNTU/Autonomous: External >= Min AND Total >= Min
  ALL_THREE: 'ALL_THREE', // Internal >= Min AND External >= Min AND Total >= Min
  TOTAL_ONLY: 'TOTAL_ONLY', // Total >= Min only
  EXTERNAL_ONLY: 'EXTERNAL_ONLY', // External >= Min only
};

const RegulationInternalSetting = new EntitySchema({
  name: 'RegulationInternalSetting',
  tableName: 'regulation_internal_settings',
  indices: [
    {
      name: 'IDX_reg_internal_settings_regulation',
      columns: ['regulationId'],
    },
    {
      name: 'IDX_reg_internal_settings_code',
      columns: ['regulationCode'],
    },
  ],
  columns: {
    id: { type: 'int', primary: true, generated: true },
    regulationId: { type: 'int', nullable: true }, // null indicates global default formula
    regulationCode: { type: 'varchar', length: 50, nullable: true },
    regulationName: { type: 'varchar', length: 200, nullable: true },
    calculationMethod: {
      type: 'varchar',
      length: 50,
      default: CalculationMethod.WEIGHTED_TWO_MIDS,
    },
    bestMidWeightage: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 80.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 80.0),
      },
    },
    otherMidWeightage: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 20.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 20.0),
      },
    },
    maxInternalMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 30.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 30.0),
      },
    },
    minPassMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 16.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 16.0),
      },
    },
    minMidsRequired: { type: 'int', default: 2 },
    roundingRule: {
      type: 'varchar',
      length: 30,
      default: RoundingRule.ROUND_2_DECIMALS,
    },
    includeAssignments: { type: 'boolean', default: false },
    assignmentMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 0.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 0.0),
      },
    },
    // External Marks (SEE) Configuration
    maxExternalMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 70.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 70.0),
      },
    },
    minExternalPassMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 25.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 25.0),
      },
    },
    minExternalPassPercentage: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 35.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 35.0),
      },
    },
    // Combo / Aggregate Total Configuration
    maxTotalMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 100.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 100.0),
      },
    },
    minTotalPassMarks: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 40.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 40.0),
      },
    },
    minTotalPassPercentage: {
      type: 'decimal',
      precision: 5,
      scale: 2,
      default: 40.0,
      transformer: {
        to: (v) => v,
        from: (v) => (v != null ? Number(v) : 40.0),
      },
    },
    requireInternalPass: { type: 'boolean', default: false },
    requireExternalPass: { type: 'boolean', default: true },
    requireTotalPass: { type: 'boolean', default: true },
    passStrategy: {
      type: 'varchar',
      length: 50,
      default: PassStrategy.EXTERNAL_AND_TOTAL,
    },
    status: { type: 'varchar', length: 20, default: 'ACTIVE' },
    remarks: { type: 'text', nullable: true },
    createdAt: { type: 'datetime', createDate: true },
    updatedAt: { type: 'datetime', updateDate: true },
  },
});

module.exports = {
  RegulationInternalSetting,
  CalculationMethod,
  RoundingRule,
  PassStrategy,
};

