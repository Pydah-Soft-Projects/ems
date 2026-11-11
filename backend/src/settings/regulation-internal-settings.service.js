'use strict';

const { IsNull } = require('typeorm');
const { AppError } = require('../common/errors');
const {
  CalculationMethod,
  RoundingRule,
} = require('./regulation-internal-settings.entity');

const DEFAULT_GLOBAL_CONFIG = {
  regulationId: null,
  regulationCode: 'GLOBAL_DEFAULT',
  regulationName: 'Global Default (All Regulations)',
  calculationMethod: CalculationMethod.WEIGHTED_TWO_MIDS,
  bestMidWeightage: 80.0,
  otherMidWeightage: 20.0,
  maxInternalMarks: 30.0,
  minPassMarks: 16.0,
  minMidsRequired: 2,
  roundingRule: RoundingRule.ROUND_2_DECIMALS,
  includeAssignments: false,
  assignmentMarks: 0.0,
  status: 'ACTIVE',
  remarks: 'Standard weighted formula: 80% best mid + 20% second-best mid (Target: 30, Min Pass: 16)',
};

class RegulationInternalSettingsService {
  constructor(regInternalSettingRepo, regulationRepo = null) {
    this.repo = regInternalSettingRepo;
    this.regulationRepo = regulationRepo;
  }

  /**
   * Helper to format a friendly description of the formula
   */
  formatFormulaDescription(cfg) {
    const max = Number(cfg.maxInternalMarks ?? 30);
    const min = Number(cfg.minPassMarks ?? 16);
    switch (cfg.calculationMethod) {
      case CalculationMethod.AVERAGE_ALL_MIDS:
        return `Average of all Mid exams (Target: ${max}, Min Pass: ${min})`;
      case CalculationMethod.BEST_SINGLE_MID:
        return `Best single Mid exam (100%) (Target: ${max}, Min Pass: ${min})`;
      case CalculationMethod.WEIGHTED_TWO_MIDS:
      default: {
        const w1 = Number(cfg.bestMidWeightage ?? 80);
        const w2 = Number(cfg.otherMidWeightage ?? 20);
        return `${w1}% Best Mid + ${w2}% Other Mid (Target: ${max}, Min Pass: ${min})`;
      }
    }
  }

  /**
   * Ensure the Global Default row exists in DB, or return fallback
   */
  async getGlobalDefault() {
    let globalRow = await this.repo.findOne({
      where: [{ regulationId: IsNull() }, { regulationCode: 'GLOBAL_DEFAULT' }],
    });

    if (!globalRow) {
      try {
        globalRow = this.repo.create({ ...DEFAULT_GLOBAL_CONFIG });
        globalRow = await this.repo.save(globalRow);
      } catch {
        return { ...DEFAULT_GLOBAL_CONFIG, formulaDescription: this.formatFormulaDescription(DEFAULT_GLOBAL_CONFIG) };
      }
    }

    return {
      ...globalRow,
      bestMidWeightage: Number(globalRow.bestMidWeightage ?? 80),
      otherMidWeightage: Number(globalRow.otherMidWeightage ?? 20),
      maxInternalMarks: Number(globalRow.maxInternalMarks ?? 30),
      minPassMarks: Number(globalRow.minPassMarks ?? 16),
      assignmentMarks: Number(globalRow.assignmentMarks ?? 0),
      formulaDescription: this.formatFormulaDescription(globalRow),
    };
  }

  /**
   * List all regulations along with their dynamic internal calculation formula.
   * If a regulation has no explicit override, it inherits from the Global Default.
   */
  async getAllSettings() {
    const globalDefault = await this.getGlobalDefault();

    let allRegulations = [];
    if (this.regulationRepo) {
      allRegulations = await this.regulationRepo.find({
        order: { code: 'ASC' },
      });
    }

    const customSettings = await this.repo.find({
      order: { regulationCode: 'ASC', id: 'ASC' },
    });

    const settingsByRegId = new Map();
    const settingsByRegCode = new Map();

    for (const s of customSettings) {
      if (s.regulationId != null) {
        settingsByRegId.set(s.regulationId, s);
      }
      if (s.regulationCode) {
        settingsByRegCode.set(s.regulationCode.toUpperCase().trim(), s);
      }
    }

    const regulationList = allRegulations.map((reg) => {
      const custom =
        settingsByRegId.get(reg.id) ||
        settingsByRegCode.get(reg.code.toUpperCase().trim()) ||
        null;

      if (custom && custom.regulationCode !== 'GLOBAL_DEFAULT') {
        return {
          id: custom.id,
          regulationId: reg.id,
          regulationCode: reg.code,
          regulationName: reg.name,
          calculationMethod: custom.calculationMethod,
          bestMidWeightage: Number(custom.bestMidWeightage ?? 80),
          otherMidWeightage: Number(custom.otherMidWeightage ?? 20),
          maxInternalMarks: Number(custom.maxInternalMarks ?? 30),
          minPassMarks: Number(custom.minPassMarks ?? 16),
          minMidsRequired: custom.minMidsRequired ?? 2,
          roundingRule: custom.roundingRule ?? RoundingRule.ROUND_2_DECIMALS,
          includeAssignments: Boolean(custom.includeAssignments),
          assignmentMarks: Number(custom.assignmentMarks ?? 0),
          status: custom.status ?? 'ACTIVE',
          remarks: custom.remarks || null,
          isCustomized: true,
          isInherited: false,
          formulaDescription: this.formatFormulaDescription(custom),
          updatedAt: custom.updatedAt,
        };
      }

      return {
        id: null,
        regulationId: reg.id,
        regulationCode: reg.code,
        regulationName: reg.name,
        calculationMethod: globalDefault.calculationMethod,
        bestMidWeightage: globalDefault.bestMidWeightage,
        otherMidWeightage: globalDefault.otherMidWeightage,
        maxInternalMarks: globalDefault.maxInternalMarks,
        minPassMarks: globalDefault.minPassMarks,
        minMidsRequired: globalDefault.minMidsRequired,
        roundingRule: globalDefault.roundingRule,
        includeAssignments: globalDefault.includeAssignments,
        assignmentMarks: globalDefault.assignmentMarks,
        status: 'ACTIVE',
        remarks: 'Inherited from Global Default',
        isCustomized: false,
        isInherited: true,
        formulaDescription: this.formatFormulaDescription(globalDefault),
        updatedAt: null,
      };
    });

    return {
      globalDefault,
      regulations: regulationList,
    };
  }

  /**
   * Get calculation settings for a specific regulation ID or Code.
   */
  async getSettingForRegulation(regulationIdOrCode) {
    const globalDefault = await this.getGlobalDefault();

    if (!regulationIdOrCode || regulationIdOrCode === 'GLOBAL_DEFAULT') {
      return globalDefault;
    }

    let custom = null;
    const numericId = parseInt(regulationIdOrCode, 10);

    if (!isNaN(numericId) && numericId > 0) {
      custom = await this.repo.findOne({ where: { regulationId: numericId } });
    }

    if (!custom) {
      const codeStr = String(regulationIdOrCode).trim().toUpperCase();
      custom = await this.repo.findOne({ where: { regulationCode: codeStr } });
    }

    if (custom && custom.regulationCode !== 'GLOBAL_DEFAULT') {
      return {
        ...custom,
        bestMidWeightage: Number(custom.bestMidWeightage ?? 80),
        otherMidWeightage: Number(custom.otherMidWeightage ?? 20),
        maxInternalMarks: Number(custom.maxInternalMarks ?? 30),
        minPassMarks: Number(custom.minPassMarks ?? 16),
        assignmentMarks: Number(custom.assignmentMarks ?? 0),
        isCustomized: true,
        isInherited: false,
        formulaDescription: this.formatFormulaDescription(custom),
      };
    }

    // Try finding regulation info to attach code & name
    let regInfo = null;
    if (this.regulationRepo) {
      if (!isNaN(numericId) && numericId > 0) {
        regInfo = await this.regulationRepo.findOne({ where: { id: numericId } });
      } else {
        const codeStr = String(regulationIdOrCode).trim().toUpperCase();
        regInfo = await this.regulationRepo.findOne({ where: { code: codeStr } });
      }
    }

    return {
      ...globalDefault,
      id: null,
      regulationId: regInfo ? regInfo.id : (numericId || null),
      regulationCode: regInfo ? regInfo.code : String(regulationIdOrCode),
      regulationName: regInfo ? regInfo.name : null,
      isCustomized: false,
      isInherited: true,
      formulaDescription: this.formatFormulaDescription(globalDefault),
    };
  }

  /**
   * Save or update internal marks calculation settings.
   */
  async saveSetting(dto) {
    const isGlobal =
      dto.regulationId == null ||
      dto.regulationCode === 'GLOBAL_DEFAULT' ||
      dto.regulationId === 0 ||
      dto.regulationId === '0';

    const maxInternalMarks = Number(dto.maxInternalMarks ?? 30);
    if (isNaN(maxInternalMarks) || maxInternalMarks <= 0) {
      throw AppError.badRequest('Maximum internal marks must be greater than 0');
    }

    const minPassMarks = Number(dto.minPassMarks ?? 16);
    if (isNaN(minPassMarks) || minPassMarks < 0 || minPassMarks > maxInternalMarks) {
      throw AppError.badRequest('Minimum pass marks must be between 0 and maximum internal marks');
    }

    const method = dto.calculationMethod || CalculationMethod.WEIGHTED_TWO_MIDS;
    if (!Object.values(CalculationMethod).includes(method)) {
      throw AppError.badRequest(`Invalid calculation method: ${method}`);
    }

    let bestWeight = Number(dto.bestMidWeightage ?? 80);
    let otherWeight = Number(dto.otherMidWeightage ?? 20);

    if (method === CalculationMethod.WEIGHTED_TWO_MIDS) {
      if (isNaN(bestWeight) || bestWeight < 0 || bestWeight > 100) {
        throw AppError.badRequest('Best mid weightage must be between 0% and 100%');
      }
      if (isNaN(otherWeight) || otherWeight < 0 || otherWeight > 100) {
        throw AppError.badRequest('Other mid weightage must be between 0% and 100%');
      }
      if (Math.abs(bestWeight + otherWeight - 100) > 0.01) {
        throw AppError.badRequest(
          `Weightages must sum to 100%. Got ${bestWeight}% + ${otherWeight}% = ${bestWeight + otherWeight}%`,
        );
      }
    } else if (method === CalculationMethod.BEST_SINGLE_MID) {
      bestWeight = 100;
      otherWeight = 0;
    } else if (method === CalculationMethod.AVERAGE_ALL_MIDS) {
      bestWeight = 50;
      otherWeight = 50;
    }

    const rounding = dto.roundingRule || RoundingRule.ROUND_2_DECIMALS;
    if (!Object.values(RoundingRule).includes(rounding)) {
      throw AppError.badRequest(`Invalid rounding rule: ${rounding}`);
    }

    let targetEntity = null;

    if (isGlobal) {
      targetEntity = await this.repo.findOne({
        where: [{ regulationId: IsNull() }, { regulationCode: 'GLOBAL_DEFAULT' }],
      });
      if (!targetEntity) {
        targetEntity = this.repo.create({
          regulationId: null,
          regulationCode: 'GLOBAL_DEFAULT',
          regulationName: 'Global Default (All Regulations)',
        });
      }
    } else {
      const regId = Number(dto.regulationId);
      let regRecord = null;
      if (this.regulationRepo && regId) {
        regRecord = await this.regulationRepo.findOne({ where: { id: regId } });
      }

      targetEntity = await this.repo.findOne({
        where: [{ regulationId: regId }, { regulationCode: dto.regulationCode || (regRecord ? regRecord.code : null) }],
      });

      if (!targetEntity) {
        targetEntity = this.repo.create({
          regulationId: regId,
          regulationCode: regRecord ? regRecord.code : (dto.regulationCode || null),
          regulationName: regRecord ? regRecord.name : (dto.regulationName || null),
        });
      } else {
        if (regRecord) {
          targetEntity.regulationCode = regRecord.code;
          targetEntity.regulationName = regRecord.name;
        }
      }
    }

    targetEntity.calculationMethod = method;
    targetEntity.bestMidWeightage = bestWeight;
    targetEntity.otherMidWeightage = otherWeight;
    targetEntity.maxInternalMarks = maxInternalMarks;
    targetEntity.minPassMarks = minPassMarks;
    targetEntity.minMidsRequired = Number(dto.minMidsRequired ?? (method === CalculationMethod.BEST_SINGLE_MID ? 1 : 2));
    targetEntity.roundingRule = rounding;
    targetEntity.includeAssignments = Boolean(dto.includeAssignments);
    targetEntity.assignmentMarks = Number(dto.assignmentMarks ?? 0);
    targetEntity.status = dto.status || 'ACTIVE';
    targetEntity.remarks = dto.remarks || null;

    const saved = await this.repo.save(targetEntity);
    return {
      ...saved,
      bestMidWeightage: Number(saved.bestMidWeightage),
      otherMidWeightage: Number(saved.otherMidWeightage),
      maxInternalMarks: Number(saved.maxInternalMarks),
      minPassMarks: Number(saved.minPassMarks),
      assignmentMarks: Number(saved.assignmentMarks ?? 0),
      formulaDescription: this.formatFormulaDescription(saved),
    };
  }

  /**
   * Reset a regulation's custom settings back to Global Default
   */
  async resetSetting(id) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Setting record not found');
    }
    if (existing.regulationCode === 'GLOBAL_DEFAULT' || existing.regulationId == null) {
      throw AppError.badRequest('Cannot delete the global default calculation configuration');
    }
    await this.repo.delete(id);
    return { success: true, message: 'Regulation settings reset to Global Default' };
  }

  /**
   * Simulate internal marks calculation with live inputs
   */
  simulate(dto) {
    const entries = Array.isArray(dto.midEntries) ? dto.midEntries : [];
    return this.calculateInternalMarks(entries, dto);
  }

  /**
   * Core Calculation Engine that applies regulation settings dynamically.
   */
  calculateInternalMarks(midEntries, config = {}) {
    const targetMax = Number(config.maxInternalMarks ?? 30);
    const minPass = Number(config.minPassMarks ?? 16);
    const method = config.calculationMethod || CalculationMethod.WEIGHTED_TWO_MIDS;
    const bestWeight = Number(config.bestMidWeightage ?? 80);
    const otherWeight = Number(config.otherMidWeightage ?? 20);
    const minMidsRequired = Number(config.minMidsRequired ?? (method === CalculationMethod.BEST_SINGLE_MID ? 1 : 2));
    const rounding = config.roundingRule || RoundingRule.ROUND_2_DECIMALS;

    if (!Array.isArray(midEntries)) {
      return {
        marks: null,
        status: 'PENDING',
        isPass: null,
        targetMax,
        minPass,
        bestMid: null,
        secondMid: null,
        validScoresCount: 0,
        explanation: 'No mid entries provided',
      };
    }

    const validScores = [];
    const rawEntries = [];

    for (const item of midEntries) {
      if (item === null || item === undefined) continue;
      if (typeof item === 'number') {
        if (!isNaN(item) && item >= 0) {
          validScores.push(item);
          rawEntries.push({ marks: item, maxMarks: targetMax, isAbsent: false, normalized: item });
        }
      } else if (typeof item === 'object') {
        if (item.isAbsent) {
          validScores.push(0);
          rawEntries.push({ marks: 0, maxMarks: targetMax, isAbsent: true, normalized: 0 });
        } else if (item.marks !== null && item.marks !== undefined && !isNaN(Number(item.marks))) {
          const m = Number(item.marks);
          const max = Number(item.maxMarks) || targetMax;
          const normalized = max > 0 ? (m / max) * targetMax : m;
          validScores.push(normalized);
          rawEntries.push({ marks: m, maxMarks: max, isAbsent: false, normalized });
        }
      }
    }

    if (validScores.length < minMidsRequired) {
      return {
        marks: null,
        status: 'PENDING',
        isPass: null,
        targetMax,
        minPass,
        bestMid: validScores[0] != null ? Number(validScores[0].toFixed(2)) : null,
        secondMid: null,
        validScoresCount: validScores.length,
        requiredCount: minMidsRequired,
        explanation: `Requires at least ${minMidsRequired} mid exam score(s) (${validScores.length} entered)`,
      };
    }

    let unroundedMarks = 0;
    let best = null;
    let second = null;
    let formulaStep = '';

    if (method === CalculationMethod.BEST_SINGLE_MID) {
      validScores.sort((a, b) => b - a);
      best = validScores[0];
      unroundedMarks = best;
      formulaStep = `Best single mid score: ${best.toFixed(2)} out of ${targetMax}`;
    } else if (method === CalculationMethod.AVERAGE_ALL_MIDS) {
      const sum = validScores.reduce((acc, v) => acc + v, 0);
      unroundedMarks = sum / validScores.length;
      formulaStep = `Average of ${validScores.length} mids: (${validScores.map((s) => s.toFixed(1)).join(' + ')}) / ${validScores.length} = ${unroundedMarks.toFixed(2)}`;
    } else {
      // WEIGHTED_TWO_MIDS (default)
      validScores.sort((a, b) => b - a);
      best = validScores[0];
      second = validScores[1] != null ? validScores[1] : 0;
      unroundedMarks = best * (bestWeight / 100) + second * (otherWeight / 100);
      formulaStep = `(${best.toFixed(2)} × ${bestWeight}%) + (${second.toFixed(2)} × ${otherWeight}%) = ${(best * (bestWeight / 100)).toFixed(2)} + ${(second * (otherWeight / 100)).toFixed(2)} = ${unroundedMarks.toFixed(2)}`;
    }

    let finalMarks = unroundedMarks;
    switch (rounding) {
      case RoundingRule.ROUND_NEAREST_INT:
        finalMarks = Math.round(unroundedMarks);
        break;
      case RoundingRule.CEIL:
        finalMarks = Math.ceil(unroundedMarks);
        break;
      case RoundingRule.FLOOR:
        finalMarks = Math.floor(unroundedMarks);
        break;
      case RoundingRule.ROUND_2_DECIMALS:
      default:
        finalMarks = Number(unroundedMarks.toFixed(2));
        break;
    }

    const isPass = finalMarks >= minPass;

    return {
      marks: finalMarks,
      status: isPass ? 'PASS' : 'FAIL',
      isPass,
      targetMax,
      minPass,
      bestMid: best != null ? Number(best.toFixed(2)) : null,
      secondMid: second != null ? Number(second.toFixed(2)) : null,
      method,
      formulaDescription: this.formatFormulaDescription({
        maxInternalMarks: targetMax,
        minPassMarks: minPass,
        calculationMethod: method,
        bestMidWeightage: bestWeight,
        otherMidWeightage: otherWeight,
      }),
      formulaStep,
      rawScores: validScores.map((s) => Number(s.toFixed(2))),
    };
  }
}

module.exports = {
  RegulationInternalSettingsService,
  DEFAULT_GLOBAL_CONFIG,
};

