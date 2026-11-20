'use strict';

const { IsNull } = require('typeorm');
const { AppError } = require('../common/errors');
const {
  CalculationMethod,
  RoundingRule,
  PassStrategy,
  DEFAULT_GRADING_SCALE,
} = require('./regulation-internal-settings.entity');

const DEFAULT_GLOBAL_CONFIG = {
  regulationId: null,
  regulationCode: 'GLOBAL_DEFAULT',
  regulationName: 'Global Default (All Regulations)',
  courseId: null,
  courseName: null,
  yearOfStudy: null,
  numInternals: 2,
  minPassPercentage: 40.0,
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
  gradingScale: DEFAULT_GRADING_SCALE,
  status: 'ACTIVE',
  remarks: 'Standard 30 Internal + 70 External = 100 Total (Pass: Ext ≥ 25, Total ≥ 40)',
};

function sanitizeGradingScale(scale) {
  if (!Array.isArray(scale) || scale.length === 0) {
    return DEFAULT_GRADING_SCALE;
  }
  return scale.map((g) => {
    const rawMin = Number(g.minPercentage ?? 0);
    const rawMax = Number(g.maxPercentage ?? 100);
    const cleanMin = Math.round(rawMin);
    const cleanMax = rawMax >= 100 ? 100 : Math.floor(rawMax);
    return {
      minPercentage: cleanMin,
      maxPercentage: cleanMax,
      grade: String(g.grade ?? '').trim(),
      gradeDescription: String(g.gradeDescription ?? '').trim(),
      gradePoints: Math.round(Number(g.gradePoints ?? 0)),
      isPass: g.isPass !== false,
    };
  });
}

/**
 * Fallback heuristic to estimate total years of study for an academic course
 */
function estimateCourseTotalYears(courseName) {
  if (!courseName) return 4;
  const name = String(courseName).toLowerCase();
  if (name.includes('pharm.d') || name.includes('pharm d')) return 6;
  if (name.includes('b.tech') || name.includes('btech') || name.includes('b.e') || name.includes('pharmacy') || name.includes('b.pharm')) return 4;
  if (name.includes('m.tech') || name.includes('mtech') || name.includes('mba') || name.includes('mca') || name.includes('m.pharm') || name.includes('m.sc')) return 2;
  if (name.includes('diploma') || name.includes('polytechnic') || name.includes('b.sc') || name.includes('b.com') || name.includes('bba') || name.includes('bca')) return 3;
  return 4;
}

class RegulationInternalSettingsService {
  constructor(regInternalSettingRepo, regulationRepo = null, auditRepo = null, regulationScopeRepo = null, sdms = null) {
    this.repo = regInternalSettingRepo;
    this.regulationRepo = regulationRepo;
    this.auditRepo = auditRepo;
    this.scopeRepo = regulationScopeRepo;
    this.sdms = sdms;
  }

  /**
   * Helper descriptions for Internal, External, and Combined assessment rules
   */
  formatInternalDescription(cfg) {
    const max = Number(cfg.maxInternalMarks ?? 30);
    const min = Number(cfg.minPassMarks ?? 16);
    const numInts = Number(cfg.numInternals ?? 2);
    const pct = Number(cfg.minPassPercentage ?? (max > 0 ? (min / max) * 100 : 40));
    switch (cfg.calculationMethod) {
      case CalculationMethod.AVERAGE_ALL_MIDS:
        return `Average of ${numInts} Internal Mids (Target: ${max}, Min Pass: ${min} [${pct.toFixed(0)}%])`;
      case CalculationMethod.BEST_SINGLE_MID:
        return `Best Single Mid (100% of ${numInts} Mids) (Target: ${max}, Min Pass: ${min} [${pct.toFixed(0)}%])`;
      case CalculationMethod.WEIGHTED_TWO_MIDS:
      default: {
        const w1 = Number(cfg.bestMidWeightage ?? 80);
        const w2 = Number(cfg.otherMidWeightage ?? 20);
        return `${w1}% Best Mid + ${w2}% Second Mid (${numInts} Mids) (Target: ${max}, Min Pass: ${min} [${pct.toFixed(0)}%])`;
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
  normalizeRecord(row, isCustomized = true, isInherited = false, inheritedFrom = 'REGULATION') {
    const maxInt = Number(row.maxInternalMarks ?? 30);
    const maxExt = Number(row.maxExternalMarks ?? 70);
    const maxTot = Number(row.maxTotalMarks ?? (maxInt + maxExt));
    const minPassMarks = Number(row.minPassMarks ?? 16);
    const minPassPercentage = Number(
      row.minPassPercentage ?? (maxInt > 0 ? Number(((minPassMarks / maxInt) * 100).toFixed(2)) : 40.0)
    );

    return {
      id: row.id || null,
      regulationId: row.regulationId || null,
      regulationCode: row.regulationCode || 'GLOBAL_DEFAULT',
      regulationName: row.regulationName || null,
      courseId: row.courseId ? Number(row.courseId) : null,
      courseName: row.courseName || null,
      yearOfStudy: row.yearOfStudy ? Number(row.yearOfStudy) : null,
      numInternals: Number(row.numInternals ?? (row.minMidsRequired ?? 2)),
      minPassPercentage,

      // Internal Setup
      calculationMethod: row.calculationMethod || CalculationMethod.WEIGHTED_TWO_MIDS,
      bestMidWeightage: Number(row.bestMidWeightage ?? 80),
      otherMidWeightage: Number(row.otherMidWeightage ?? 20),
      maxInternalMarks: maxInt,
      minPassMarks,
      minMidsRequired: row.minMidsRequired ?? (row.calculationMethod === CalculationMethod.BEST_SINGLE_MID ? 1 : 2),
      roundingRule: row.roundingRule || RoundingRule.ROUND_2_DECIMALS,
      includeAssignments: Boolean(row.includeAssignments),
      assignmentMarks: Number(row.assignmentMarks ?? 0),
      evaluationComponents: Array.isArray(row.evaluationComponents)
        ? row.evaluationComponents
        : (typeof row.evaluationComponents === 'string'
            ? (() => { try { return JSON.parse(row.evaluationComponents); } catch { return null; } })()
            : null),
      customFormula: row.customFormula || null,

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
      gradingScale: sanitizeGradingScale(row.gradingScale),
      status: row.status || 'ACTIVE',
      remarks: row.remarks || null,
      isCustomized,
      isInherited,
      inheritedFrom,
      internalDescription: this.formatInternalDescription({ ...row, maxInternalMarks: maxInt, minPassMarks, minPassPercentage }),
      externalDescription: this.formatExternalDescription(row),
      comboDescription: this.formatComboDescription(row),
      formulaDescription: this.formatFormulaDescription({ ...row, maxInternalMarks: maxInt, minPassMarks, minPassPercentage }),
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
        return this.normalizeRecord(DEFAULT_GLOBAL_CONFIG, false, true, 'GLOBAL');
      }
    }

    return this.normalizeRecord(globalRow, false, false, 'GLOBAL');
  }

  /**
   * List all regulations along with their dynamic marks calculation schemes,
   * fully populated with regulation-based courses and year-wise breakdown.
   */
  async getAllSettings() {
    const globalDefault = await this.getGlobalDefault();

    let allRegulations = [];
    if (this.regulationRepo) {
      allRegulations = await this.regulationRepo.find({
        order: { code: 'ASC' },
      });
    }

    // Load all custom settings from DB
    const allCustomSettings = await this.repo.find({
      order: { regulationCode: 'ASC', courseId: 'ASC', yearOfStudy: 'ASC', id: 'ASC' },
    });

    // Load all regulation scopes to discover courses under each regulation
    let allScopes = [];
    if (this.scopeRepo) {
      try {
        allScopes = await this.scopeRepo.find({
          order: { courseName: 'ASC', batch: 'DESC' },
        });
      } catch (err) {
        console.warn('Could not load regulation scopes for course discovery:', err.message);
      }
    }

    // Try to load SDMS courses map for totalYears if available
    let sdmsCourseMap = new Map();
    if (this.sdms && typeof this.sdms.listCourses === 'function') {
      try {
        const sdmsCourses = await this.sdms.listCourses(undefined, false);
        for (const c of sdmsCourses || []) {
          sdmsCourseMap.set(c.id, c);
        }
      } catch {
        // SDMS courses optional fallback
      }
    }

    // Group scopes by regulationId -> Map<courseId, { courseId, courseName, batches: Set }
    const scopesByRegId = new Map();
    for (const sc of allScopes) {
      if (!scopesByRegId.has(sc.regulationId)) {
        scopesByRegId.set(sc.regulationId, new Map());
      }
      const courseMap = scopesByRegId.get(sc.regulationId);
      if (!courseMap.has(sc.courseId)) {
        courseMap.set(sc.courseId, {
          courseId: sc.courseId,
          courseName: sc.courseName,
          batches: new Set(),
        });
      }
      if (sc.batch) courseMap.get(sc.courseId).batches.add(sc.batch);
    }

    // Group custom settings by regulationId (support both numeric ID and string code)
    const customSettingsByRegId = new Map();
    for (const s of allCustomSettings) {
      const keys = [];
      if (s.regulationId != null) {
        keys.push(String(s.regulationId));
        keys.push(Number(s.regulationId));
      }
      if (s.regulationCode) {
        keys.push(String(s.regulationCode).toUpperCase().trim());
      }
      for (const k of keys) {
        if (!customSettingsByRegId.has(k)) {
          customSettingsByRegId.set(k, []);
        }
        if (!customSettingsByRegId.get(k).includes(s)) {
          customSettingsByRegId.get(k).push(s);
        }
      }
    }

    const regulationList = allRegulations.map((reg) => {
      const customList =
        customSettingsByRegId.get(reg.id) ||
        customSettingsByRegId.get(String(reg.id)) ||
        customSettingsByRegId.get(reg.code.toUpperCase().trim()) ||
        [];

      // Find regulation-level override (courseId is null, yearOfStudy is null)
      const regLevelCustom = customList.find(
        (s) => (s.courseId == null || s.courseId === 0) && (s.yearOfStudy == null || s.yearOfStudy === 0)
      );

      const regBaseSetting = regLevelCustom
        ? this.normalizeRecord(
            { ...regLevelCustom, regulationId: reg.id, regulationCode: reg.code, regulationName: reg.name },
            true,
            false,
            'REGULATION',
          )
        : this.normalizeRecord(
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
            'GLOBAL',
          );

      // Build regulation-based courses and year-wise breakdown
      const courseMap = scopesByRegId.get(reg.id) || new Map();

      // Discover any courses present in customList that might not be in scopesByRegId
      for (const s of customList) {
        if (s.courseId || s.courseName) {
          const sCourseId = s.courseId != null ? Number(s.courseId) : null;
          const sCourseName = s.courseName ? String(s.courseName).trim() : null;
          let foundKey = null;
          for (const [cId, cInfo] of courseMap.entries()) {
            if (
              (sCourseId != null && Number(cId) === sCourseId) ||
              (sCourseName && cInfo.courseName && cInfo.courseName.trim().toLowerCase() === sCourseName.toLowerCase())
            ) {
              foundKey = cId;
              break;
            }
          }
          if (foundKey == null) {
            const newKey = sCourseId != null ? sCourseId : `c_${sCourseName}`;
            courseMap.set(newKey, {
              courseId: sCourseId,
              courseName: sCourseName || `Course #${sCourseId}`,
              batches: new Set(),
            });
          }
        }
      }

      const courses = [];

      for (const [courseId, courseInfo] of courseMap.entries()) {
        const sdmsInfo = courseId ? sdmsCourseMap.get(courseId) : null;
        const maxConfiguredYear = Math.max(
          0,
          ...customList
            .filter((s) => {
              const matchCourse =
                (s.courseId != null && courseId != null && Number(s.courseId) === Number(courseId)) ||
                (s.courseName && courseInfo.courseName && s.courseName.trim().toLowerCase() === courseInfo.courseName.trim().toLowerCase());
              return matchCourse && s.yearOfStudy != null;
            })
            .map((s) => Number(s.yearOfStudy))
        );
        const estimatedYears = sdmsInfo?.totalYears
          ? Number(sdmsInfo.totalYears)
          : estimateCourseTotalYears(courseInfo.courseName);
        const totalYears = Math.max(estimatedYears, maxConfiguredYear, 1);

        // Find course-level override (course matches, yearOfStudy is null)
        const courseCustom = customList.find((s) => {
          const matchCourse =
            (s.courseId != null && courseId != null && Number(s.courseId) === Number(courseId)) ||
            (s.courseName && courseInfo.courseName && s.courseName.trim().toLowerCase() === courseInfo.courseName.trim().toLowerCase());
          return matchCourse && (s.yearOfStudy == null || Number(s.yearOfStudy) === 0);
        });

        const courseSetting = courseCustom
          ? this.normalizeRecord(
              {
                ...courseCustom,
                regulationId: reg.id,
                regulationCode: reg.code,
                regulationName: reg.name,
                courseId: courseInfo.courseId || courseId,
                courseName: courseInfo.courseName,
              },
              true,
              false,
              'COURSE',
            )
          : this.normalizeRecord(
              {
                ...regBaseSetting,
                id: null,
                courseId: courseInfo.courseId || courseId,
                courseName: courseInfo.courseName,
                yearOfStudy: null,
                remarks: `Inherited from ${reg.code} Regulation Default`,
              },
              false,
              true,
              regBaseSetting.isCustomized ? 'REGULATION' : 'GLOBAL',
            );

        // Build year-wise breakdown (Year 1 .. totalYears)
        // If Year 1 is customized, Year 2..N are returned as inherited remaining years
        const years = [];
        for (let y = 1; y <= totalYears; y++) {
          const yearCustom = customList.find((s) => {
            const matchCourse =
              (s.courseId != null && courseId != null && Number(s.courseId) === Number(courseId)) ||
              (s.courseName && courseInfo.courseName && s.courseName.trim().toLowerCase() === courseInfo.courseName.trim().toLowerCase());
            return matchCourse && Number(s.yearOfStudy) === y;
          });

          if (yearCustom) {
            years.push({
              yearOfStudy: y,
              isCustomized: true,
              inheritedFrom: 'YEAR',
              setting: this.normalizeRecord(
                {
                  ...yearCustom,
                  regulationId: reg.id,
                  regulationCode: reg.code,
                  regulationName: reg.name,
                  courseId: courseInfo.courseId || courseId,
                  courseName: courseInfo.courseName,
                  yearOfStudy: y,
                },
                true,
                false,
                'YEAR',
              ),
            });
          } else if (courseCustom) {
            years.push({
              yearOfStudy: y,
              isCustomized: false,
              inheritedFrom: 'COURSE',
              setting: this.normalizeRecord(
                {
                  ...courseSetting,
                  id: null,
                  courseId: courseInfo.courseId || courseId,
                  courseName: courseInfo.courseName,
                  yearOfStudy: y,
                  remarks: `Inherited from ${courseInfo.courseName} Course Scheme`,
                },
                false,
                true,
                'COURSE',
              ),
            });
          } else {
            years.push({
              yearOfStudy: y,
              isCustomized: false,
              inheritedFrom: regBaseSetting.isCustomized ? 'REGULATION' : 'GLOBAL',
              setting: this.normalizeRecord(
                {
                  ...regBaseSetting,
                  id: null,
                  courseId: courseInfo.courseId || courseId,
                  courseName: courseInfo.courseName,
                  yearOfStudy: y,
                  remarks: `Inherited from ${reg.code} Regulation Baseline`,
                },
                false,
                true,
                regBaseSetting.isCustomized ? 'REGULATION' : 'GLOBAL',
              ),
            });
          }
        }

        courses.push({
          courseId,
          courseName: courseInfo.courseName,
          totalYears,
          batches: Array.from(courseInfo.batches),
          isCustomized: Boolean(courseCustom),
          courseSetting,
          years,
        });
      }

      return {
        ...regBaseSetting,
        courses,
      };
    });

    return {
      globalDefault,
      regulations: regulationList,
    };
  }

  /**
   * Get calculation settings hierarchically:
   * 1. Exact Year Override: (regulation, course, year)
   * 2. Course-Level Override: (regulation, course, year = null)
   * 3. Regulation-Level Override: (regulation, course = null, year = null)
   * 4. Global Default Fallback
   */
  async getSettingForRegulation(regulationIdOrCode, courseIdOrName = null, yearOfStudy = null) {
    const globalDefault = await this.getGlobalDefault();

    if (!regulationIdOrCode || regulationIdOrCode === 'GLOBAL_DEFAULT') {
      return globalDefault;
    }

    let regInfo = null;
    const numericId = parseInt(regulationIdOrCode, 10);
    if (this.regulationRepo) {
      if (!isNaN(numericId) && numericId > 0) {
        regInfo = await this.regulationRepo.findOne({ where: { id: numericId } });
      } else {
        const codeStr = String(regulationIdOrCode).trim().toUpperCase();
        regInfo = await this.regulationRepo.findOne({ where: { code: codeStr } });
      }
    }

    const regId = regInfo ? regInfo.id : (!isNaN(numericId) && numericId > 0 ? numericId : null);
    const regCode = regInfo ? regInfo.code : String(regulationIdOrCode).trim().toUpperCase();
    const regName = regInfo ? regInfo.name : null;

    const numericYear = yearOfStudy ? parseInt(yearOfStudy, 10) : null;
    const numericCourseId = courseIdOrName && !isNaN(parseInt(courseIdOrName, 10)) ? parseInt(courseIdOrName, 10) : null;
    const courseNameStr = courseIdOrName && isNaN(parseInt(courseIdOrName, 10)) ? String(courseIdOrName).trim() : null;

    // 1. Try finding Year-specific override: (regulation, course, year)
    if (numericYear && (numericCourseId || courseNameStr)) {
      const qb = this.repo.createQueryBuilder('s')
        .where('(s.regulationId = :regId OR UPPER(s.regulationCode) = :regCode)', { regId, regCode })
        .andWhere('s.yearOfStudy = :year', { year: numericYear });
      if (numericCourseId) {
        qb.andWhere('(s.courseId = :cId OR LOWER(s.courseName) = LOWER(:cName))', {
          cId: numericCourseId,
          cName: courseNameStr || '',
        });
      } else {
        qb.andWhere('LOWER(s.courseName) = LOWER(:cName)', { cName: courseNameStr });
      }
      const match = await qb.getOne();
      if (match) {
        return this.normalizeRecord(
          { ...match, regulationId: regId, regulationCode: regCode, regulationName: regName },
          true,
          false,
          'YEAR',
        );
      }
    }

    // 2. Try finding Course-level override: (regulation, course, year IS NULL)
    if (numericCourseId || courseNameStr) {
      const qb = this.repo.createQueryBuilder('s')
        .where('(s.regulationId = :regId OR UPPER(s.regulationCode) = :regCode)', { regId, regCode })
        .andWhere('(s.yearOfStudy IS NULL OR s.yearOfStudy = 0)');
      if (numericCourseId) {
        qb.andWhere('(s.courseId = :cId OR LOWER(s.courseName) = LOWER(:cName))', {
          cId: numericCourseId,
          cName: courseNameStr || '',
        });
      } else {
        qb.andWhere('LOWER(s.courseName) = LOWER(:cName)', { cName: courseNameStr });
      }
      const match = await qb.getOne();
      if (match) {
        return this.normalizeRecord(
          { ...match, regulationId: regId, regulationCode: regCode, regulationName: regName },
          true,
          false,
          'COURSE',
        );
      }
    }

    // 3. Try finding Regulation-level override: (regulation, courseId IS NULL, year IS NULL)
    const regMatch = await this.repo.createQueryBuilder('s')
      .where('(s.regulationId = :regId OR UPPER(s.regulationCode) = :regCode)', { regId, regCode })
      .andWhere('(s.courseId IS NULL OR s.courseId = 0)')
      .andWhere('(s.yearOfStudy IS NULL OR s.yearOfStudy = 0)')
      .getOne();

    if (regMatch && regMatch.regulationCode !== 'GLOBAL_DEFAULT') {
      return this.normalizeRecord(
        { ...regMatch, regulationId: regId, regulationCode: regCode, regulationName: regName },
        true,
        false,
        'REGULATION',
      );
    }

    // 4. Global baseline fallback
    return this.normalizeRecord(
      {
        ...globalDefault,
        id: null,
        regulationId: regId,
        regulationCode: regCode,
        regulationName: regName,
        courseId: numericCourseId,
        courseName: courseNameStr,
        yearOfStudy: numericYear,
      },
      false,
      true,
      'GLOBAL',
    );
  }

  /**
   * Snapshot state for audit trail
   */
  extractStateSnapshot(entity) {
    if (!entity) return null;
    return {
      courseId: entity.courseId ? Number(entity.courseId) : null,
      courseName: entity.courseName || null,
      yearOfStudy: entity.yearOfStudy ? Number(entity.yearOfStudy) : null,
      numInternals: Number(entity.numInternals ?? 2),
      minPassPercentage: Number(entity.minPassPercentage ?? 40.0),
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
      gradingScale: sanitizeGradingScale(entity.gradingScale),
      remarks: entity.remarks || null,
    };
  }

  formatFieldLabel(key) {
    const map = {
      courseName: 'Target Course',
      yearOfStudy: 'Target Year of Study',
      numInternals: 'Number of Internal Mids',
      minPassPercentage: 'Internal Pass Target %',
      maxInternalMarks: 'Max Internal Marks (CIE)',
      maxExternalMarks: 'Max External Marks (SEE)',
      maxTotalMarks: 'Course Maximum Total Marks',
      minPassMarks: 'Internal Pass Cutoff Marks',
      minExternalPassMarks: 'External Min Pass Marks',
      minExternalPassPercentage: 'External Pass % Cutoff',
      minTotalPassMarks: 'Min Total Pass Marks',
      minTotalPassPercentage: 'Total Aggregate Pass %',
      calculationMethod: 'Internal Calculation Method',
      bestMidWeightage: 'Best Mid Weightage (%)',
      otherMidWeightage: 'Second-Best Mid Weightage (%)',
      passStrategy: 'Evaluation Pass Strategy',
      gradingScale: 'Grading Structure & Grade Points Scale',
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
      'courseName',
      'yearOfStudy',
      'numInternals',
      'minPassPercentage',
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
      const actorEmail = actor ? actor.email || actor.username || null : null;
      const actorName = actor ? actor.name || actor.displayName || actorEmail : null;
      const actorRole = actor ? actor.role || actor.roles?.[0] || 'ADMIN' : 'SYSTEM';

      const log = this.auditRepo.create({
        regulationId: regulationId || null,
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
   * Save or update marks calculation settings dynamically:
   * Supports: Regulation-level, Course-level, and Year-level configuration.
   */
  async saveSetting(dto, actor = null) {
    const isGlobal =
      dto.regulationId == null ||
      dto.regulationCode === 'GLOBAL_DEFAULT' ||
      dto.regulationId === 0 ||
      dto.regulationId === '0';

    const courseId = dto.courseId ? Number(dto.courseId) : null;
    const courseName = dto.courseName ? String(dto.courseName).trim() : null;
    const yearOfStudy = dto.yearOfStudy ? Number(dto.yearOfStudy) : null;
    const numInternals = Math.max(1, Number(dto.numInternals ?? 2));

    // Internal validations
    const maxInternalMarks = Number(dto.maxInternalMarks ?? 30);
    if (isNaN(maxInternalMarks) || maxInternalMarks <= 0) {
      throw AppError.badRequest('Maximum internal marks must be greater than 0');
    }

    const minPassMarks = Number(dto.minPassMarks ?? 16);
    if (isNaN(minPassMarks) || minPassMarks < 0 || minPassMarks > maxInternalMarks) {
      throw AppError.badRequest('Minimum internal pass marks must be between 0 and maximum internal marks');
    }

    const minPassPercentage = Number(
      dto.minPassPercentage ?? ((minPassMarks / maxInternalMarks) * 100)
    );

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

    const minExternalPassPercentage = Number(
      dto.minExternalPassPercentage ?? ((minExternalPassMarks / maxExternalMarks) * 100)
    );

    // Combo validations & Mathematical Consistency check
    const computedTotal = Number((maxInternalMarks + maxExternalMarks).toFixed(2));
    let maxTotalMarks = Number(dto.maxTotalMarks ?? computedTotal);
    if (isNaN(maxTotalMarks) || maxTotalMarks <= 0 || Math.abs(maxTotalMarks - computedTotal) > 0.01) {
      maxTotalMarks = computedTotal;
    }

    const minTotalPassMarks = Number(dto.minTotalPassMarks ?? 40);
    if (isNaN(minTotalPassMarks) || minTotalPassMarks < 0 || minTotalPassMarks > maxTotalMarks) {
      throw AppError.badRequest(`Minimum total pass marks must be between 0 and maximum total marks (${maxTotalMarks})`);
    }

    const minTotalPassPercentage = Number(
      dto.minTotalPassPercentage ?? ((minTotalPassMarks / maxTotalMarks) * 100)
    );

    const rounding = dto.roundingRule || RoundingRule.ROUND_2_DECIMALS;
    if (!Object.values(RoundingRule).includes(rounding)) {
      throw AppError.badRequest(`Invalid rounding rule: ${rounding}`);
    }

    const strategy = dto.passStrategy || 'EXTERNAL_AND_TOTAL';

    let targetEntity = null;

    if (dto.id) {
      targetEntity = await this.repo.findOne({ where: { id: dto.id } });
    }

    if (!targetEntity) {
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

        const whereObj = {
          regulationId: regId,
          courseId: courseId ? courseId : IsNull(),
          yearOfStudy: yearOfStudy ? yearOfStudy : IsNull(),
        };

        targetEntity = await this.repo.findOne({ where: whereObj });

        if (!targetEntity) {
          targetEntity = this.repo.create({
            regulationId: regId,
            regulationCode: regRecord ? regRecord.code : (dto.regulationCode || null),
            regulationName: regRecord ? regRecord.name : (dto.regulationName || null),
            courseId,
            courseName,
            yearOfStudy,
          });
        } else {
          if (regRecord) {
            targetEntity.regulationCode = regRecord.code;
            targetEntity.regulationName = regRecord.name;
          }
          if (courseName) targetEntity.courseName = courseName;
        }
      }
    }

    // Snapshot prior state for audit tracking
    const isNew = !targetEntity.id;
    const fromState = this.extractStateSnapshot(isNew ? null : targetEntity);

    // Assign scope fields
    targetEntity.courseId = courseId;
    targetEntity.courseName = courseName;
    targetEntity.yearOfStudy = yearOfStudy;
    targetEntity.numInternals = numInternals;
    targetEntity.minPassPercentage = minPassPercentage;

    // Assign Internal
    targetEntity.calculationMethod = method;
    targetEntity.bestMidWeightage = bestWeight;
    targetEntity.otherMidWeightage = otherWeight;
    targetEntity.maxInternalMarks = maxInternalMarks;
    targetEntity.minPassMarks = minPassMarks;
    targetEntity.minMidsRequired = Number(dto.minMidsRequired ?? (method === CalculationMethod.BEST_SINGLE_MID ? 1 : Math.min(2, numInternals)));
    targetEntity.roundingRule = rounding;
    targetEntity.includeAssignments = Boolean(dto.includeAssignments);
    targetEntity.assignmentMarks = Number(dto.assignmentMarks ?? 0);
    if (dto.evaluationComponents !== undefined) {
      targetEntity.evaluationComponents = Array.isArray(dto.evaluationComponents)
        ? dto.evaluationComponents
        : (dto.evaluationComponents === null ? null : targetEntity.evaluationComponents);
    }
    if (dto.customFormula !== undefined) {
      targetEntity.customFormula = dto.customFormula || null;
    }

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

    if (Array.isArray(dto.gradingScale) && dto.gradingScale.length > 0) {
      targetEntity.gradingScale = sanitizeGradingScale(dto.gradingScale);
    } else if (dto.gradingScale === null) {
      targetEntity.gradingScale = null;
    }

    targetEntity.status = dto.status || 'ACTIVE';
    targetEntity.remarks = dto.remarks || null;

    const saved = await this.repo.save(targetEntity);

    // Record audit history entry
    const toState = this.extractStateSnapshot(saved);
    const changes = this.computeStateDiff(fromState, toState);
    const scopeLabel = yearOfStudy
      ? `${saved.regulationCode} / ${courseName || 'Course'} / Year ${yearOfStudy}`
      : courseId
      ? `${saved.regulationCode} / ${courseName || 'Course'} (All Years)`
      : `${saved.regulationCode} (Regulation Baseline)`;

    await this.recordAuditLog({
      regulationId: saved.regulationId,
      regulationCode: saved.regulationCode,
      regulationName: saved.regulationName,
      action: isNew ? 'CREATED' : 'UPDATED',
      actor,
      fromState,
      toState,
      changes,
      remarks: saved.remarks || `Configured marks scheme for ${scopeLabel}`,
    });

    return this.normalizeRecord(saved, !isGlobal, false, yearOfStudy ? 'YEAR' : courseId ? 'COURSE' : 'REGULATION');
  }

  /**
   * Reset a regulation/course/year custom setting back to inherited default
   */
  async resetSetting(id, actor = null) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) {
      throw AppError.notFound('Setting record not found');
    }
    if (existing.regulationCode === 'GLOBAL_DEFAULT' && existing.regulationId == null && existing.courseId == null) {
      throw AppError.badRequest('Cannot delete the global default calculation configuration');
    }

    const fromState = this.extractStateSnapshot(existing);
    const globalDefault = await this.getGlobalDefault();
    const toState = this.extractStateSnapshot(globalDefault);
    const changes = this.computeStateDiff(fromState, toState);

    await this.repo.delete(id);

    const scopeLabel = existing.yearOfStudy
      ? `${existing.regulationCode} / ${existing.courseName || 'Course'} / Year ${existing.yearOfStudy}`
      : existing.courseId
      ? `${existing.regulationCode} / ${existing.courseName || 'Course'} (All Years)`
      : `${existing.regulationCode} (Regulation Baseline)`;

    await this.recordAuditLog({
      regulationId: existing.regulationId,
      regulationCode: existing.regulationCode,
      regulationName: existing.regulationName,
      action: 'RESET_TO_DEFAULT',
      actor,
      fromState,
      toState,
      changes,
      remarks: `Reset custom setup for ${scopeLabel} to inherit baseline`,
    });

    return { success: true, message: `Marks setup for ${scopeLabel} reset to baseline` };
  }

  /**
   * Core Internal Calculation Engine (Supports Dynamic Assessment Components & Custom Formulas)
   */
  calculateInternalMarks(midEntries, config = {}) {
    const targetMax = Number(config.maxInternalMarks ?? 30);
    const minPass = Number(config.minPassMarks ?? 16);
    const method = config.calculationMethod || CalculationMethod.WEIGHTED_TWO_MIDS;
    const bestWeight = Number(config.bestMidWeightage ?? 80);
    const otherWeight = Number(config.otherMidWeightage ?? 20);
    const numInts = Number(config.numInternals ?? 2);
    const minMidsRequired = Number(config.minMidsRequired ?? (method === CalculationMethod.BEST_SINGLE_MID ? 1 : Math.min(2, numInts)));
    const rounding = config.roundingRule || RoundingRule.ROUND_2_DECIMALS;

    // Check if dynamic evaluation components are configured
    const components = Array.isArray(config.evaluationComponents) && config.evaluationComponents.length > 0
      ? config.evaluationComponents
      : null;

    if (components) {
      return this.calculateComponentBasedInternals(midEntries, components, config);
    }

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
        numInternals: numInts,
        minPassPercentage: config.minPassPercentage,
      }),
      formulaStep,
      rawScores: validScores.map((s) => Number(s.toFixed(2))),
    };
  }

  /**
   * Evaluates Dynamic Assessment Components (e.g. 3 Mids + 2 Assignments + Quizzes)
   */
  calculateComponentBasedInternals(inputData, components, config) {
    const targetMax = Number(config.maxInternalMarks ?? 40);
    const minPass = Number(config.minPassMarks ?? 16);
    const rounding = config.roundingRule || RoundingRule.ROUND_2_DECIMALS;

    // inputData can be an object mapping componentId or lowercase code to entries,
    // or a flat array of mid numbers in legacy requests
    let componentInputMap = {};
    if (inputData && typeof inputData === 'object' && !Array.isArray(inputData)) {
      componentInputMap = inputData;
    } else if (Array.isArray(inputData)) {
      if (components.length > 0) {
        componentInputMap[components[0].id || components[0].code?.toLowerCase()] = inputData;
      }
    }

    const componentBreakdown = [];
    let totalUnroundedMarks = 0;
    const formulaSteps = [];

    for (const comp of components) {
      const compId = comp.id || comp.code;
      const compKey = comp.code ? comp.code.toLowerCase() : compId;
      const entries =
        componentInputMap[compId] ||
        componentInputMap[compKey] ||
        componentInputMap[comp.name?.toLowerCase()] ||
        [];

      const maxPerInstance = Number(comp.maxMarksPerInstance ?? comp.scaledMaxMarks ?? 30);
      const scaledMax = Number(comp.scaledMaxMarks ?? maxPerInstance);
      const rule = comp.aggregationRule || 'AVERAGE_ALL';
      const bestCount = Number(comp.bestCount ?? 2);
      const bestWeight = Number(comp.bestWeightage ?? 80);
      const otherWeight = Number(comp.otherWeightage ?? 20);

      const validScores = [];
      for (const item of Array.isArray(entries) ? entries : []) {
        if (item === null || item === undefined) continue;
        if (typeof item === 'number' && !isNaN(item) && item >= 0) {
          validScores.push(Math.min(item, maxPerInstance));
        } else if (typeof item === 'object') {
          if (item.isAbsent) {
            validScores.push(0);
          } else if (item.marks !== null && item.marks !== undefined && !isNaN(Number(item.marks))) {
            validScores.push(Math.min(Number(item.marks), maxPerInstance));
          }
        }
      }

      let compScore = 0;
      let rawAverage = 0;
      let compStep = '';

      if (validScores.length === 0) {
        compScore = 0;
        rawAverage = 0;
        compStep = `${comp.name}: No scores entered (0.0 / ${scaledMax})`;
      } else if (rule === 'BEST_N') {
        const sorted = [...validScores].sort((a, b) => b - a);
        const topScores = sorted.slice(0, Math.min(bestCount, sorted.length));
        const sumTop = topScores.reduce((acc, v) => acc + v, 0);
        rawAverage = topScores.length > 0 ? sumTop / topScores.length : 0;
        compScore = maxPerInstance > 0 ? (rawAverage / maxPerInstance) * scaledMax : rawAverage;
        compStep = `${comp.name} [Best ${topScores.length} of ${validScores.length}]: (${topScores.join(' + ')})/${topScores.length} = ${rawAverage.toFixed(1)}/${maxPerInstance} (Scaled: ${compScore.toFixed(1)} / ${scaledMax})`;
      } else if (rule === 'WEIGHTED') {
        const sorted = [...validScores].sort((a, b) => b - a);
        const best = sorted[0] || 0;
        const second = sorted[1] || 0;
        const weighted = best * (bestWeight / 100) + second * (otherWeight / 100);
        rawAverage = weighted;
        compScore = maxPerInstance > 0 ? (weighted / maxPerInstance) * scaledMax : weighted;
        compStep = `${comp.name} [Weighted]: (${best.toFixed(1)} × ${bestWeight}%) + (${second.toFixed(1)} × ${otherWeight}%) = ${weighted.toFixed(1)}/${maxPerInstance} (Scaled: ${compScore.toFixed(1)} / ${scaledMax})`;
      } else if (rule === 'SUM_ALL') {
        const sum = validScores.reduce((acc, v) => acc + v, 0);
        rawAverage = sum;
        compScore = Math.min(sum, scaledMax);
        compStep = `${comp.name} [Sum]: (${validScores.join(' + ')}) = ${compScore.toFixed(1)} / ${scaledMax}`;
      } else {
        // AVERAGE_ALL (default)
        const sum = validScores.reduce((acc, v) => acc + v, 0);
        rawAverage = validScores.length > 0 ? sum / validScores.length : 0;
        compScore = maxPerInstance > 0 ? (rawAverage / maxPerInstance) * scaledMax : rawAverage;
        compStep = `${comp.name} [Average of ${validScores.length}]: (${validScores.map((v) => v.toFixed(1)).join(' + ')})/${validScores.length} = ${rawAverage.toFixed(1)}/${maxPerInstance} (Scaled: ${compScore.toFixed(1)} / ${scaledMax})`;
      }

      totalUnroundedMarks += compScore;
      formulaSteps.push(compStep);

      componentBreakdown.push({
        componentId: compId,
        name: comp.name,
        code: comp.code || compId,
        score: Number(compScore.toFixed(2)),
        scaledMax,
        rawAverage: Number(rawAverage.toFixed(2)),
        rule,
        formulaStep: compStep,
        validScores,
      });
    }

    let finalMarks = totalUnroundedMarks;
    switch (rounding) {
      case RoundingRule.ROUND_NEAREST_INT:
        finalMarks = Math.round(totalUnroundedMarks);
        break;
      case RoundingRule.CEIL:
        finalMarks = Math.ceil(totalUnroundedMarks);
        break;
      case RoundingRule.FLOOR:
        finalMarks = Math.floor(totalUnroundedMarks);
        break;
      case RoundingRule.ROUND_2_DECIMALS:
      default:
        finalMarks = Number(totalUnroundedMarks.toFixed(2));
        break;
    }

    const isPass = finalMarks >= minPass;

    return {
      marks: finalMarks,
      status: isPass ? 'PASS' : 'FAIL',
      isPass,
      targetMax,
      minPass,
      componentBreakdown,
      formulaDescription: `Custom Components: ${components.map((c) => `${c.name} [${c.scaledMaxMarks}]`).join(' + ')} = ${targetMax} Total Internal`,
      formulaStep:
        formulaSteps.join(' | ') +
        ` => Total Internal: ${finalMarks} / ${targetMax} (${isPass ? 'PASSED' : 'FAILED'})`,
    };
  }

  /**
   * Evaluate Grade & Grade Points according to dynamic regulation grading scale
   */
  evaluateGradeAndPoints(percentage, isPass, isAbsent, scale = DEFAULT_GRADING_SCALE) {
    const activeScale = Array.isArray(scale) && scale.length > 0 ? scale : DEFAULT_GRADING_SCALE;

    if (isAbsent) {
      const abRule = activeScale.find((s) => String(s.grade).toUpperCase() === 'AB') || {
        grade: 'Ab',
        gradeDescription: 'Absent',
        gradePoints: 0,
      };
      return {
        grade: abRule.grade,
        gradeDescription: abRule.gradeDescription || 'Absent',
        gradePoints: Number(abRule.gradePoints ?? 0),
      };
    }

    if (!isPass) {
      const failRule = activeScale.find((s) => !s.isPass && String(s.grade).toUpperCase() !== 'AB') || {
        grade: 'F',
        gradeDescription: 'Fail',
        gradePoints: 0,
      };
      return {
        grade: failRule.grade,
        gradeDescription: failRule.gradeDescription || 'Fail',
        gradePoints: Number(failRule.gradePoints ?? 0),
      };
    }

    const passingRules = [...activeScale]
      .filter((s) => s.isPass && String(s.grade).toUpperCase() !== 'AB')
      .sort((a, b) => Number(b.minPercentage) - Number(a.minPercentage));

    for (const rule of passingRules) {
      if (percentage >= Number(rule.minPercentage)) {
        return {
          grade: rule.grade,
          gradeDescription: rule.gradeDescription || 'Pass',
          gradePoints: Number(rule.gradePoints ?? 0),
        };
      }
    }

    const lowestPass = passingRules[passingRules.length - 1];
    if (lowestPass) {
      return {
        grade: lowestPass.grade,
        gradeDescription: lowestPass.gradeDescription || 'Pass',
        gradePoints: Number(lowestPass.gradePoints ?? 0),
      };
    }

    return { grade: 'E', gradeDescription: 'Pass', gradePoints: 5 };
  }

  /**
   * Comprehensive Assessment Simulation (Internal, External, and Combined Total)
   */
  simulate(dto) {
    const entries = dto.componentEntries || (Array.isArray(dto.midEntries) ? dto.midEntries : []);
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
    let gradeDescription = null;
    let gradePoints = null;

    if (internalRes.marks !== null && externalMarks !== null) {
      totalMarks = Number((internalRes.marks + externalMarks).toFixed(2));
      isTotalPass = totalMarks >= minTotalPass;

      if (isExtAbsent) {
        overallPass = false;
        overallStatus = 'ABSENT';
      } else {
        if (passStrategy === 'ALL_THREE') {
          overallPass = internalRes.isPass && isExternalPass && isTotalPass;
        } else if (passStrategy === 'TOTAL_ONLY') {
          overallPass = isTotalPass;
        } else if (passStrategy === 'EXTERNAL_ONLY') {
          overallPass = isExternalPass;
        } else {
          overallPass = isExternalPass && isTotalPass && (!requireInternalPass || internalRes.isPass);
        }

        overallStatus = overallPass ? 'PASS' : 'FAIL';
      }

      const percentage = maxTotal > 0 ? (totalMarks / maxTotal) * 100 : 0;
      const scale = sanitizeGradingScale(dto.gradingScale);
      const evaluated = this.evaluateGradeAndPoints(percentage, overallPass, isExtAbsent, scale);
      grade = evaluated.grade;
      gradeDescription = evaluated.gradeDescription;
      gradePoints = evaluated.gradePoints;

      comboStep = `Total Marks: ${internalRes.marks} (Internal) + ${externalMarks} (External) = ${totalMarks} / ${maxTotal} (${percentage.toFixed(1)}%). Rule [${passStrategy}]: ${overallStatus} (Awarded: ${grade})`;
    } else if (internalRes.marks !== null) {
      comboStep = `Internal Marks calculated: ${internalRes.marks} / ${internalRes.targetMax}. External score pending.`;
    }

    return {
      marks: totalMarks,
      status: overallStatus,
      isPass: overallPass,
      targetMax: maxTotal,
      minPass: minTotalPass,
      bestMid: internalRes.bestMid,
      secondMid: internalRes.secondMid,
      method: internalRes.method,
      formulaDescription: this.formatFormulaDescription({
        ...dto,
        maxInternalMarks: internalRes.targetMax,
        minPassMarks: internalRes.minPass,
        maxExternalMarks: maxExternal,
        minExternalPassMarks: minExternalPass,
        maxTotalMarks: maxTotal,
        minTotalPassMarks: minTotalPass,
      }),
      formulaStep: comboStep || internalRes.formulaStep || externalStep,
      rawScores: internalRes.rawScores,
      componentBreakdown: internalRes.componentBreakdown || null,

      internal: {
        marks: internalRes.marks,
        targetMax: internalRes.targetMax,
        minPass: internalRes.minPass,
        minPassPercentage: Number(dto.minPassPercentage ?? (internalRes.targetMax > 0 ? (internalRes.minPass / internalRes.targetMax) * 100 : 40)),
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
        gradeDescription,
        gradePoints,
        percentage: totalMarks !== null && maxTotal > 0 ? Number(((totalMarks / maxTotal) * 100).toFixed(1)) : null,
        formulaStep: comboStep,
      },
    };
  }
}

module.exports = {
  RegulationInternalSettingsService,
  DEFAULT_GLOBAL_CONFIG,
};
