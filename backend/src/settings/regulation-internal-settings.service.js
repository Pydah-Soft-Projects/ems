'use strict';

const { IsNull } = require('typeorm');
const { AppError } = require('../common/errors');
const {
  CalculationMethod,
  RoundingRule,
  PassStrategy,
} = require('./regulation-internal-settings.entity');

const DEFAULT_GLOBAL_CONFIG = {
  regulationId: null,
  regulationCode: 'GLOBAL_DEFAULT',
  regulationName: 'Global Default (All Regulations)',
  // Internal CIE Scheme
  calculationMethod: CalculationMethod.WEIGHTED_TWO_MIDS,
  bestMidWeightage: 80.0,
  otherMidWeightage: 20.0,
  maxInternalMarks: 30.0,
  minPassMarks: 16.0,
  minMidsRequired: 2,
  roundingRule: RoundingRule.ROUND_2_DECIMALS,
  includeAssignments: false,
  assignmentMarks: 0.0,
  // External SEE Scheme
  maxExternalMarks: 70.0,
  minExternalPassMarks: 25.0,
  minExternalPassPercentage: 35.0,
  requireExternalPass: true,
  // Combo / Aggregate Scheme
  maxTotalMarks: 100.0,
  minTotalPassMarks: 40.0,
  minTotalPassPercentage: 40.0,
  requireInternalPass: false,
  requireTotalPass: true,
  passStrategy: PassStrategy ? PassStrategy.EXTERNAL_AND_TOTAL : 'EXTERNAL_AND_TOTAL',
  status: 'ACTIVE',
  remarks: 'Standard 30 Internal + 70 External = 100 Total (Pass: Ext ≥ 25, Total ≥ 40)',
};

class RegulationInternalSettingsService {
  constructor(regInternalSettingRepo, regulationRepo = null, auditRepo = null) {
    this.repo = regInternalSettingRepo;
    this.regulationRepo = regulationRepo;
    this.auditRepo = auditRepo;
  }

  /**
   * Helper descriptions for Internal, External, and Combined assessment rules
   */
  formatInternalDescription(cfg) {
    const max = Number(cfg.maxInternalMarks ?? 30);
    const min = Number(cfg.minPassMarks ?? 16);
    switch (cfg.calculationMethod) {
      case CalculationMethod.AVERAGE_ALL_MIDS:
        return `Average of both Mid exams (Target: ${max}, Min Pass: ${min})`;
      case CalculationMethod.BEST_SINGLE_MID:
        return `Best single Mid exam (100%) (Target: ${max}, Min Pass: ${min})`;
      case CalculationMethod.WEIGHTED_TWO_MIDS:
      default: {
        const w1 = Number(cfg.bestMidWeightage ?? 80);
        const w2 = Number(cfg.otherMidWeightage ?? 20);
        return `${w1}% Best Mid + ${w2}% Second Mid (Target: ${max}, Min Pass: ${min})`;
      }
    }
  }

  formatExternalDescription(cfg) {
    const max = Number(cfg.maxExternalMarks ?? 70);
    const min = Number(cfg.minExternalPassMarks ?? 25);
    const pct = Number(cfg.minExternalPassPercentage ?? 35);
    return `Semester End Exam (Target: ${max}, Min Pass: ${min} [${pct}%])`;
  }

  formatComboDescription(cfg) {
    const maxTot = Number(cfg.maxTotalMarks ?? 100);
    const minTot = Number(cfg.minTotalPassMarks ?? 40);
    const strategy = cfg.passStrategy || 'EXTERNAL_AND_TOTAL';
    const strategyText =
      strategy === 'ALL_THREE'
        ? 'Internal ≥ Min + External ≥ Min + Total ≥ Min'
        : strategy === 'TOTAL_ONLY'
        ? 'Total Aggregate ≥ Min only'
        : 'External ≥ Min + Total Aggregate ≥ Min';
    return `Aggregate Assessment (Target: ${maxTot}, Min Pass: ${minTot}, Rule: ${strategyText})`;
  }

  formatFormulaDescription(cfg) {
    return `${this.formatInternalDescription(cfg)} | ${this.formatExternalDescription(cfg)} | ${this.formatComboDescription(cfg)}`;
  }

  /**
   * Normalize an entity row into an API-ready object
   */
  normalizeRecord(row, isCustomized = true, isInherited = false) {
    const maxInt = Number(row.maxInternalMarks ?? 30);
    const maxExt = Number(row.maxExternalMarks ?? 70);
    const maxTot = Number(row.maxTotalMarks ?? (maxInt + maxExt));
    return {
      id: row.id || null,
      regulationId: row.regulationId || null,
      regulationCode: row.regulationCode || 'GLOBAL_DEFAULT',
      regulationName: row.regulationName || null,
      // Internal Setup
      calculationMethod: row.calculationMethod || CalculationMethod.WEIGHTED_TWO_MIDS,
      bestMidWeightage: Number(row.bestMidWeightage ?? 80),
      otherMidWeightage: Number(row.otherMidWeightage ?? 20),
      maxInternalMarks: maxInt,
      minPassMarks: Number(row.minPassMarks ?? 16),
      minMidsRequired: row.minMidsRequired ?? (row.calculationMethod === CalculationMethod.BEST_SINGLE_MID ? 1 : 2),
      roundingRule: row.roundingRule || RoundingRule.ROUND_2_DECIMALS,
      includeAssignments: Boolean(row.includeAssignments),
      assignmentMarks: Number(row.assignmentMarks ?? 0),
      // External Setup
      maxExternalMarks: maxExt,
      minExternalPassMarks: Number(row.minExternalPassMarks ?? 25),
      minExternalPassPercentage: Number(row.minExternalPassPercentage ?? 35),
      requireExternalPass: row.requireExternalPass !== false,
      // Combo Setup
      maxTotalMarks: maxTot,
      minTotalPassMarks: Number(row.minTotalPassMarks ?? 40),
      minTotalPassPercentage: Number(row.minTotalPassPercentage ?? 40),
      requireInternalPass: Boolean(row.requireInternalPass),
      requireTotalPass: row.requireTotalPass !== false,
      passStrategy: row.passStrategy || 'EXTERNAL_AND_TOTAL',
      status: row.status || 'ACTIVE',
      remarks: row.remarks || null,
      isCustomized,
      isInherited,
      internalDescription: this.formatInternalDescription(row),
      externalDescription: this.formatExternalDescription(row),
      comboDescription: this.formatComboDescription(row),
      formulaDescription: this.formatFormulaDescription(row),
      updatedAt: row.updatedAt || null,
    };
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
        return this.normalizeRecord(DEFAULT_GLOBAL_CONFIG, false, true);
      }
    }

    return this.normalizeRecord(globalRow, false, false);
  }

  /**
   * List all regulations along with their dynamic marks calculation schemes.
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
        return this.normalizeRecord(
          { ...custom, regulationId: reg.id, regulationCode: reg.code, regulationName: reg.name },
          true,
          false,
        );
      }

      return this.normalizeRecord(
        {
          ...globalDefault,
          id: null,
          regulationId: reg.id,
          regulationCode: reg.code,
          regulationName: reg.name,
          remarks: 'Inherited from Global Default',
          updatedAt: null,
        },
        false,
        true,
      );
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
      return this.normalizeRecord(custom, true, false);
    }

    let regInfo = null;
    if (this.regulationRepo) {
      if (!isNaN(numericId) && numericId > 0) {
        regInfo = await this.regulationRepo.findOne({ where: { id: numericId } });
      } else {
        const codeStr = String(regulationIdOrCode).trim().toUpperCase();
        regInfo = await this.regulationRepo.findOne({ where: { code: codeStr } });
      }
    }

    return this.normalizeRecord(
      {
        ...globalDefault,
        id: null,
        regulationId: regInfo ? regInfo.id : (numericId || null),
        regulationCode: regInfo ? regInfo.code : String(regulationIdOrCode),
        regulationName: regInfo ? regInfo.name : null,
      },
      false,
      true,
    );
  }

  /**
   * Snapshot state for audit trail
   */
  extractStateSnapshot(entity) {
    if (!entity) return null;
    return {
      calculationMethod: entity.calculationMethod,
      bestMidWeightage: Number(entity.bestMidWeightage ?? 80),
      otherMidWeightage: Number(entity.otherMidWeightage ?? 20),
      maxInternalMarks: Number(entity.maxInternalMarks ?? 30),
      minPassMarks: Number(entity.minPassMarks ?? 16),
      roundingRule: entity.roundingRule || 'ROUND_2_DECIMALS',
      maxExternalMarks: Number(entity.maxExternalMarks ?? 70),
      minExternalPassMarks: Number(entity.minExternalPassMarks ?? 25),
      minExternalPassPercentage: Number(entity.minExternalPassPercentage ?? 35),
      requireExternalPass: entity.requireExternalPass !== false,
      maxTotalMarks: Number(entity.maxTotalMarks ?? 100),
      minTotalPassMarks: Number(entity.minTotalPassMarks ?? 40),
      minTotalPassPercentage: Number(entity.minTotalPassPercentage ?? 40),
      requireInternalPass: Boolean(entity.requireInternalPass),
      passStrategy: entity.passStrategy || 'EXTERNAL_AND_TOTAL',
      remarks: entity.remarks || null,
    };
  }

  formatFieldLabel(key) {
    const map = {
      maxInternalMarks: 'Max Internal Marks (CIE)',
      maxExternalMarks: 'Max External Marks (SEE)',
      maxTotalMarks: 'Course Maximum Total Marks',
      minPassMarks: 'Internal Pass Cutoff',
      minExternalPassMarks: 'External Min Pass Marks',
      minExternalPassPercentage: 'External Pass % Cutoff',
      minTotalPassMarks: 'Min Total Pass Marks',
      minTotalPassPercentage: 'Total Aggregate Pass %',
      calculationMethod: 'Internal Calculation Method',
      bestMidWeightage: 'Best Mid Weightage (%)',
      otherMidWeightage: 'Second-Best Mid Weightage (%)',
      passStrategy: 'Evaluation Pass Strategy',
      roundingRule: 'Decimal Rounding Rule',
      requireExternalPass: 'Mandatory External Pass',
      requireInternalPass: 'Strict Internal Cutoff Required',
      remarks: 'Scheme Remarks / Reference',
    };
    return map[key] || key;
  }

  computeStateDiff(fromState, toState) {
    if (!toState) return [];
    const trackedKeys = [
      'maxInternalMarks',
      'maxExternalMarks',
      'maxTotalMarks',
      'minPassMarks',
      'minExternalPassMarks',
      'minExternalPassPercentage',
      'minTotalPassMarks',
      'minTotalPassPercentage',
      'calculationMethod',
      'bestMidWeightage',
      'otherMidWeightage',
      'passStrategy',
      'roundingRule',
      'requireExternalPass',
      'requireInternalPass',
      'remarks',
    ];

    if (!fromState) {
      return trackedKeys.map((key) => ({
        field: key,
        label: this.formatFieldLabel(key),
        from: null,
        to: toState[key] ?? null,
      }));
    }

    const diffs = [];
    for (const key of trackedKeys) {
      const fromVal = fromState[key];
      const toVal = toState[key];
      if (fromVal != toVal) {
        diffs.push({
          field: key,
          label: this.formatFieldLabel(key),
          from: fromVal !== undefined ? fromVal : null,
          to: toVal !== undefined ? toVal : null,
        });
      }
    }
    return diffs;
  }

  async recordAuditLog({
    regulationId,
    regulationCode,
    regulationName,
    action,
    actor,
    fromState,
    toState,
    changes,
    remarks,
  }) {
    if (!this.auditRepo) return null;
    try {
      const actorEmail = actor?.email || actor?.username || 'system';
      const actorName = actor?.fullName || actor?.name || actor?.email || 'Administrator';
      const actorRole = actor?.role?.name || actor?.roleName || (actor?.isSuperAdmin ? 'Super Admin' : 'Admin');

      const log = this.auditRepo.create({
        regulationId: regulationId ? Number(regulationId) : null,
        regulationCode: regulationCode || 'GLOBAL_DEFAULT',
        regulationName: regulationName || null,
        action,
        changedByEmail: actorEmail,
        changedByName: actorName,
        changedByRole: actorRole,
        fromState: fromState || null,
        toState: toState || null,
        changes: changes || [],
        remarks: remarks || null,
      });

      return await this.auditRepo.save(log);
    } catch (err) {
      console.error('Failed to write regulation marks audit log:', err);
      return null;
    }
  }

  async getHistory(filters = {}) {
    if (!this.auditRepo) return [];
    try {
      const query = this.auditRepo.createQueryBuilder('log');

      if (filters.regulationCode) {
        query.andWhere('log.regulationCode = :code', { code: String(filters.regulationCode).trim() });
      } else if (filters.regulationId) {
        query.andWhere('log.regulationId = :regId', { regId: Number(filters.regulationId) });
      }

      if (filters.action && filters.action !== 'ALL') {
        query.andWhere('log.action = :action', { action: String(filters.action).trim() });
      }

      query.orderBy('log.createdAt', 'DESC');
      const limit = Math.min(Number(filters.limit || 100), 500);
      query.take(limit);

      const logs = await query.getMany();
      return logs.map((l) => ({
        ...l,
        formattedDate: l.createdAt
          ? new Date(l.createdAt).toLocaleString('en-IN', {
              dateStyle: 'medium',
              timeStyle: 'medium',
            })
          : 'N/A',
      }));
    } catch (err) {
      console.error('Failed to query regulation marks audit history:', err);
      return [];
    }
  }

  async getHistoryForRegulation(regulationIdOrCode) {
    if (!this.auditRepo) return [];
    const numericId = Number(regulationIdOrCode);
    if (!isNaN(numericId) && numericId > 0) {
      return this.getHistory({ regulationId: numericId });
    }
    return this.getHistory({ regulationCode: String(regulationIdOrCode).trim() });
  }

  /**
   * Save or update marks calculation settings.
   */
  async saveSetting(dto, actor = null) {
    const isGlobal =
      dto.regulationId == null ||
      dto.regulationCode === 'GLOBAL_DEFAULT' ||
      dto.regulationId === 0 ||
      dto.regulationId === '0';

    // Internal validations
    const maxInternalMarks = Number(dto.maxInternalMarks ?? 30);
    if (isNaN(maxInternalMarks) || maxInternalMarks <= 0) {
      throw AppError.badRequest('Maximum internal marks must be greater than 0');
    }

    const minPassMarks = Number(dto.minPassMarks ?? 16);
    if (isNaN(minPassMarks) || minPassMarks < 0 || minPassMarks > maxInternalMarks) {
      throw AppError.badRequest('Minimum internal pass marks must be between 0 and maximum internal marks');
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

    // External validations
    const maxExternalMarks = Number(dto.maxExternalMarks ?? 70);
    if (isNaN(maxExternalMarks) || maxExternalMarks <= 0) {
      throw AppError.badRequest('Maximum external marks must be greater than 0');
    }

    const minExternalPassMarks = Number(dto.minExternalPassMarks ?? 25);
    if (isNaN(minExternalPassMarks) || minExternalPassMarks < 0 || minExternalPassMarks > maxExternalMarks) {
      throw AppError.badRequest('Minimum external pass marks must be between 0 and maximum external marks');
    }

    const minExternalPassPercentage = Number(dto.minExternalPassPercentage ?? ((minExternalPassMarks / maxExternalMarks) * 100));

    // Combo validations & Mathematical Consistency check
    const computedTotal = Number((maxInternalMarks + maxExternalMarks).toFixed(2));
    let maxTotalMarks = Number(dto.maxTotalMarks ?? computedTotal);
    // Enforce that maxTotalMarks is always the exact mathematical sum of maxInternal + maxExternal
    if (isNaN(maxTotalMarks) || maxTotalMarks <= 0 || Math.abs(maxTotalMarks - computedTotal) > 0.01) {
      maxTotalMarks = computedTotal;
    }

    const minTotalPassMarks = Number(dto.minTotalPassMarks ?? 40);
    if (isNaN(minTotalPassMarks) || minTotalPassMarks < 0 || minTotalPassMarks > maxTotalMarks) {
      throw AppError.badRequest(`Minimum total pass marks must be between 0 and maximum total marks (${maxTotalMarks})`);
    }

    const minTotalPassPercentage = Number(dto.minTotalPassPercentage ?? ((minTotalPassMarks / maxTotalMarks) * 100));

    const rounding = dto.roundingRule || RoundingRule.ROUND_2_DECIMALS;
    if (!Object.values(RoundingRule).includes(rounding)) {
      throw AppError.badRequest(`Invalid rounding rule: ${rounding}`);
    }

    const strategy = dto.passStrategy || 'EXTERNAL_AND_TOTAL';

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

    // Snapshot prior state for audit tracking
    const isNew = !targetEntity.id;
    const fromState = this.extractStateSnapshot(isNew ? null : targetEntity);

    // Assign Internal
    targetEntity.calculationMethod = method;
    targetEntity.bestMidWeightage = bestWeight;
    targetEntity.otherMidWeightage = otherWeight;
    targetEntity.maxInternalMarks = maxInternalMarks;
    targetEntity.minPassMarks = minPassMarks;
    targetEntity.minMidsRequired = Number(dto.minMidsRequired ?? (method === CalculationMethod.BEST_SINGLE_MID ? 1 : 2));
    targetEntity.roundingRule = rounding;
    targetEntity.includeAssignments = Boolean(dto.includeAssignments);
    targetEntity.assignmentMarks = Number(dto.assignmentMarks ?? 0);

    // Assign External
    targetEntity.maxExternalMarks = maxExternalMarks;
    targetEntity.minExternalPassMarks = minExternalPassMarks;
    targetEntity.minExternalPassPercentage = minExternalPassPercentage;
    targetEntity.requireExternalPass = dto.requireExternalPass !== false;

    // Assign Combo
    targetEntity.maxTotalMarks = maxTotalMarks;
    targetEntity.minTotalPassMarks = minTotalPassMarks;
    targetEntity.minTotalPassPercentage = minTotalPassPercentage;
    targetEntity.requireInternalPass = Boolean(dto.requireInternalPass);
    targetEntity.requireTotalPass = dto.requireTotalPass !== false;
    targetEntity.passStrategy = strategy;

    targetEntity.status = dto.status || 'ACTIVE';
    targetEntity.remarks = dto.remarks || null;

    const saved = await this.repo.save(targetEntity);

    // Record audit history entry
    const toState = this.extractStateSnapshot(saved);
    const changes = this.computeStateDiff(fromState, toState);
    await this.recordAuditLog({
      regulationId: saved.regulationId,
      regulationCode: saved.regulationCode,
      regulationName: saved.regulationName,
      action: isNew ? 'CREATED' : 'UPDATED',
      actor,
      fromState,
      toState,
      changes,
      remarks: saved.remarks,
    });

    return this.normalizeRecord(saved, !isGlobal, false);
  }

  /**
   * Reset a regulation's custom settings back to Global Default
   */
  async resetSetting(id, actor = null) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Setting record not found');
    }
    if (existing.regulationCode === 'GLOBAL_DEFAULT' || existing.regulationId == null) {
      throw AppError.badRequest('Cannot delete the global default calculation configuration');
    }

    const fromState = this.extractStateSnapshot(existing);
    const globalDefault = await this.getGlobalDefault();
    const toState = this.extractStateSnapshot(globalDefault);
    const changes = this.computeStateDiff(fromState, toState);

    await this.repo.delete(id);

    // Record audit history for reset
    await this.recordAuditLog({
      regulationId: existing.regulationId,
      regulationCode: existing.regulationCode,
      regulationName: existing.regulationName,
      action: 'RESET_TO_DEFAULT',
      actor,
      fromState,
      toState,
      changes,
      remarks: 'Reset custom regulation setup to inherit Global Baseline',
    });

    return { success: true, message: 'Regulation marks setup reset to Global Default' };
  }

  /**
   * Core Internal Calculation Engine
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
        explanation: `Requires at least ${minMidsRequired} mid score(s) (${validScores.length} entered)`,
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
      formulaDescription: this.formatInternalDescription({
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

  /**
   * Comprehensive Assessment Simulation (Internal, External, and Combined Total)
   */
  simulate(dto) {
    const entries = Array.isArray(dto.midEntries) ? dto.midEntries : [];
    const internalRes = this.calculateInternalMarks(entries, dto);

    // External Assessment Evaluation
    const maxExternal = Number(dto.maxExternalMarks ?? 70);
    const minExternalPass = Number(dto.minExternalPassMarks ?? 25);
    const minExternalPct = Number(dto.minExternalPassPercentage ?? 35);
    const isExtAbsent = Boolean(dto.externalAbsent || dto.isExternalAbsent);
    const rawExternal = dto.externalMarks !== undefined && dto.externalMarks !== '' ? parseFloat(dto.externalMarks) : null;

    let externalMarks = null;
    let isExternalPass = null;
    let externalStatus = 'PENDING';
    let externalStep = '';

    if (isExtAbsent) {
      externalMarks = 0;
      isExternalPass = false;
      externalStatus = 'ABSENT';
      externalStep = `Candidate marked absent in Semester End Examination (Score: 0 / ${maxExternal})`;
    } else if (rawExternal !== null && !isNaN(rawExternal)) {
      externalMarks = rawExternal;
      isExternalPass = externalMarks >= minExternalPass;
      externalStatus = isExternalPass ? 'PASS' : 'FAIL';
      externalStep = `Scored ${externalMarks.toFixed(1)} / ${maxExternal} (Pass cutoff ≥ ${minExternalPass} [${minExternalPct}%]) → ${isExternalPass ? 'PASSED' : 'FAILED'}`;
    }

    // Combo Assessment Evaluation
    const maxTotal = Number(dto.maxTotalMarks ?? (internalRes.targetMax + maxExternal));
    const minTotalPass = Number(dto.minTotalPassMarks ?? 40);
    const minTotalPct = Number(dto.minTotalPassPercentage ?? 40);
    const passStrategy = dto.passStrategy || 'EXTERNAL_AND_TOTAL';
    const requireInternalPass = Boolean(dto.requireInternalPass);

    let totalMarks = null;
    let isTotalPass = null;
    let overallPass = null;
    let overallStatus = 'PENDING';
    let comboStep = '';
    let grade = null;
    let gradePoints = null;

    if (internalRes.marks !== null && externalMarks !== null) {
      totalMarks = Number((internalRes.marks + externalMarks).toFixed(2));
      isTotalPass = totalMarks >= minTotalPass;

      // Evaluate Strategy
      if (isExtAbsent) {
        overallPass = false;
        overallStatus = 'ABSENT';
        grade = 'AB';
        gradePoints = 0;
      } else {
        if (passStrategy === 'ALL_THREE') {
          overallPass = internalRes.isPass && isExternalPass && isTotalPass;
        } else if (passStrategy === 'TOTAL_ONLY') {
          overallPass = isTotalPass;
        } else if (passStrategy === 'EXTERNAL_ONLY') {
          overallPass = isExternalPass;
        } else {
          // Standard EXTERNAL_AND_TOTAL
          overallPass = isExternalPass && isTotalPass && (!requireInternalPass || internalRes.isPass);
        }

        overallStatus = overallPass ? 'PASS' : 'FAIL';

        // Grade allocation
        const percentage = (totalMarks / maxTotal) * 100;
        if (!overallPass) {
          grade = 'F';
          gradePoints = 0;
        } else if (percentage >= 90) {
          grade = 'O';
          gradePoints = 10;
        } else if (percentage >= 80) {
          grade = 'A+';
          gradePoints = 9;
        } else if (percentage >= 70) {
          grade = 'A';
          gradePoints = 8;
        } else if (percentage >= 60) {
          grade = 'B+';
          gradePoints = 7;
        } else if (percentage >= 50) {
          grade = 'B';
          gradePoints = 6;
        } else if (percentage >= 40) {
          grade = 'C';
          gradePoints = 5;
        } else {
          grade = 'F';
          gradePoints = 0;
        }
      }

      comboStep = `Internal (${internalRes.marks}) + External (${externalMarks}) = ${totalMarks} / ${maxTotal}. Cutoffs: External (≥ ${minExternalPass}: ${isExternalPass ? 'Yes' : 'No'}), Total Aggregate (≥ ${minTotalPass}: ${isTotalPass ? 'Yes' : 'No'}) → Overall: ${overallStatus} (Grade: ${grade})`;
    }

    return {
      // Legacy top-level compatibility
      marks: internalRes.marks,
      status: overallStatus !== 'PENDING' ? overallStatus : internalRes.status,
      isPass: overallPass !== null ? overallPass : internalRes.isPass,
      targetMax: internalRes.targetMax,
      minPass: internalRes.minPass,
      bestMid: internalRes.bestMid,
      secondMid: internalRes.secondMid,
      formulaDescription: this.formatFormulaDescription({
        ...dto,
        maxInternalMarks: internalRes.targetMax,
        minPassMarks: internalRes.minPass,
      }),
      formulaStep: comboStep || internalRes.formulaStep,

      // Rich Separated Breakdown Sections
      internal: {
        marks: internalRes.marks,
        targetMax: internalRes.targetMax,
        minPass: internalRes.minPass,
        isPass: internalRes.isPass,
        status: internalRes.status,
        formulaStep: internalRes.formulaStep,
        bestMid: internalRes.bestMid,
        secondMid: internalRes.secondMid,
      },
      external: {
        marks: externalMarks,
        targetMax: maxExternal,
        minPass: minExternalPass,
        minPassPercentage: minExternalPct,
        isPass: isExternalPass,
        isAbsent: isExtAbsent,
        status: externalStatus,
        formulaStep: externalStep,
      },
      combo: {
        totalMarks,
        targetMax: maxTotal,
        minPass: minTotalPass,
        minPassPercentage: minTotalPct,
        isTotalPass,
        overallPass,
        overallStatus,
        passStrategy,
        grade,
        gradePoints,
        formulaStep: comboStep,
      },
    };
  }
}

module.exports = {
  RegulationInternalSettingsService,
  DEFAULT_GLOBAL_CONFIG,
};
