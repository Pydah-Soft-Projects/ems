'use strict';
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import type {
  CalculationMethod,
  RoundingRule,
  PassStrategy,
  GradePointRule,
  RegulationInternalSetting,
  RegulationCourseSetting,
  RegulationInternalSettingsOverview,
  RegulationMarksAuditRecord,
  AssessmentComponent,
} from '@/types/regulation-internals';
import {
  DEFAULT_GRADING_SCALE,
  UGC_GRADING_SCALE,
} from '@/types/regulation-internals';

const CALCULATION_METHODS: { value: CalculationMethod; label: string; description: string }[] = [
  {
    value: 'WEIGHTED_TWO_MIDS',
    label: 'Weighted: Best Mid + Second-Best Mid',
    description: 'Calculates internal marks strictly from the best and second-best mid exams (e.g. 80% / 20%).',
  },
  {
    value: 'AVERAGE_ALL_MIDS',
    label: 'Average of All Conducted Mid Exams',
    description: 'Calculates the simple arithmetic average of all conducted mid examinations.',
  },
  {
    value: 'BEST_SINGLE_MID',
    label: 'Best Single Mid Only (100%)',
    description: 'Takes 100% of the single best score among conducted mid examinations.',
  },
];

const ROUNDING_RULES: { value: RoundingRule; label: string; example: string }[] = [
  { value: 'ROUND_2_DECIMALS', label: 'Round to 2 Decimal Places (Standard)', example: '21.65 → 21.65' },
  { value: 'ROUND_NEAREST_INT', label: 'Round to Nearest Integer', example: '21.5 → 22, 21.4 → 21' },
  { value: 'CEIL', label: 'Round Up (Ceil)', example: '21.1 → 22' },
  { value: 'FLOOR', label: 'Round Down (Floor)', example: '21.9 → 21' },
];

const PASS_STRATEGIES: { value: PassStrategy; label: string; description: string }[] = [
  {
    value: 'EXTERNAL_AND_TOTAL',
    label: 'Standard University Rule: External Pass AND Total Aggregate Pass',
    description: 'Candidate must secure minimum external marks AND minimum total marks to pass (Standard JNTU/Autonomous).',
  },
  {
    value: 'ALL_THREE',
    label: 'Strict Three-Way Pass: Internal Pass AND External Pass AND Total Pass',
    description: 'Candidate must independently clear internal cutoff, external cutoff, and total aggregate cutoff.',
  },
  {
    value: 'TOTAL_ONLY',
    label: 'Aggregate Only: Total Marks Pass',
    description: 'Candidate passes if total marks (Internal + External) reach minimum total pass cutoff.',
  },
];

export const DEFAULT_ASSESSMENT_COMPONENTS: AssessmentComponent[] = [
  {
    id: 'comp-mids',
    name: 'Mid Examinations',
    code: 'MIDS',
    count: 2,
    maxMarksPerInstance: 30,
    aggregationRule: 'AVERAGE_ALL',
    bestCount: 2,
    bestWeightage: 80,
    otherWeightage: 20,
    scaledMaxMarks: 30,
    mandatory: true,
  },
];

export function generateFormulaPreview(components: AssessmentComponent[], maxInternal: number): string {
  if (!components || components.length === 0) return `Standard Mid Scheme (${maxInternal} Marks)`;
  const parts = components.map((c) => {
    let ruleText = 'Avg';
    if (c.aggregationRule === 'BEST_N') ruleText = `Best ${c.bestCount ?? 2}`;
    if (c.aggregationRule === 'WEIGHTED') ruleText = `${c.bestWeightage ?? 80}:${c.otherWeightage ?? 20}`;
    if (c.aggregationRule === 'SUM_ALL') ruleText = 'Sum';
    return `${c.name} [${ruleText} of ${c.count}] (${c.scaledMaxMarks}M)`;
  });
  return `Total Internal (${maxInternal}M) = ${parts.join(' + ')}`;
}

export default function RegulationMarksPage() {
  const toast = useToast();
  const [activeMainTab, setActiveMainTab] = useState<'schemes' | 'formula-builder' | 'history'>('schemes');
  const [schemeViewFilter, setSchemeViewFilter] = useState<'ALL' | 'INTERNAL' | 'EXTERNAL' | 'COMBO'>('ALL');

  const [data, setData] = useState<RegulationInternalSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Course and Year-Wise Accordion Expand State
  const [expandedRegCodes, setExpandedRegCodes] = useState<Record<string, boolean>>({});
  const [selectedCourseTabByReg, setSelectedCourseTabByReg] = useState<Record<string, number>>({});

  // History State
  const [allHistoryLogs, setAllHistoryLogs] = useState<RegulationMarksAuditRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyRegulationFilter, setHistoryRegulationFilter] = useState('ALL');
  const [historyActionFilter, setHistoryActionFilter] = useState<'ALL' | 'CREATED' | 'UPDATED' | 'RESET_TO_DEFAULT'>('ALL');
  const [historySearchQuery, setHistorySearchQuery] = useState('');

  // Individual Regulation History Modal State
  const [selectedHistoryRegulation, setSelectedHistoryRegulation] = useState<{
    code: string;
    name?: string | null;
  } | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [individualHistoryLogs, setIndividualHistoryLogs] = useState<RegulationMarksAuditRecord[]>([]);
  const [loadingIndividualHistory, setLoadingIndividualHistory] = useState(false);

  // Formula Editor Modal State
  const [editingItem, setEditingItem] = useState<RegulationInternalSetting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Scope Level for Configuration (Regulation Default vs Specific Course vs Specific Year)
  const [formCourseId, setFormCourseId] = useState<number | null>(null);
  const [formCourseName, setFormCourseName] = useState<string>('');
  const [formYearOfStudy, setFormYearOfStudy] = useState<number | null>(null);

  // Form Fields - Auto Balance Mode
  const [autoBalance100, setAutoBalance100] = useState(true);

  // Form Fields - Internal (CIE) - "How Many Internals" & Dynamic Targeting
  const [formNumInternals, setFormNumInternals] = useState<string>('2');
  const [formMethod, setFormMethod] = useState<CalculationMethod>('WEIGHTED_TWO_MIDS');
  const [formBestWeight, setFormBestWeight] = useState('80');
  const [formOtherWeight, setFormOtherWeight] = useState('20');
  const [formMaxInternal, setFormMaxInternal] = useState('30');
  const [formMinPassInternal, setFormMinPassInternal] = useState('16');
  const [formMinPassInternalPct, setFormMinPassInternalPct] = useState('40');
  const [formRounding, setFormRounding] = useState<RoundingRule>('ROUND_2_DECIMALS');

  // Dynamic Assessment Components & Custom Formula State (Sole CIE Setup)
  const [formComponents, setFormComponents] = useState<AssessmentComponent[]>(DEFAULT_ASSESSMENT_COMPONENTS);

  // Dedicated Standalone Custom Formula Builder & Interactive Playground State
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [formulaTargetRegCode, setFormulaTargetRegCode] = useState<string>('GLOBAL_DEFAULT');
  const [formulaTargetCourseId, setFormulaTargetCourseId] = useState<string>('');
  const [formulaTargetYear, setFormulaTargetYear] = useState<string>('');
  const [formulaComponents, setFormulaComponents] = useState<AssessmentComponent[]>(DEFAULT_ASSESSMENT_COMPONENTS);
  const [formulaMaxInternal, setFormulaMaxInternal] = useState<string>('40');
  const [formulaMinPassPct, setFormulaMinPassPct] = useState<string>('40');
  const [formulaTestInputs, setFormulaTestInputs] = useState<Record<string, string[]>>({});
  const [savingFormula, setSavingFormula] = useState(false);

  // Form Fields - External (SEE) & Dynamic Targeting
  const [formMaxExternal, setFormMaxExternal] = useState('70');
  const [formMinPassExternal, setFormMinPassExternal] = useState('25');
  const [formMinPassExternalPct, setFormMinPassExternalPct] = useState('35');
  const [formRequireExternalPass, setFormRequireExternalPass] = useState(true);

  // Form Fields - Combo & Aggregate Total & Dynamic Targeting
  const [formMaxTotal, setFormMaxTotal] = useState('100');
  const [formMinPassTotal, setFormMinPassTotal] = useState('40');
  const [formMinPassTotalPct, setFormMinPassTotalPct] = useState('40');
  const [formRequireInternalPass, setFormRequireInternalPass] = useState(false);
  const [formPassStrategy, setFormPassStrategy] = useState<PassStrategy>('EXTERNAL_AND_TOTAL');
  const [formRemarks, setFormRemarks] = useState('');

  // Form Fields - Grading Structure & Points Evaluation
  const [formGradingScale, setFormGradingScale] = useState<GradePointRule[]>(DEFAULT_GRADING_SCALE);

  // Load Settings
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getRegulationMarksSettings();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load regulation marks settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Audit History Logs
  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const logs = await api.getRegulationMarksHistory();
      setAllHistoryLogs(logs);
    } catch (err) {
      console.error('Failed to load regulation marks history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Open Individual Regulation History Modal
  const handleOpenIndividualHistory = async (regCode: string, regName?: string | null) => {
    setSelectedHistoryRegulation({ code: regCode, name: regName });
    setIsHistoryModalOpen(true);
    try {
      setLoadingIndividualHistory(true);
      const logs = await api.getRegulationMarksHistoryForRegulation(regCode);
      setIndividualHistoryLogs(logs);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to load history for this regulation', 'danger');
    } finally {
      setLoadingIndividualHistory(false);
    }
  };

  useEffect(() => {
    void loadSettings();
    void loadHistory();
  }, [loadSettings, loadHistory]);

  // Derived current mathematical sum
  const currentInternalNum = parseFloat(formMaxInternal) || 0;
  const currentExternalNum = parseFloat(formMaxExternal) || 0;
  const currentCalculatedSum = currentInternalNum + currentExternalNum;
  const currentTotalNum = parseFloat(formMaxTotal) || currentCalculatedSum;
  const isSumMismatch = Math.abs(currentCalculatedSum - currentTotalNum) > 0.01;

  // Toggle Accordion
  const toggleRegAccordion = (regCode: string) => {
    setExpandedRegCodes((prev) => ({
      ...prev,
      [regCode]: !prev[regCode],
    }));
  };

  // Dynamic Real-Time Data Flow Preview inside Modal
  const previewDataFlow = useMemo(() => {
    const intMax = parseFloat(formMaxInternal) || 40;
    const extMax = parseFloat(formMaxExternal) || 60;
    const totMax = intMax + extMax;
    const intMinPass = parseFloat(formMinPassInternal) || 16;
    const extMinPass = parseFloat(formMinPassExternal) || 21;
    const totMinPass = parseFloat(formMinPassTotal) || 40;
    const bestWeight = (parseFloat(formBestWeight) || 75) / 100;
    const otherWeight = (parseFloat(formOtherWeight) || 25) / 100;

    const sampleMid1 = Math.round(intMax * 0.85 * 10) / 10;
    const sampleMid2 = Math.round(intMax * 0.65 * 10) / 10;
    const sampleExt = Math.round(extMax * 0.65 * 10) / 10;

    let sampleIntScore = 0;
    if (formMethod === 'WEIGHTED_TWO_MIDS') {
      const best = Math.max(sampleMid1, sampleMid2);
      const other = Math.min(sampleMid1, sampleMid2);
      sampleIntScore = Math.round((best * bestWeight + other * otherWeight) * 100) / 100;
    } else if (formMethod === 'AVERAGE_ALL_MIDS') {
      sampleIntScore = Math.round(((sampleMid1 + sampleMid2) / 2) * 100) / 100;
    } else {
      sampleIntScore = Math.max(sampleMid1, sampleMid2);
    }

    const sampleTotal = Math.round((sampleIntScore + sampleExt) * 100) / 100;
    const intPassed = sampleIntScore >= intMinPass;
    const extPassed = sampleExt >= extMinPass;
    const totPassed = sampleTotal >= totMinPass;

    let overallPass = false;
    let reason = '';
    if (formPassStrategy === 'EXTERNAL_AND_TOTAL') {
      overallPass = (!formRequireExternalPass || extPassed) && totPassed;
      if (!overallPass) {
        reason = !extPassed ? `Failed External Cutoff (< ${extMinPass})` : `Failed Aggregate Minimum (< ${totMinPass})`;
      }
    } else if (formPassStrategy === 'ALL_THREE') {
      overallPass = intPassed && (!formRequireExternalPass || extPassed) && totPassed;
      if (!overallPass) {
        reason = !intPassed
          ? `Failed Internal Cutoff (< ${intMinPass})`
          : !extPassed
          ? `Failed External Cutoff (< ${extMinPass})`
          : `Failed Aggregate Minimum (< ${totMinPass})`;
      }
    } else {
      overallPass = totPassed;
      if (!overallPass) reason = `Failed Aggregate Minimum (< ${totMinPass})`;
    }

    if (formRequireInternalPass && !intPassed) {
      overallPass = false;
      reason = `Failed Mandatory Internal Cutoff (< ${intMinPass})`;
    }

    const pct = totMax > 0 ? (sampleTotal / totMax) * 100 : 0;
    let grade = 'F';
    let gradeDescription = 'Fail';
    let gradePoints = 0;

    if (!overallPass) {
      const failRule = (formGradingScale || DEFAULT_GRADING_SCALE).find((r) => !r.isPass && r.grade.toUpperCase() !== 'AB');
      grade = failRule?.grade || 'F';
      gradeDescription = failRule?.gradeDescription || 'Fail';
      gradePoints = failRule?.gradePoints ?? 0;
    } else {
      const passRules = [...(formGradingScale || DEFAULT_GRADING_SCALE)]
        .filter((r) => r.isPass && r.grade.toUpperCase() !== 'AB')
        .sort((a, b) => Number(b.minPercentage) - Number(a.minPercentage));
      const matched = passRules.find((r) => pct >= Number(r.minPercentage));
      if (matched) {
        grade = matched.grade;
        gradeDescription = matched.gradeDescription;
        gradePoints = matched.gradePoints;
      } else {
        const lowestPass = passRules[passRules.length - 1];
        grade = lowestPass?.grade || 'E';
        gradeDescription = lowestPass?.gradeDescription || 'Pass';
        gradePoints = lowestPass?.gradePoints ?? 5;
      }
    }

    return {
      sampleMid1,
      sampleMid2,
      sampleIntScore,
      sampleExt,
      sampleTotal,
      intPassed,
      extPassed,
      totPassed,
      overallPass,
      reason,
      pct: pct.toFixed(1),
      grade,
      gradeDescription,
      gradePoints,
    };
  }, [
    formMaxInternal,
    formMaxExternal,
    formMinPassInternal,
    formMinPassExternal,
    formMinPassTotal,
    formBestWeight,
    formOtherWeight,
    formMethod,
    formPassStrategy,
    formRequireExternalPass,
    formRequireInternalPass,
    formGradingScale,
  ]);

  // Filtered History for Tab 3
  const filteredHistoryLogs = useMemo(() => {
    return allHistoryLogs.filter((log) => {
      if (historyRegulationFilter !== 'ALL' && log.regulationCode !== historyRegulationFilter) {
        return false;
      }
      if (historyActionFilter !== 'ALL' && log.action !== historyActionFilter) {
        return false;
      }
      if (historySearchQuery.trim()) {
        const q = historySearchQuery.toLowerCase();
        const matchesCode = (log.regulationCode || '').toLowerCase().includes(q);
        const matchesName = (log.regulationName || '').toLowerCase().includes(q);
        const matchesUser = (log.changedByName || '').toLowerCase().includes(q);
        const matchesEmail = (log.changedByEmail || '').toLowerCase().includes(q);
        const matchesRemarks = (log.remarks || '').toLowerCase().includes(q);
        return matchesCode || matchesName || matchesUser || matchesEmail || matchesRemarks;
      }
      return true;
    });
  }, [allHistoryLogs, historyRegulationFilter, historyActionFilter, historySearchQuery]);

  // Open modal to configure marks rules (supports Regulation level, Course level, or Year level)
  const handleOpenEdit = (
    item: RegulationInternalSetting,
    courseId: number | null = null,
    courseName: string = '',
    yearOfStudy: number | null = null,
  ) => {
    setEditingItem(item);
    setFormCourseId(courseId ?? item.courseId ?? null);
    setFormCourseName(courseName || item.courseName || '');
    setFormYearOfStudy(yearOfStudy ?? item.yearOfStudy ?? null);
    setFormNumInternals(String(item.numInternals ?? 2));

    const itemInt = Number(item.maxInternalMarks ?? 30);
    const itemExt = Number(item.maxExternalMarks ?? 70);
    const itemTot = item.maxTotalMarks ? Number(item.maxTotalMarks) : itemInt + itemExt;

    setAutoBalance100(itemTot === 100);

    // Internal CIE
    setFormMethod(item.calculationMethod || 'WEIGHTED_TWO_MIDS');
    setFormBestWeight(String(item.bestMidWeightage ?? 80));
    setFormOtherWeight(String(item.otherMidWeightage ?? 20));
    setFormMaxInternal(String(itemInt));
    setFormMinPassInternal(String(item.minPassMarks ?? 16));
    const intPct = item.minPassPercentage != null
      ? item.minPassPercentage
      : itemInt > 0
      ? Math.round((Number(item.minPassMarks ?? 16) / itemInt) * 100)
      : 40;
    setFormMinPassInternalPct(String(intPct));
    setFormRounding(item.roundingRule || 'ROUND_2_DECIMALS');

    // External SEE
    setFormMaxExternal(String(itemExt));
    setFormMinPassExternal(String(item.minExternalPassMarks ?? 25));
    setFormMinPassExternalPct(String(item.minExternalPassPercentage ?? 35));
    setFormRequireExternalPass(item.requireExternalPass !== false);

    // Combo
    setFormMaxTotal(String(itemTot));
    setFormMinPassTotal(String(item.minTotalPassMarks ?? 40));
    setFormMinPassTotalPct(String(item.minTotalPassPercentage ?? 40));
    setFormRequireInternalPass(Boolean(item.requireInternalPass));
    setFormPassStrategy(item.passStrategy || 'EXTERNAL_AND_TOTAL');
    setFormRemarks(item.remarks || '');

    // Grading Scale
    const rawScale = Array.isArray(item.gradingScale) && item.gradingScale.length > 0
      ? item.gradingScale
      : DEFAULT_GRADING_SCALE;

    const cleanScale = rawScale.map((rule) => {
      const rawMin = Number(rule.minPercentage ?? 0);
      const rawMax = Number(rule.maxPercentage ?? 100);
      return {
        ...rule,
        minPercentage: Math.round(rawMin),
        maxPercentage: rawMax >= 100 ? 100 : Math.floor(rawMax),
        gradePoints: Math.round(Number(rule.gradePoints ?? 0)),
      };
    });

    setFormGradingScale(cleanScale);

    // Dynamic Components & Custom Formula (Sole CIE Interface)
    if (Array.isArray(item.evaluationComponents) && item.evaluationComponents.length > 0) {
      setFormComponents(item.evaluationComponents);
    } else {
      const defCount = item.numInternals ?? 2;
      const defMax = itemInt || 30;
      setFormComponents([
        {
          id: 'comp-mids',
          name: 'Mid Examinations',
          code: 'MIDS',
          count: defCount,
          maxMarksPerInstance: defMax,
          aggregationRule: item.calculationMethod === 'AVERAGE_ALL_MIDS' ? 'AVERAGE_ALL' : item.calculationMethod === 'BEST_SINGLE_MID' ? 'BEST_N' : 'WEIGHTED',
          bestCount: item.calculationMethod === 'BEST_SINGLE_MID' ? 1 : 2,
          bestWeightage: item.bestMidWeightage ?? 80,
          otherWeightage: item.otherMidWeightage ?? 20,
          scaledMaxMarks: defMax,
          mandatory: true,
        },
      ]);
    }

    setIsModalOpen(true);
  };

  // Smart Rebalance & Dynamic Targeting: Internal Change
  const handleMaxInternalChange = (val: string) => {
    setFormMaxInternal(val);
    const numInt = parseFloat(val);
    if (!isNaN(numInt)) {
      const targetPct = parseFloat(formMinPassInternalPct) || 40;
      setFormMinPassInternal(String(Math.round((numInt * targetPct) / 100)));

      if (autoBalance100 && numInt <= 100) {
        const balancedExt = Math.max(0, 100 - numInt);
        setFormMaxExternal(String(balancedExt));
        setFormMaxTotal('100');
        const extTargetPct = parseFloat(formMinPassExternalPct) || 35;
        setFormMinPassExternal(String(Math.round((balancedExt * extTargetPct) / 100)));
      } else {
        setFormMaxTotal(String(numInt + (parseFloat(formMaxExternal) || 0)));
      }
    }
  };

  // Dynamic Linking: Internal Target % changed -> auto-updates Marks
  const handleInternalPassPctChange = (pctStr: string) => {
    setFormMinPassInternalPct(pctStr);
    const pct = parseFloat(pctStr);
    const maxInt = parseFloat(formMaxInternal) || 0;
    if (!isNaN(pct) && maxInt > 0) {
      setFormMinPassInternal(String(Math.round((maxInt * pct) / 100)));
    }
  };

  // Dynamic Linking: Internal Marks changed -> auto-updates Target %
  const handleInternalMarksChange = (marksStr: string) => {
    setFormMinPassInternal(marksStr);
    const marks = parseFloat(marksStr);
    const maxInt = parseFloat(formMaxInternal) || 0;
    if (!isNaN(marks) && maxInt > 0) {
      setFormMinPassInternalPct(String(Math.round((marks / maxInt) * 100)));
    }
  };

  // Smart Rebalance & Dynamic Targeting: External Change
  const handleMaxExternalChange = (val: string) => {
    setFormMaxExternal(val);
    const numExt = parseFloat(val);
    if (!isNaN(numExt)) {
      const targetPct = parseFloat(formMinPassExternalPct) || 35;
      setFormMinPassExternal(String(Math.round((numExt * targetPct) / 100)));

      if (autoBalance100 && numExt <= 100) {
        const balancedInt = Math.max(0, 100 - numExt);
        setFormMaxInternal(String(balancedInt));
        setFormMaxTotal('100');
        const intTargetPct = parseFloat(formMinPassInternalPct) || 40;
        setFormMinPassInternal(String(Math.round((balancedInt * intTargetPct) / 100)));
      } else {
        setFormMaxTotal(String((parseFloat(formMaxInternal) || 0) + numExt));
      }
    }
  };

  // Dynamic Linking: External Target % changed -> auto-updates Marks
  const handleExternalPassPctChange = (pctStr: string) => {
    setFormMinPassExternalPct(pctStr);
    const pct = parseFloat(pctStr);
    const maxExt = parseFloat(formMaxExternal) || 0;
    if (!isNaN(pct) && maxExt > 0) {
      setFormMinPassExternal(String(Math.round((maxExt * pct) / 100)));
    }
  };

  // Dynamic Linking: External Marks changed -> auto-updates Target %
  const handleExternalMarksChange = (marksStr: string) => {
    setFormMinPassExternal(marksStr);
    const marks = parseFloat(marksStr);
    const maxExt = parseFloat(formMaxExternal) || 0;
    if (!isNaN(marks) && maxExt > 0) {
      setFormMinPassExternalPct(String(Math.round((marks / maxExt) * 100)));
    }
  };

  // Dynamic Linking: Total Target % changed -> auto-updates Marks
  const handleTotalPassPctChange = (pctStr: string) => {
    setFormMinPassTotalPct(pctStr);
    const pct = parseFloat(pctStr);
    const maxTot = parseFloat(formMaxTotal) || currentCalculatedSum;
    if (!isNaN(pct) && maxTot > 0) {
      setFormMinPassTotal(String(Math.round((maxTot * pct) / 100)));
    }
  };

  // Dynamic Linking: Total Marks changed -> auto-updates Target %
  const handleTotalMarksChange = (marksStr: string) => {
    setFormMinPassTotal(marksStr);
    const marks = parseFloat(marksStr);
    const maxTot = parseFloat(formMaxTotal) || currentCalculatedSum;
    if (!isNaN(marks) && maxTot > 0) {
      setFormMinPassTotalPct(String(Math.round((marks / maxTot) * 100)));
    }
  };

  const handleBestWeightChange = (val: string) => {
    setFormBestWeight(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setFormOtherWeight(String(Math.max(0, 100 - num)));
    }
  };

  // Grading Scale Management
  const handleUpdateGradeRule = (index: number, field: keyof GradePointRule, value: any) => {
    setFormGradingScale((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddGradeRule = () => {
    setFormGradingScale((prev) => [
      ...prev,
      {
        minPercentage: 0,
        maxPercentage: 0,
        grade: 'NEW',
        gradeDescription: 'Custom Grade',
        gradePoints: 0,
        isPass: true,
      },
    ]);
  };

  const handleDeleteGradeRule = (index: number) => {
    setFormGradingScale((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApplyGradingPreset = (scale: GradePointRule[], name: string) => {
    setFormGradingScale(scale);
    toast.push(`Applied "${name}" grading scale`, 'info');
  };

  // Reset custom regulation/course/year rules back to inherited baseline
  const handleResetToDefault = async (item: RegulationInternalSetting) => {
    if (!item.id) return;
    const scopeDesc = item.yearOfStudy
      ? `${item.regulationCode} / ${item.courseName || 'Course'} / Year ${item.yearOfStudy}`
      : item.courseId
      ? `${item.regulationCode} / ${item.courseName || 'Course'} (All Years)`
      : item.regulationCode;

    if (!window.confirm(`Are you sure you want to reset "${scopeDesc}" to inherit the baseline marks setup?`)) {
      return;
    }

    try {
      await api.resetRegulationMarksSetting(item.id);
      toast.push(`Marks setup for "${scopeDesc}" reset to inherited baseline`, 'success');
      void loadSettings();
      void loadHistory();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to reset marks setup', 'danger');
    }
  };

  // Save full marks scheme
  const handleSaveScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const maxInt = parseFloat(formMaxInternal);
    const minPassInt = parseFloat(formMinPassInternal);
    const bestWeight = parseFloat(formBestWeight);
    const otherWeight = parseFloat(formOtherWeight);
    const maxExt = parseFloat(formMaxExternal);
    const minPassExt = parseFloat(formMinPassExternal);
    const exactSum = maxInt + maxExt;

    if (isNaN(maxInt) || maxInt <= 0) {
      toast.push('Maximum Internal Marks must be greater than 0', 'warning');
      return;
    }
    if (isNaN(maxExt) || maxExt <= 0) {
      toast.push('Maximum External Marks must be greater than 0', 'warning');
      return;
    }
    if (isNaN(minPassExt) || minPassExt < 0 || minPassExt > maxExt) {
      toast.push(`Minimum External Pass Marks must be between 0 and Maximum External Marks (${maxExt})`, 'warning');
      return;
    }

    const minPassTot = parseFloat(formMinPassTotal);
    if (isNaN(minPassTot) || minPassTot < 0 || minPassTot > exactSum) {
      toast.push(`Minimum Total Pass Marks must be between 0 and Maximum Total Marks (${exactSum})`, 'warning');
      return;
    }

    // Validate weighted components if any
    for (const comp of formComponents) {
      if (comp.aggregationRule === 'WEIGHTED') {
        const bw = comp.bestWeightage ?? 80;
        const ow = comp.otherWeightage ?? 20;
        if (Math.abs(bw + ow - 100) > 0.01) {
          toast.push(`Weights for component "${comp.name}" must sum to 100% (currently ${bw + ow}%)`, 'warning');
          return;
        }
      }
    }

    const primaryMidComp = formComponents.find((c) => c.code.includes('MID') || c.name.toLowerCase().includes('mid')) || formComponents[0];
    const numInts = primaryMidComp ? primaryMidComp.count : formComponents.length;
    const legacyMethod = primaryMidComp?.aggregationRule === 'AVERAGE_ALL'
      ? 'AVERAGE_ALL_MIDS'
      : primaryMidComp?.aggregationRule === 'BEST_N'
      ? 'BEST_SINGLE_MID'
      : 'WEIGHTED_TWO_MIDS';
    const legacyBestWeight = primaryMidComp?.bestWeightage ?? 80;
    const legacyOtherWeight = primaryMidComp?.otherWeightage ?? 20;
    const customFormulaStr = generateFormulaPreview(formComponents, maxInt);

    const scopeLabel = formYearOfStudy
      ? `${editingItem.regulationCode} / ${formCourseName || 'Course'} / Year ${formYearOfStudy}`
      : formCourseId
      ? `${editingItem.regulationCode} / ${formCourseName || 'Course'} (All Years)`
      : `${editingItem.regulationCode} (Regulation Default)`;

    try {
      setSaving(true);
      await api.saveRegulationMarksSetting({
        id: editingItem.id || undefined,
        regulationId: editingItem.regulationId,
        regulationCode: editingItem.regulationCode,
        regulationName: editingItem.regulationName,
        courseId: formCourseId,
        courseName: formCourseName || null,
        yearOfStudy: formYearOfStudy,
        numInternals: numInts,
        // Internal - backward compatible fields derived from Custom Assessment Components
        calculationMethod: legacyMethod as CalculationMethod,
        bestMidWeightage: legacyBestWeight,
        otherMidWeightage: legacyOtherWeight,
        maxInternalMarks: maxInt,
        minPassMarks: minPassInt,
        minPassPercentage: parseFloat(formMinPassInternalPct) || ((minPassInt / maxInt) * 100),
        minMidsRequired: legacyMethod === 'BEST_SINGLE_MID' ? 1 : Math.min(2, numInts),
        roundingRule: formRounding,
        // External
        maxExternalMarks: maxExt,
        minExternalPassMarks: minPassExt,
        minExternalPassPercentage: parseFloat(formMinPassExternalPct) || ((minPassExt / maxExt) * 100),
        requireExternalPass: formRequireExternalPass,
        // Combo
        maxTotalMarks: exactSum,
        minTotalPassMarks: minPassTot,
        minTotalPassPercentage: parseFloat(formMinPassTotalPct) || ((minPassTot / exactSum) * 100),
        requireInternalPass: formRequireInternalPass,
        requireTotalPass: true,
        passStrategy: formPassStrategy,
        gradingScale: formGradingScale,
        remarks: formRemarks.trim() || null,
        // Sole calculation mechanism: Dynamic Assessment Components & Custom Formula
        evaluationComponents: formComponents,
        customFormula: customFormulaStr,
      });

      toast.push(`Marks setup for "${scopeLabel}" saved successfully (${maxInt} Int + ${maxExt} Ext = ${exactSum} Total)`, 'success');
      setIsModalOpen(false);
      void loadSettings();
      void loadHistory();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to save marks setup', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // Filter regulations by search query
  const filteredRegulations = useMemo(() => {
    if (!data?.regulations) return [];
    if (!searchQuery.trim()) return data.regulations;
    const q = searchQuery.toLowerCase().trim();
    return data.regulations.filter(
      (r) =>
        r.regulationCode.toLowerCase().includes(q) ||
        (r.regulationName && r.regulationName.toLowerCase().includes(q)) ||
        (r.courses && r.courses.some((c) => c.courseName.toLowerCase().includes(q))),
    );
  }, [data, searchQuery]);

  // Scaled sum of components in Edit Modal
  const formComponentsScaledSum = useMemo(() => {
    return formComponents.reduce((acc, c) => acc + (Number(c.scaledMaxMarks) || 0), 0);
  }, [formComponents]);

  // Scaled sum of components in Formula Builder tab
  const formulaComponentsSum = useMemo(() => {
    return formulaComponents.reduce((acc, c) => acc + (Number(c.scaledMaxMarks) || 0), 0);
  }, [formulaComponents]);

  // Component handlers for Edit Modal
  const handleUpdateComponent = (index: number, field: keyof AssessmentComponent, value: any) => {
    setFormComponents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddComponent = () => {
    const nextIdx = formComponents.length + 1;
    setFormComponents((prev) => [
      ...prev,
      {
        id: `comp-custom-${Date.now()}`,
        name: `Component ${nextIdx}`,
        code: `COMP${nextIdx}`,
        count: 2,
        maxMarksPerInstance: 10,
        aggregationRule: 'AVERAGE_ALL',
        scaledMaxMarks: 5,
        mandatory: false,
      },
    ]);
  };

  const handleDeleteComponent = (index: number) => {
    setFormComponents((prev) => prev.filter((_, i) => i !== index));
  };

  // Component handlers for Formula Builder Tab
  const handleUpdateFormulaTabComponent = (index: number, field: keyof AssessmentComponent, value: any) => {
    setFormulaComponents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddFormulaTabComponent = () => {
    const nextIdx = formulaComponents.length + 1;
    setFormulaComponents((prev) => [
      ...prev,
      {
        id: `comp-tab-${Date.now()}`,
        name: `Assessment Component ${nextIdx}`,
        code: `COMP${nextIdx}`,
        count: 2,
        maxMarksPerInstance: 10,
        aggregationRule: 'AVERAGE_ALL',
        scaledMaxMarks: 5,
        mandatory: false,
      },
    ]);
  };

  const handleDeleteFormulaTabComponent = (index: number) => {
    setFormulaComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFormulaTestInputChange = (compId: string, index: number, val: string) => {
    setFormulaTestInputs((prev) => {
      const currentList = prev[compId] ? [...prev[compId]] : [];
      currentList[index] = val;
      return { ...prev, [compId]: currentList };
    });
  };

  // Real-time calculation logic for the custom formula playground
  const formulaPlaygroundResult = useMemo(() => {
    const targetMax = parseFloat(formulaMaxInternal) || 40;
    const minPassPct = parseFloat(formulaMinPassPct) || 40;
    const minPass = Math.round((targetMax * minPassPct) / 100);

    let totalScore = 0;
    const breakdown: Array<{
      componentId: string;
      name: string;
      code: string;
      rawScores: number[];
      rawAverage: number;
      scaledScore: number;
      scaledMax: number;
      step: string;
    }> = [];

    for (const comp of formulaComponents) {
      const inputs = formulaTestInputs[comp.id] || [];
      const maxPerInstance = Number(comp.maxMarksPerInstance) || 30;
      const scaledMax = Number(comp.scaledMaxMarks) || 30;
      const count = Number(comp.count) || 2;

      const validScores: number[] = [];
      for (let i = 0; i < count; i++) {
        const valStr = inputs[i];
        if (valStr !== undefined && valStr !== '' && !isNaN(parseFloat(valStr))) {
          validScores.push(Math.min(parseFloat(valStr), maxPerInstance));
        } else {
          validScores.push(0);
        }
      }

      let scaledScore = 0;
      let rawAverage = 0;
      let step = '';

      if (comp.aggregationRule === 'BEST_N') {
        const sorted = [...validScores].sort((a, b) => b - a);
        const top = sorted.slice(0, Math.min(comp.bestCount || 2, sorted.length));
        rawAverage = top.reduce((a, b) => a + b, 0) / (top.length || 1);
        scaledScore = maxPerInstance > 0 ? (rawAverage / maxPerInstance) * scaledMax : rawAverage;
        step = `Best ${top.length} of ${validScores.length} (${top.join(' + ')}) / ${top.length} = ${rawAverage.toFixed(1)} / ${maxPerInstance} ➔ ${scaledScore.toFixed(1)} / ${scaledMax}M`;
      } else if (comp.aggregationRule === 'WEIGHTED') {
        const sorted = [...validScores].sort((a, b) => b - a);
        const best = sorted[0] || 0;
        const second = sorted[1] || 0;
        const bw = comp.bestWeightage || 80;
        const ow = comp.otherWeightage || 20;
        const weighted = (best * (bw / 100)) + (second * (ow / 100));
        rawAverage = weighted;
        scaledScore = maxPerInstance > 0 ? (weighted / maxPerInstance) * scaledMax : weighted;
        step = `(${best} × ${bw}%) + (${second} × ${ow}%) = ${weighted.toFixed(1)} / ${maxPerInstance} ➔ ${scaledScore.toFixed(1)} / ${scaledMax}M`;
      } else if (comp.aggregationRule === 'SUM_ALL') {
        rawAverage = validScores.reduce((a, b) => a + b, 0);
        scaledScore = Math.min(rawAverage, scaledMax);
        step = `Sum (${validScores.join(' + ')}) = ${rawAverage.toFixed(1)} ➔ ${scaledScore.toFixed(1)} / ${scaledMax}M`;
      } else {
        // AVERAGE_ALL
        rawAverage = validScores.reduce((a, b) => a + b, 0) / (validScores.length || 1);
        scaledScore = maxPerInstance > 0 ? (rawAverage / maxPerInstance) * scaledMax : rawAverage;
        step = `Avg of ${validScores.length} (${validScores.map(v => v.toFixed(1)).join(' + ')}) / ${validScores.length} = ${rawAverage.toFixed(1)} / ${maxPerInstance} ➔ ${scaledScore.toFixed(1)} / ${scaledMax}M`;
      }

      totalScore += scaledScore;
      breakdown.push({
        componentId: comp.id,
        name: comp.name,
        code: comp.code,
        rawScores: validScores,
        rawAverage: Number(rawAverage.toFixed(2)),
        scaledScore: Number(scaledScore.toFixed(2)),
        scaledMax,
        step,
      });
    }

    const finalMarks = Number(totalScore.toFixed(2));
    const isPass = finalMarks >= minPass;

    return {
      finalMarks,
      targetMax,
      minPass,
      minPassPct,
      isPass,
      breakdown,
    };
  }, [formulaComponents, formulaTestInputs, formulaMaxInternal, formulaMinPassPct]);

  // Save from Formula Builder Playground
  const handleSaveFormulaFromPlayground = async () => {
    if (!data) return;
    const targetReg = formulaTargetRegCode === 'GLOBAL_DEFAULT'
      ? data.globalDefault
      : data.regulations.find((r) => r.regulationCode === formulaTargetRegCode) || data.globalDefault;

    const maxInt = parseFloat(formulaMaxInternal) || 40;
    const minPassPct = parseFloat(formulaMinPassPct) || 40;
    const minPass = Math.round((maxInt * minPassPct) / 100);

    const cId = formulaTargetCourseId ? parseInt(formulaTargetCourseId, 10) : null;
    const matchedCourse = cId && targetReg.courses ? targetReg.courses.find(c => c.courseId === cId) : null;
    const yOfStudy = formulaTargetYear ? parseInt(formulaTargetYear, 10) : null;

    const formulaStr = generateFormulaPreview(formulaComponents, maxInt);

    try {
      setSavingFormula(true);
      await api.saveRegulationMarksSetting({
        id: undefined,
        regulationId: targetReg.regulationId,
        regulationCode: targetReg.regulationCode,
        courseId: cId,
        courseName: matchedCourse ? matchedCourse.courseName : null,
        yearOfStudy: yOfStudy,
        numInternals: formulaComponents.find(c => c.code.toLowerCase().includes('mid'))?.count || 2,
        calculationMethod: 'AVERAGE_ALL_MIDS',
        maxInternalMarks: maxInt,
        minPassMarks: minPass,
        minPassPercentage: minPassPct,
        maxExternalMarks: targetReg.maxExternalMarks || 60,
        minExternalPassMarks: targetReg.minExternalPassMarks || 21,
        minExternalPassPercentage: targetReg.minExternalPassPercentage || 35,
        maxTotalMarks: maxInt + (Number(targetReg.maxExternalMarks) || 60),
        minTotalPassMarks: targetReg.minTotalPassMarks || 40,
        minTotalPassPercentage: targetReg.minTotalPassPercentage || 40,
        evaluationComponents: formulaComponents,
        customFormula: formulaStr,
        remarks: `Custom formula configured via Formula Builder: ${formulaStr}`,
      });

      toast.push(`Custom formula saved successfully for ${formulaTargetRegCode}${matchedCourse ? ` / ${matchedCourse.courseName}` : ''}${yOfStudy ? ` (Year ${yOfStudy})` : ''}`, 'success');
      void loadSettings();
      void loadHistory();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to save custom formula', 'danger');
    } finally {
      setSavingFormula(false);
    }
  };

  // Scope resolution for the active editing item in modal
  const currentEditingReg = data?.regulations.find(
    (r) => r.regulationCode === editingItem?.regulationCode || r.regulationId === editingItem?.regulationId,
  );
  const editingCourses = currentEditingReg?.courses || [];
  const editingSelectedCourse = editingCourses.find((c) =>
    (formCourseId != null && c.courseId === formCourseId) ||
    (formCourseName && c.courseName.toLowerCase() === formCourseName.toLowerCase()),
  );
  const editingYears = editingSelectedCourse?.years || [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Regulation Marks & Assessment Setup"
        description="Configure dynamic marks calculation schemes and pass criteria: Regulation-Based Courses, Year-Wise Breakdown, Continuous Internal Evaluation (CIE), Semester End Examination (SEE), and Aggregate Pass Rules."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/internal-marks"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              View Internal Marks Table
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadSettings()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveMainTab('formula-builder')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <span>✨</span>
              Custom Formula Builder
            </Button>
          </div>
        }
      />

      {/* Primary Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('schemes')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeMainTab === 'schemes'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Regulation Marks Schemes (Courses & Year-Wise)
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('formula-builder')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeMainTab === 'formula-builder'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200'
          }`}
        >
          <span>✨</span>
          Custom Formula Builder & Playground
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMainTab('history');
            void loadHistory();
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeMainTab === 'history'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Audit History & Change Log
          {allHistoryLogs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-sky-800 text-white font-black">
              {allHistoryLogs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: REGULATION MARKS SCHEMES */}
      {activeMainTab === 'schemes' && (
        <div className="space-y-6">
          {/* Global Default Architecture Card */}
          {data?.globalDefault && (
            <Card className="border-sky-200 bg-linear-to-r from-sky-50/70 via-white to-blue-50/40 shadow-xs">
              <CardBody>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-sky-100 text-sky-800 border border-sky-300">
                        Baseline Template
                      </span>
                      <h3 className="text-sm font-bold text-slate-900">
                        Global Standard Assessment Architecture (Baseline Fallback)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-600">
                      Regulations without custom overrides inherit these proportions: {data.globalDefault.numInternals ?? 2} Internals, {data.globalDefault.maxInternalMarks} Internal + {data.globalDefault.maxExternalMarks} External = {data.globalDefault.maxTotalMarks} Total Marks.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleOpenIndividualHistory('GLOBAL_DEFAULT', 'Global Standard Assessment Baseline')}
                      className="text-indigo-700 border border-indigo-200 bg-white hover:bg-indigo-50"
                    >
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Baseline History
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(data.globalDefault)}
                    >
                      Configure Global Baseline
                    </Button>
                  </div>
                </div>

                {/* 3 Tier Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4 pt-3.5 border-t border-sky-100">
                  {/* Tier 1: Internal Assessment */}
                  <div className="p-3 bg-white rounded-xl border border-sky-100 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">1. Internal CIE ({data.globalDefault.numInternals ?? 2} Mids)</span>
                      <span className="text-xs font-bold text-slate-900">/{data.globalDefault.maxInternalMarks} Marks</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">
                      {data.globalDefault.calculationMethod === 'WEIGHTED_TWO_MIDS'
                        ? `${data.globalDefault.bestMidWeightage}% Best + ${data.globalDefault.otherMidWeightage}% Second Mid`
                        : data.globalDefault.calculationMethod === 'AVERAGE_ALL_MIDS'
                        ? 'Average of All Conducted Mids'
                        : 'Best Single Mid'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Targeting: <strong className="text-emerald-700">≥ {data.globalDefault.minPassMarks} Marks</strong> ({data.globalDefault.minPassPercentage ?? 40}%) · Rule: {data.globalDefault.roundingRule}
                    </p>
                  </div>

                  {/* Tier 2: External Assessment */}
                  <div className="p-3 bg-white rounded-xl border border-emerald-100 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">2. External SEE</span>
                      <span className="text-xs font-bold text-slate-900">/{data.globalDefault.maxExternalMarks} Marks</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">
                      Semester End Exam Cutoff: <strong className="text-emerald-700">≥ {data.globalDefault.minExternalPassMarks} Marks</strong> ({data.globalDefault.minExternalPassPercentage}%)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      External Pass Required: <span className="font-semibold text-slate-700">{data.globalDefault.requireExternalPass ? 'Yes (Mandatory)' : 'No'}</span>
                    </p>
                  </div>

                  {/* Tier 3: Combo Aggregate */}
                  <div className="p-3 bg-white rounded-xl border border-purple-100 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">3. Combined Aggregate</span>
                      <span className="text-xs font-bold text-slate-900">/{data.globalDefault.maxTotalMarks} Total</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">
                      Minimum Total Pass: <strong className="text-purple-700">≥ {data.globalDefault.minTotalPassMarks} Marks</strong> ({data.globalDefault.minTotalPassPercentage}%)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Strategy: <span className="font-semibold text-slate-700">{data.globalDefault.passStrategy}</span>
                    </p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Regulations List Card */}
          <Card>
            <CardHeader
              title="Academic Regulations Schemes Catalog"
              description="Configure dynamic marks calculation schemes, course-specific assessment rules, and year-wise breakdowns under each academic regulation."
              action={
                <div className="flex items-center gap-3">
                  {/* Category View Pills */}
                  <div className="hidden sm:inline-flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-600">
                    <button
                      type="button"
                      onClick={() => setSchemeViewFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        schemeViewFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      All Dimensions
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemeViewFilter('INTERNAL')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        schemeViewFilter === 'INTERNAL' ? 'bg-white text-sky-800 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      Internals (CIE)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemeViewFilter('EXTERNAL')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        schemeViewFilter === 'EXTERNAL' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      Externals (SEE)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemeViewFilter('COMBO')}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        schemeViewFilter === 'COMBO' ? 'bg-white text-purple-800 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      Combo / Aggregate
                    </button>
                  </div>

                  <div className="w-64">
                    <input
                      type="text"
                      placeholder="Search regulations or courses..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
              }
            />
            <CardBody className="p-0">
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600 mb-2"></div>
                  <p>Loading regulation marks setups…</p>
                </div>
              ) : filteredRegulations.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No regulations matched your search query.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {filteredRegulations.map((reg) => {
                    const isExpanded = Boolean(expandedRegCodes[reg.regulationCode]);
                    const courses = reg.courses || [];
                    const activeCourseTab = selectedCourseTabByReg[reg.regulationCode] || 0;
                    const selectedCourse = courses[activeCourseTab] || courses[0];

                    return (
                      <div key={reg.regulationCode} className="p-4 space-y-4 hover:bg-slate-50/40 transition-colors">
                        {/* Regulation Summary Bar */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => toggleRegAccordion(reg.regulationCode)}
                              className="mt-0.5 p-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition-transform cursor-pointer"
                              title={isExpanded ? 'Collapse courses & year-wise view' : 'Expand regulation-based courses & year-wise setup'}
                            >
                              <svg
                                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-sky-600' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-200">
                                  {reg.regulationCode}
                                </span>
                                <h4 className="font-bold text-sm text-slate-900">{reg.regulationName}</h4>
                                {reg.isCustomized ? (
                                  <Badge variant="success">Customized Scheme</Badge>
                                ) : (
                                  <Badge variant="default">Inherited Baseline</Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                                <span>
                                  Default: <strong>{reg.numInternals ?? 2} Mids</strong>, <strong>{reg.maxInternalMarks} Int</strong> + <strong>{reg.maxExternalMarks} Ext</strong> = <strong>{reg.maxTotalMarks} Total</strong>
                                </span>
                                <span>·</span>
                                <span className="text-sky-700 font-medium">
                                  {courses.length} Regulation Course{courses.length !== 1 ? 's' : ''} Mapped
                                </span>
                                {reg.remarks && (
                                  <>
                                    <span>·</span>
                                    <span className="italic">{reg.remarks}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-2 self-end lg:self-center">
                            <button
                              type="button"
                              onClick={() => toggleRegAccordion(reg.regulationCode)}
                              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                            >
                              <span>{isExpanded ? 'Hide Courses & Years' : 'View Courses & Year Setup'}</span>
                              <span className="px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">
                                {courses.length}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleOpenIndividualHistory(reg.regulationCode, reg.regulationName)}
                              className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2.5 py-1.5 font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title={`View history for ${reg.regulationCode}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              History
                            </button>

                            {reg.isCustomized && (
                              <button
                                type="button"
                                onClick={() => void handleResetToDefault(reg)}
                                className="text-xs text-rose-600 hover:text-rose-800 hover:underline px-2 py-1 font-medium transition-colors cursor-pointer"
                                title="Reset regulation baseline back to inherit Global Default"
                              >
                                Reset
                              </button>
                            )}

                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEdit(reg, null, '', null)}
                            >
                              Configure Regulation Default
                            </Button>
                          </div>
                        </div>

                        {/* ACCORDION CONTENT: REGULATION-BASED COURSES & YEAR-WISE SETUP */}
                        {isExpanded && (
                          <div className="mt-3 p-4 rounded-xl border border-sky-200 bg-linear-to-b from-sky-50/40 via-white to-slate-50/50 space-y-4 shadow-2xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-100 pb-3">
                              <div>
                                <h5 className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                                  <span>🏛️</span> Regulation-Based Courses & Year-Wise Marks Setup for {reg.regulationCode}
                                </h5>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Configure dynamic internal exams, targeting percentages, and total pass rules per course and study year.
                                </p>
                              </div>

                              <span className="text-[11px] font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                                Year-specific setups override course defaults, which override regulation baselines.
                              </span>
                            </div>

                            {courses.length === 0 ? (
                              <div className="p-6 text-center rounded-lg border border-dashed border-slate-200 bg-white space-y-2">
                                <p className="text-xs font-semibold text-slate-700">No courses mapped to {reg.regulationCode} yet.</p>
                                <p className="text-[11px] text-slate-500">
                                  Map colleges, programmes, and batches to this regulation in the Regulations scope configuration.
                                </p>
                                <Link
                                  href={`/dashboard/regulations/${reg.regulationId}`}
                                  className="inline-block mt-1 text-xs font-bold text-sky-600 hover:underline"
                                >
                                  Go to Regulation Scope Mapping →
                                </Link>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {/* Course Selector Tabs */}
                                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                                  {courses.map((course, cIdx) => {
                                    const active = (selectedCourseTabByReg[reg.regulationCode] || 0) === cIdx;
                                    return (
                                      <button
                                        key={course.courseId}
                                        type="button"
                                        onClick={() =>
                                          setSelectedCourseTabByReg((prev) => ({
                                            ...prev,
                                            [reg.regulationCode]: cIdx,
                                          }))
                                        }
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                          active
                                            ? 'bg-sky-600 text-white shadow-2xs'
                                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        <span>{course.courseName}</span>
                                        <span
                                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                                            active ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {course.totalYears} Years
                                        </span>
                                        {course.isCustomized && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Course custom scheme active" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Active Course Content: Course Default & Year-Wise Grid */}
                                {selectedCourse && (
                                  <div className="space-y-4">
                                    {/* Course Baseline Overview Bar */}
                                    <div className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-extrabold text-slate-900">
                                            {selectedCourse.courseName} — Course Default Scheme
                                          </span>
                                          {selectedCourse.isCustomized ? (
                                            <Badge variant="success">Custom Course Scheme</Badge>
                                          ) : (
                                            <Badge variant="default">Inheriting {reg.regulationCode} Baseline</Badge>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-slate-500">
                                          Applies across all {selectedCourse.totalYears} years of {selectedCourse.courseName} unless overridden for an individual year.
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {selectedCourse.isCustomized && selectedCourse.courseSetting.id && (
                                          <button
                                            type="button"
                                            onClick={() => void handleResetToDefault(selectedCourse.courseSetting)}
                                            className="text-xs text-rose-600 hover:text-rose-800 hover:underline px-2 py-1 font-medium cursor-pointer"
                                          >
                                            Reset Course Default
                                          </button>
                                        )}
                                        <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() =>
                                            handleOpenEdit(
                                              selectedCourse.courseSetting,
                                              selectedCourse.courseId,
                                              selectedCourse.courseName,
                                              null,
                                            )
                                          }
                                        >
                                          Configure Course Default
                                        </Button>
                                      </div>
                                    </div>

                                    {/* YEAR-WISE BREAKDOWN TABLE */}
                                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                                      <table className="w-full border-collapse text-left text-xs">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                                          <tr>
                                            <th className="px-4 py-3">Academic Year of Study</th>
                                            <th className="px-4 py-3">Continuous Internal Evaluation (CIE Formula & Scheme)</th>
                                            <th className="px-4 py-3">External Exam (SEE)</th>
                                            <th className="px-4 py-3">Total Aggregate & Strategy</th>
                                            <th className="px-4 py-3 text-center">Status / Origin</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {selectedCourse.years.map((yr) => {
                                            const yCfg = yr.setting;
                                            const formulaDisplay = yCfg.customFormula || generateFormulaPreview(yCfg.evaluationComponents || [], yCfg.maxInternalMarks);
                                            return (
                                              <tr key={yr.yearOfStudy} className="hover:bg-slate-50/70 transition-colors">
                                                {/* Year Name */}
                                                <td className="px-4 py-3">
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                                      Year {yr.yearOfStudy}
                                                    </span>
                                                    <span className="text-[11px] text-slate-500 font-medium">
                                                      (Sem {yr.yearOfStudy * 2 - 1} & {yr.yearOfStudy * 2})
                                                    </span>
                                                  </div>
                                                  {yCfg.remarks && (
                                                    <p className="text-[10px] text-slate-400 mt-1 italic">{yCfg.remarks}</p>
                                                  )}
                                                </td>

                                                {/* Internals CIE Formula */}
                                                <td className="px-4 py-3">
                                                  <div className="font-semibold text-slate-900">
                                                    Scale: /{yCfg.maxInternalMarks} Marks
                                                  </div>
                                                  <div className="text-[11px] font-mono font-bold text-indigo-900 bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded mt-1 max-w-sm">
                                                    {formulaDisplay}
                                                  </div>
                                                  <div className="text-[11px] text-slate-500 mt-1">
                                                    Pass Cutoff: <strong className="text-emerald-700">≥ {yCfg.minPassMarks} Marks</strong> ({yCfg.minPassPercentage ?? 40}% Target)
                                                  </div>
                                                </td>

                                                {/* External SEE */}
                                                <td className="px-4 py-3">
                                                  <div className="font-semibold text-slate-900">
                                                    Scale: /{yCfg.maxExternalMarks} Marks
                                                  </div>
                                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                                    Pass Cutoff: <strong className="text-emerald-700">≥ {yCfg.minExternalPassMarks} Marks</strong> ({yCfg.minExternalPassPercentage}% Target)
                                                  </div>
                                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                                    Mandatory Pass: <span className="font-medium text-slate-700">{yCfg.requireExternalPass ? 'Yes' : 'No'}</span>
                                                  </div>
                                                </td>

                                                {/* Total Aggregate */}
                                                <td className="px-4 py-3">
                                                  <div className="font-semibold text-slate-900">
                                                    Course Total: /{yCfg.maxTotalMarks} Total
                                                  </div>
                                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                                    Min Pass: <strong className="text-purple-700">≥ {yCfg.minTotalPassMarks} Marks</strong> ({yCfg.minTotalPassPercentage}% Target)
                                                  </div>
                                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                                    {yCfg.passStrategy}
                                                  </div>
                                                </td>

                                                {/* Status / Origin */}
                                                <td className="px-4 py-3 text-center">
                                                  {yr.isCustomized ? (
                                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                      Year {yr.yearOfStudy} Override
                                                    </span>
                                                  ) : yr.inheritedFrom === 'COURSE' ? (
                                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                                      Course Default
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                      {reg.regulationCode} Baseline
                                                    </span>
                                                  )}
                                                </td>

                                                {/* Actions */}
                                                <td className="px-4 py-3 text-right">
                                                  <div className="inline-flex items-center gap-1.5">
                                                    {yr.isCustomized && yCfg.id && (
                                                      <button
                                                        type="button"
                                                        onClick={() => void handleResetToDefault(yCfg)}
                                                        className="text-xs text-rose-600 hover:text-rose-800 hover:underline px-2 py-1 font-medium cursor-pointer"
                                                        title="Reset this year back to inherit Course Default"
                                                      >
                                                        Reset
                                                      </button>
                                                    )}
                                                    <Button
                                                      variant="secondary"
                                                      size="sm"
                                                      onClick={() =>
                                                        handleOpenEdit(
                                                          yCfg,
                                                          selectedCourse.courseId,
                                                          selectedCourse.courseName,
                                                          yr.yearOfStudy,
                                                        )
                                                      }
                                                    >
                                                      Configure Year {yr.yearOfStudy}
                                                    </Button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 2: DYNAMIC ASSESSMENT FORMULA BUILDER & PLAYGROUND */}
      {activeMainTab === 'formula-builder' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="✨ Custom Assessment Formula Builder & Interactive Playground"
              description="Empower users to build dynamic examination formulas with custom assessment components (e.g. 3 Mids + 2 Assignments, Objective Quizzes, Practicals, Attendance). Test live candidate marks and save directly to regulations, courses, or study years."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSaveFormulaFromPlayground()}
                  disabled={savingFormula}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-2xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {savingFormula ? 'Saving Formula…' : 'Save Formula to Target Scope'}
                </Button>
              }
            />
            <CardBody>
              <div className="space-y-6">
                {/* STEP 1: TARGET SCOPE SELECTION */}
                <div className="p-4 rounded-xl border border-indigo-200 bg-linear-to-r from-indigo-50/70 via-white to-sky-50/60 space-y-3 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
                        Target Configuration Scope
                      </span>
                      <h4 className="text-sm font-black text-slate-900 mt-0.5">
                        {formulaTargetYear
                          ? `${formulaTargetRegCode} ➔ ${data?.regulations.find(r => r.regulationCode === formulaTargetRegCode)?.courses?.find(c => String(c.courseId) === formulaTargetCourseId)?.courseName || 'Course'} ➔ Year ${formulaTargetYear} of Study`
                          : formulaTargetCourseId
                          ? `${formulaTargetRegCode} ➔ ${data?.regulations.find(r => r.regulationCode === formulaTargetRegCode)?.courses?.find(c => String(c.courseId) === formulaTargetCourseId)?.courseName || 'Course'} (All Study Years)`
                          : formulaTargetRegCode === 'GLOBAL_DEFAULT'
                          ? 'Global Default Scheme (All Regulations)'
                          : `${formulaTargetRegCode} Regulation Baseline`}
                      </h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Regulation Select */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Regulation</label>
                        <select
                          value={formulaTargetRegCode}
                          onChange={(e) => {
                            setFormulaTargetRegCode(e.target.value);
                            setFormulaTargetCourseId('');
                            setFormulaTargetYear('');
                          }}
                          className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 bg-white font-bold text-slate-900 shadow-2xs"
                        >
                          <option value="GLOBAL_DEFAULT">Global Standard Default</option>
                          {data?.regulations.map((r) => (
                            <option key={r.regulationCode} value={r.regulationCode}>
                              {r.regulationCode} {r.regulationName ? `— ${r.regulationName}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Course Select */}
                      {formulaTargetRegCode !== 'GLOBAL_DEFAULT' && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Course Scope</label>
                          <select
                            value={formulaTargetCourseId}
                            onChange={(e) => {
                              setFormulaTargetCourseId(e.target.value);
                              setFormulaTargetYear('');
                            }}
                            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 bg-white font-bold text-slate-900 shadow-2xs"
                          >
                            <option value="">Regulation-Wide Default</option>
                            {data?.regulations
                              .find((r) => r.regulationCode === formulaTargetRegCode)
                              ?.courses?.map((c) => (
                                <option key={c.courseId} value={String(c.courseId)}>
                                  {c.courseName} ({c.totalYears} Years)
                                </option>
                              ))}
                          </select>
                        </div>
                      )}

                      {/* Year Select */}
                      {formulaTargetCourseId && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase">Year Scope</label>
                          <select
                            value={formulaTargetYear}
                            onChange={(e) => setFormulaTargetYear(e.target.value)}
                            className="px-2.5 py-1.5 text-xs rounded-md border border-slate-300 bg-white font-bold text-slate-900 shadow-2xs"
                          >
                            <option value="">All Years of Course</option>
                            {data?.regulations
                              .find((r) => r.regulationCode === formulaTargetRegCode)
                              ?.courses?.find((c) => String(c.courseId) === formulaTargetCourseId)
                              ?.years.map((y) => (
                                <option key={y.yearOfStudy} value={String(y.yearOfStudy)}>
                                  Year {y.yearOfStudy}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* STEP 2: ASSESSMENT COMPONENTS BUILDER */}
                <div className="p-5 rounded-xl border border-slate-200 bg-white space-y-4 shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <span>🧩</span> Assessment Evaluation Components
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Define examination instances (e.g. 3 Mids, 2 Assignments) and how each component aggregates.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleAddFormulaTabComponent}
                        className="text-xs font-bold"
                      >
                        + Add Component
                      </Button>
                      {formulaComponentsSum !== parseFloat(formulaMaxInternal) && (
                        <button
                          type="button"
                          onClick={() => setFormulaMaxInternal(String(formulaComponentsSum))}
                          className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                        >
                          Auto-Sync Max ({formulaComponentsSum}M)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Components List Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {formulaComponents.map((comp, idx) => (
                      <div
                        key={comp.id || idx}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/20 transition-all space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 text-xs font-black flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={comp.name}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'name', e.target.value)}
                              placeholder="Component Name (e.g. Mid Exams)"
                              className="font-black text-xs text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-300 flex-1 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={comp.code}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'code', e.target.value.toUpperCase())}
                              placeholder="Code"
                              className="font-mono text-xs font-bold text-slate-600 bg-white px-2 py-1 rounded border border-slate-300 w-24 outline-none focus:border-indigo-500"
                            />
                          </div>
                          {formulaComponents.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteFormulaTabComponent(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                              title="Delete Component"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          {/* How Many Conducted */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Instances</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={comp.count}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'count', parseInt(e.target.value, 10) || 1)}
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-800"
                            />
                            <span className="text-[10px] text-slate-400">e.g. 3 Mids</span>
                          </div>

                          {/* Max Marks Per Instance */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Marks / Instance</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={comp.maxMarksPerInstance}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'maxMarksPerInstance', parseFloat(e.target.value) || 30)}
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-800"
                            />
                            <span className="text-[10px] text-slate-400">e.g. 30M paper</span>
                          </div>

                          {/* Aggregation Rule */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase">Rule</label>
                            <select
                              value={comp.aggregationRule}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'aggregationRule', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-800 text-[11px]"
                            >
                              <option value="AVERAGE_ALL">Average of All</option>
                              <option value="BEST_N">Best N of Total</option>
                              <option value="WEIGHTED">Weighted (80:20)</option>
                              <option value="SUM_ALL">Sum of Scores</option>
                            </select>
                            <span className="text-[10px] text-slate-400">Evaluation rule</span>
                          </div>

                          {/* Scaled Marks Contributed */}
                          <div>
                            <label className="block text-[10px] font-bold text-indigo-700 uppercase">Scaled Max</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={comp.scaledMaxMarks}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'scaledMaxMarks', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 rounded border border-indigo-300 bg-white font-black text-indigo-900"
                            />
                            <span className="text-[10px] text-indigo-600 font-bold">Contribution</span>
                          </div>
                        </div>

                        {/* Extra Params for Rule */}
                        {comp.aggregationRule === 'BEST_N' && (
                          <div className="flex items-center gap-2 pt-1 text-xs">
                            <span className="text-[11px] font-semibold text-slate-600">Take Top:</span>
                            <input
                              type="number"
                              min={1}
                              max={comp.count}
                              value={comp.bestCount || 2}
                              onChange={(e) => handleUpdateFormulaTabComponent(idx, 'bestCount', parseInt(e.target.value, 10) || 1)}
                              className="w-16 px-2 py-0.5 rounded border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                            />
                            <span className="text-[11px] text-slate-500">best scores among {comp.count} conducted</span>
                          </div>
                        )}

                        {comp.aggregationRule === 'WEIGHTED' && (
                          <div className="flex items-center gap-2 pt-1 text-xs">
                            <span className="text-[11px] font-semibold text-slate-600">Best %:</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={comp.bestWeightage || 80}
                              onChange={(e) => {
                                const bw = parseFloat(e.target.value) || 0;
                                handleUpdateFormulaTabComponent(idx, 'bestWeightage', bw);
                                handleUpdateFormulaTabComponent(idx, 'otherWeightage', Math.max(0, 100 - bw));
                              }}
                              className="w-16 px-2 py-0.5 rounded border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                            />
                            <span className="text-[11px] font-semibold text-slate-600">Second %:</span>
                            <input
                              type="number"
                              disabled
                              value={comp.otherWeightage || 20}
                              className="w-16 px-2 py-0.5 rounded border border-slate-200 bg-slate-100 font-bold text-slate-500 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* FORMULA MATH PREVIEW BADGE */}
                  <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-900 tracking-wider">
                        Generated Mathematical Formula:
                      </span>
                      <p className="font-mono font-bold text-indigo-950 mt-0.5 text-xs">
                        {generateFormulaPreview(formulaComponents, parseFloat(formulaMaxInternal) || 40)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Internal Max Scale</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={formulaMaxInternal}
                            onChange={(e) => setFormulaMaxInternal(e.target.value)}
                            className="w-16 px-2 py-0.5 text-center font-black rounded border border-indigo-300 bg-white text-indigo-900 text-xs"
                          />
                          <span className="text-slate-500 font-bold">Marks</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Pass Cutoff</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={formulaMinPassPct}
                            onChange={(e) => setFormulaMinPassPct(e.target.value)}
                            className="w-14 px-2 py-0.5 text-center font-black rounded border border-slate-300 bg-white text-slate-900 text-xs"
                          />
                          <span className="text-slate-500 font-bold">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* STEP 3: INTERACTIVE LIVE TESTER / PLAYGROUND */}
                <div className="p-5 rounded-xl border border-sky-200 bg-linear-to-b from-sky-50/30 to-white space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between pb-2 border-b border-sky-200">
                    <div>
                      <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <span>🧪</span> Interactive Live Tester (Test Your Dynamic Formula Now)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Type candidate sample marks below to see instant mathematical resolution and step-by-step scoring.
                      </p>
                    </div>

                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-sky-100 text-sky-800 border border-sky-300">
                      Live Playground
                    </span>
                  </div>

                  {/* Dynamic Inputs for Every Component & Instance */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {formulaComponents.map((comp) => (
                      <div
                        key={comp.id}
                        className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-xs font-black text-slate-900">
                            {comp.name} ({comp.count} Instances conducted)
                          </span>
                          <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            Contributes /{comp.scaledMaxMarks} Marks
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Array.from({ length: comp.count }).map((_, instIdx) => {
                            const val = formulaTestInputs[comp.id]?.[instIdx] ?? '';
                            return (
                              <div key={instIdx} className="space-y-1">
                                <label className="block text-[10px] font-bold text-slate-500">
                                  {comp.name.includes('Mid') ? `Mid ${instIdx + 1}` : `${comp.code} ${instIdx + 1}`}
                                </label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={comp.maxMarksPerInstance}
                                    value={val}
                                    onChange={(e) => handleFormulaTestInputChange(comp.id, instIdx, e.target.value)}
                                    placeholder="Score"
                                    className="w-full px-2 py-1 rounded border border-slate-300 text-xs font-bold text-slate-900 text-center outline-none focus:border-indigo-500"
                                  />
                                  <span className="text-slate-400 text-xs font-bold">/{comp.maxMarksPerInstance}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* LIVE REAL-TIME CALCULATION RESULTS CARD */}
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-200/60 pb-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
                          Evaluated Live Outcome
                        </span>
                        <h4 className="text-base font-black text-slate-900 mt-0.5 flex items-center gap-2">
                          <span>Final Total Internal Score:</span>
                          <span className="text-indigo-900 font-mono text-lg">
                            {formulaPlaygroundResult.finalMarks} / {formulaPlaygroundResult.targetMax} Marks
                          </span>
                          <span
                            className={`text-xs font-black px-2.5 py-0.5 rounded border shadow-2xs ${
                              formulaPlaygroundResult.isPass
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {formulaPlaygroundResult.isPass ? 'PASSED INTERNAL' : 'FAILED INTERNAL'}
                          </span>
                        </h4>
                      </div>

                      <div className="text-right text-xs">
                        <span className="text-slate-500 font-semibold">Passing Threshold:</span>
                        <p className="font-mono font-bold text-slate-800">
                          ≥ {formulaPlaygroundResult.minPass} Marks ({formulaPlaygroundResult.minPassPct}%)
                        </p>
                      </div>
                    </div>

                    {/* Step-by-Step Breakdown for Each Component */}
                    <div className="space-y-1.5 text-xs font-mono">
                      {formulaPlaygroundResult.breakdown.map((b) => (
                        <div
                          key={b.componentId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded bg-white border border-slate-200 gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{b.name}:</span>
                            <span className="text-slate-600 text-[11px]">{b.step}</span>
                          </div>
                          <span className="font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-right">
                            {b.scaledScore.toFixed(2)} / {b.scaledMax}M
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* STEP 4: SAVE ACTION */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void handleSaveFormulaFromPlayground()}
                    disabled={savingFormula}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-2 shadow-xs cursor-pointer px-6"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {savingFormula ? 'Saving Custom Formula…' : 'Save Custom Formula to Target Scope'}
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 4: AUDIT HISTORY & CHANGE LOG */}
      {activeMainTab === 'history' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Assessment Schemes Revision History & Audit Trail"
              description="Chronological log of all modifications made to academic regulation assessment formulas, pass cutoffs, and scheme configurations with 'From ➔ To' parameter comparisons."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadHistory()}
                  disabled={loadingHistory}
                >
                  {loadingHistory ? 'Refreshing…' : 'Refresh Audit Log'}
                </Button>
              }
            />
            <CardBody>
              <div className="space-y-6">
                {/* Stats Summary Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                    <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Total Revisions</span>
                    <p className="text-2xl font-black text-slate-900 mt-0.5">{allHistoryLogs.length}</p>
                    <p className="text-[11px] text-slate-500 mt-1">Logged configuration changes</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-sky-100 bg-sky-50/50">
                    <span className="text-[10px] font-bold uppercase text-sky-800 tracking-wider">Updates</span>
                    <p className="text-2xl font-black text-sky-900 mt-0.5">
                      {allHistoryLogs.filter((l) => l.action === 'UPDATED').length}
                    </p>
                    <p className="text-[11px] text-sky-700 mt-1">Scheme modifications</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/50">
                    <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider">Creations</span>
                    <p className="text-2xl font-black text-emerald-900 mt-0.5">
                      {allHistoryLogs.filter((l) => l.action === 'CREATED').length}
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-1">New regulation schemes</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/50">
                    <span className="text-[10px] font-bold uppercase text-amber-800 tracking-wider">Resets</span>
                    <p className="text-2xl font-black text-amber-900 mt-0.5">
                      {allHistoryLogs.filter((l) => l.action === 'RESET_TO_DEFAULT').length}
                    </p>
                    <p className="text-[11px] text-amber-700 mt-1">Reverted to Baseline</p>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <select
                      value={historyRegulationFilter}
                      onChange={(e) => setHistoryRegulationFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-lg text-xs bg-white border border-slate-300 font-semibold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="ALL">All Regulations</option>
                      <option value="GLOBAL_DEFAULT">GLOBAL_DEFAULT (Baseline)</option>
                      {data?.regulations.map((r) => (
                        <option key={r.regulationCode} value={r.regulationCode}>
                          {r.regulationCode} — {r.regulationName || 'Regulation'}
                        </option>
                      ))}
                    </select>

                    <div className="inline-flex items-center p-0.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold">
                      {(['ALL', 'UPDATED', 'CREATED', 'RESET_TO_DEFAULT'] as const).map((act) => (
                        <button
                          key={act}
                          type="button"
                          onClick={() => setHistoryActionFilter(act)}
                          className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                            historyActionFilter === act
                              ? 'bg-sky-600 text-white shadow-2xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {act === 'ALL' ? 'All Actions' : act === 'UPDATED' ? 'Updates' : act === 'CREATED' ? 'Creations' : 'Resets'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="w-full md:w-80">
                    <input
                      type="text"
                      placeholder="Search by user, email, regulation, remarks..."
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg text-xs bg-white border border-slate-300 text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* Audit List */}
                {loadingHistory ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600 mb-2"></div>
                    <p>Loading historical audit records…</p>
                  </div>
                ) : filteredHistoryLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm rounded-xl border border-dashed border-slate-200 p-8 space-y-1">
                    <p className="font-bold text-slate-800 text-base">No audit history entries found</p>
                    <p className="text-xs text-slate-400">Modifications to regulation and course schemes will be recorded here.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredHistoryLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-900 border border-sky-300">
                              {log.regulationCode}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                log.action === 'CREATED'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : log.action === 'RESET_TO_DEFAULT'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-sky-100 text-sky-800 border border-sky-300'
                              }`}
                            >
                              {log.action}
                            </span>
                            {log.remarks && <span className="text-xs text-slate-600 font-medium">{log.remarks}</span>}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {log.formattedDate || log.createdAt} · By {log.changedByName || log.changedByEmail || 'Admin'}
                          </span>
                        </div>

                        {/* Changes Diff */}
                        {Array.isArray(log.changes) && log.changes.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 text-xs">
                            {log.changes.map((ch, idx) => (
                              <div key={idx} className="p-2 rounded bg-slate-50 border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-500 uppercase block">{ch.label}</span>
                                <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
                                  <span className="text-rose-600 line-through">{String(ch.from ?? 'None')}</span>
                                  <span className="text-slate-400">➔</span>
                                  <span className="text-emerald-700 font-bold">{String(ch.to ?? 'None')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* FORMULA CONFIGURATION MODAL (SIMPLE, INTUITIVE, COMPREHENSIVE) */}
      <Dialog
        open={isModalOpen}
        onClose={() => !saving && setIsModalOpen(false)}
        title={
          formYearOfStudy
            ? `Configure Marks Scheme: Year ${formYearOfStudy} (${formCourseName || 'Course'}) — ${editingItem?.regulationCode}`
            : formCourseId
            ? `Configure Marks Scheme: ${formCourseName || 'Course'} Default — ${editingItem?.regulationCode}`
            : editingItem?.regulationCode === 'GLOBAL_DEFAULT'
            ? 'Configure Global Standard Baseline'
            : `Configure Regulation Default: ${editingItem?.regulationCode || 'Regulation'}`
        }
        size="4xl"
        className="max-w-[76rem]"
      >
        <form onSubmit={handleSaveScheme} className="space-y-6">
          {/* TOP CONTEXT & SCOPE SELECTOR */}
          <div className="p-4 rounded-xl border border-sky-200 bg-linear-to-r from-sky-50 via-white to-indigo-50/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">Target Configuration Scope</span>
                <h4 className="text-sm font-black text-slate-900 mt-0.5">
                  {formYearOfStudy
                    ? `Year-Specific Setup: ${formCourseName || 'Course'} ➔ Year ${formYearOfStudy} of Study`
                    : formCourseId
                    ? `Course-Wide Default Setup: ${formCourseName || 'Course'} (All Years)`
                    : `${editingItem?.regulationCode} Regulation-Wide Baseline`}
                </h4>
              </div>

              {/* Scope Selection Controls */}
              {editingItem?.regulationCode !== 'GLOBAL_DEFAULT' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Course Scope</label>
                    <select
                      value={formCourseId ? String(formCourseId) : ''}
                      onChange={(e) => {
                        const cId = e.target.value ? parseInt(e.target.value, 10) : null;
                        setFormCourseId(cId);
                        const cObj = editingCourses.find((x) => x.courseId === cId);
                        setFormCourseName(cObj ? cObj.courseName : '');
                        setFormYearOfStudy(null);
                      }}
                      className="px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-white font-semibold text-slate-800"
                    >
                      <option value="">All Courses (Regulation Default)</option>
                      {editingCourses.map((c) => (
                        <option key={c.courseId} value={String(c.courseId)}>
                          {c.courseName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Year Scope</label>
                    <select
                      value={formYearOfStudy ? String(formYearOfStudy) : ''}
                      onChange={(e) => {
                        setFormYearOfStudy(e.target.value ? parseInt(e.target.value, 10) : null);
                      }}
                      disabled={!formCourseId}
                      className="px-2.5 py-1 text-xs rounded-md border border-slate-300 bg-white font-semibold text-slate-800 disabled:opacity-50"
                    >
                      <option value="">All Years of Course (Course Default)</option>
                      {editingYears.map((y) => (
                        <option key={y.yearOfStudy} value={String(y.yearOfStudy)}>
                          Year {y.yearOfStudy} {y.isCustomized ? '★ (Custom Override)' : '(Inherited)'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 1: CIE INTERNALS & CUSTOM FORMULA BUILDER */}
          <div className="p-4 rounded-xl border border-indigo-200 bg-linear-to-b from-indigo-50/40 via-white to-sky-50/20 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                <span>✨</span> 1. Continuous Internal Evaluation (CIE) — Custom Assessment Formula Builder
              </h4>
              <span className="text-xs font-black text-indigo-900 font-mono">/{formMaxInternal} Marks Scale</span>
            </div>

            <div className="space-y-4 p-4 rounded-xl bg-white border border-indigo-200 shadow-2xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>🧩</span> Evaluation Components & Aggregation Rules
                  </h5>
                  <p className="text-[11px] text-slate-500">
                    Dynamically configure assessments (e.g. 3 Mids, 2 Assignments, Quizzes, Attendance) and scaled contributions.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAddComponent}
                  className="text-xs font-bold"
                >
                  + Add Component
                </Button>
              </div>

              {/* Components List */}
              <div className="space-y-3">
                {formComponents.map((comp, idx) => (
                  <div
                    key={comp.id || idx}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={comp.name}
                          onChange={(e) => handleUpdateComponent(idx, 'name', e.target.value)}
                          placeholder="Component Name (e.g. Mid Examinations)"
                          className="font-bold text-xs text-slate-900 bg-white px-2 py-1 rounded border border-slate-300 flex-1 outline-none"
                        />
                        <input
                          type="text"
                          value={comp.code}
                          onChange={(e) => handleUpdateComponent(idx, 'code', e.target.value.toUpperCase())}
                          placeholder="Code"
                          className="font-mono text-xs font-bold text-slate-600 bg-white px-2 py-1 rounded border border-slate-300 w-24 outline-none"
                        />
                      </div>
                      {formComponents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComponent(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                          title="Delete Component"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Instances</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={comp.count}
                          onChange={(e) => handleUpdateComponent(idx, 'count', parseInt(e.target.value, 10) || 1)}
                          className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400">e.g. 3 Mids</span>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Marks / Instance</label>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={comp.maxMarksPerInstance}
                          onChange={(e) => handleUpdateComponent(idx, 'maxMarksPerInstance', parseFloat(e.target.value) || 30)}
                          className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-800"
                        />
                        <span className="text-[10px] text-slate-400">Paper Max</span>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">Rule</label>
                        <select
                          value={comp.aggregationRule}
                          onChange={(e) => handleUpdateComponent(idx, 'aggregationRule', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-800 text-[11px]"
                        >
                          <option value="AVERAGE_ALL">Average of All Conducted</option>
                          <option value="BEST_N">Best N of Total</option>
                          <option value="WEIGHTED">Weighted (80:20)</option>
                          <option value="SUM_ALL">Sum of Scores</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-indigo-700 uppercase">Scaled Max</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={comp.scaledMaxMarks}
                          onChange={(e) => handleUpdateComponent(idx, 'scaledMaxMarks', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 rounded border border-indigo-300 bg-white font-black text-indigo-900"
                        />
                        <span className="text-[10px] text-indigo-600 font-bold">Contribution</span>
                      </div>
                    </div>

                    {comp.aggregationRule === 'BEST_N' && (
                      <div className="flex items-center gap-2 pt-1 text-xs">
                        <span className="text-[11px] font-semibold text-slate-600">Take Top:</span>
                        <input
                          type="number"
                          min={1}
                          max={comp.count}
                          value={comp.bestCount || 2}
                          onChange={(e) => handleUpdateComponent(idx, 'bestCount', parseInt(e.target.value, 10) || 1)}
                          className="w-16 px-2 py-0.5 rounded border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                        />
                        <span className="text-[11px] text-slate-500">best scores among {comp.count} conducted</span>
                      </div>
                    )}

                    {comp.aggregationRule === 'WEIGHTED' && (
                      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600">Best Weight %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={comp.bestWeightage ?? 80}
                            onChange={(e) => {
                              const b = parseFloat(e.target.value) || 0;
                              handleUpdateComponent(idx, 'bestWeightage', b);
                              handleUpdateComponent(idx, 'otherWeightage', Math.max(0, 100 - b));
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600">Second-Best Weight %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={comp.otherWeightage ?? 20}
                            onChange={(e) => handleUpdateComponent(idx, 'otherWeightage', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 rounded border border-slate-300 bg-white font-bold text-slate-900 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-slate-600">
                    Total Scaled: <strong className="text-indigo-950 font-black">{formComponentsScaledSum}M</strong>
                  </span>
                  {formComponentsScaledSum !== parseFloat(formMaxInternal) && (
                    <button
                      type="button"
                      onClick={() => handleMaxInternalChange(String(formComponentsScaledSum))}
                      className="px-2.5 py-1 rounded bg-indigo-50 border border-indigo-300 text-indigo-900 text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      Sync Internal Max ({formComponentsScaledSum}M)
                    </button>
                  )}
                </div>
              </div>

              {/* Formula Preview Badge */}
              <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 text-xs font-mono font-bold text-indigo-950">
                <span className="text-[10px] font-black uppercase text-indigo-800 tracking-wider block font-sans">
                  Live Formula Preview:
                </span>
                {generateFormulaPreview(formComponents, parseFloat(formMaxInternal) || 40)}
              </div>
            </div>

            {/* Internal Max & Dynamic Targeting Percentage */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <Input
                label="Maximum Internal Marks (CIE Total)"
                type="number"
                min={1}
                max={100}
                value={formMaxInternal}
                onChange={(e) => handleMaxInternalChange(e.target.value)}
                hint="Typically 30 or 40"
              />
              <Input
                label="Internal Pass Target % (Completely Dynamic)"
                type="number"
                min={0}
                max={100}
                step="any"
                value={formMinPassInternalPct}
                onChange={(e) => handleInternalPassPctChange(e.target.value)}
                hint="e.g. 40% target → auto-calculates cutoff marks"
              />
              <Input
                label="Internal Minimum Pass Cutoff Marks"
                type="number"
                min={0}
                max={100}
                step="any"
                value={formMinPassInternal}
                onChange={(e) => handleInternalMarksChange(e.target.value)}
                hint="Changing marks auto-updates target %"
              />
            </div>
          </div>

          {/* SECTION 2: EXTERNAL SEE & DYNAMIC TARGETING */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                <span>📗</span> 2. Semester End Examination (SEE Setup) — Dynamic Targeting
              </h4>
              <span className="text-xs font-black text-emerald-900 font-mono">/{formMaxExternal} Marks Scale</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <Input
                label="Maximum External Marks (SEE Total)"
                type="number"
                min={1}
                max={100}
                value={formMaxExternal}
                onChange={(e) => handleMaxExternalChange(e.target.value)}
                hint="70 (when Int=30) or 60 (when Int=40)"
              />
              <Input
                label="External Pass Target % (Completely Dynamic)"
                type="number"
                min={0}
                max={100}
                step="any"
                value={formMinPassExternalPct}
                onChange={(e) => handleExternalPassPctChange(e.target.value)}
                hint="e.g. 35% target → auto-calculates cutoff marks"
              />
              <Input
                label="External Minimum Pass Cutoff Marks"
                type="number"
                min={0}
                max={100}
                step="any"
                value={formMinPassExternal}
                onChange={(e) => handleExternalMarksChange(e.target.value)}
                hint="Changing marks auto-updates target %"
              />
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-100 space-y-2">
              <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formRequireExternalPass}
                  onChange={(e) => setFormRequireExternalPass(e.target.checked)}
                  className="rounded border-slate-300 mt-0.5"
                />
                <div>
                  <span>Mandatory External Minimum Pass Requirement</span>
                  <p className="text-[11px] text-slate-500 font-normal">
                    Student MUST score ≥ {formMinPassExternal} marks ({formMinPassExternalPct}% target) in external exam to pass the course.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* SECTION 3: TOTAL COURSE MARKS & AGGREGATE STRATEGY */}
          <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/20 space-y-4">
            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                <span>📙</span> 3. Total Course Marks & Aggregate Targeting (Internal + External = Total)
              </h4>
              <span className="text-xs font-black text-purple-900 font-mono">/{currentCalculatedSum} Total Marks</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Course Total Scale</label>
                <div className="w-full px-3 py-2 rounded-lg text-xs bg-slate-100 border border-slate-300 font-black text-slate-900 font-mono">
                  {currentCalculatedSum} Total Marks ({formMaxInternal} Int + {formMaxExternal} Ext)
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Strict sum of CIE + SEE</p>
              </div>

              <Input
                label="Total Pass Target % (Completely Dynamic)"
                type="number"
                min={0}
                max={100}
                step="any"
                value={formMinPassTotalPct}
                onChange={(e) => handleTotalPassPctChange(e.target.value)}
                hint="Typically 40% aggregate target"
              />

              <Input
                label="Min Total Pass Cutoff Marks"
                type="number"
                min={0}
                max={100}
                step="any"
                value={formMinPassTotal}
                onChange={(e) => handleTotalMarksChange(e.target.value)}
                hint="Changing marks auto-updates target %"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Evaluation Pass Strategy
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {PASS_STRATEGIES.map((s) => (
                  <label
                    key={s.value}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-all ${
                      formPassStrategy === s.value
                        ? 'border-purple-500 bg-white shadow-2xs ring-2 ring-purple-300'
                        : 'border-slate-200 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="passStrategy"
                      checked={formPassStrategy === s.value}
                      onChange={() => setFormPassStrategy(s.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900">{s.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{s.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={formRequireInternalPass}
                onChange={(e) => setFormRequireInternalPass(e.target.checked)}
                className="rounded border-slate-300"
              />
              Strict Three-Way Requirement: Candidate must also separately achieve ≥ Internal Pass Cutoff ({formMinPassInternal} marks)
            </label>

            {/* Live Data Flow Preview Box */}
            <div className="p-3.5 rounded-xl border border-indigo-200 bg-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <span>⚡</span> Live Data Flow Preview (Dynamic Sample Calculation):
                </span>
                <span
                  className={`text-[11px] font-black px-2.5 py-0.5 rounded border ${
                    previewDataFlow.overallPass
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border-rose-300'
                  }`}
                >
                  {previewDataFlow.overallPass ? 'SAMPLE CANDIDATE: PASS' : 'SAMPLE CANDIDATE: FAIL'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1 text-xs">
                <div className="p-2.5 rounded-lg bg-sky-50/60 border border-sky-100 space-y-1">
                  <span className="text-[10px] font-bold text-sky-800 uppercase">1. CIE Result ({formNumInternals} Mids)</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {previewDataFlow.sampleIntScore} <span className="text-xs text-slate-500">/{formMaxInternal}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Cutoff: ≥ {formMinPassInternal} ({formMinPassInternalPct}%) ➔{' '}
                    <strong className={previewDataFlow.intPassed ? 'text-emerald-700' : 'text-rose-700'}>
                      {previewDataFlow.intPassed ? 'Target Achieved' : 'Below Target'}
                    </strong>
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase">2. SEE Result</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {previewDataFlow.sampleExt} <span className="text-xs text-slate-500">/{formMaxExternal}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Cutoff: ≥ {formMinPassExternal} ({formMinPassExternalPct}%) ➔{' '}
                    <strong className={previewDataFlow.extPassed ? 'text-emerald-700' : 'text-rose-700'}>
                      {previewDataFlow.extPassed ? 'Target Achieved' : 'Below Target'}
                    </strong>
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-50/60 border border-purple-100 space-y-1">
                  <span className="text-[10px] font-bold text-purple-800 uppercase">3. Total Aggregate & Grade</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {previewDataFlow.sampleTotal} <span className="text-xs text-slate-500">/{currentCalculatedSum}</span> ({previewDataFlow.pct}%)
                  </p>
                  <p className="text-[10px] text-purple-900 font-semibold">
                    Awarded: <strong className="text-purple-800">{previewDataFlow.grade} ({previewDataFlow.gradeDescription}) · {previewDataFlow.gradePoints} GP</strong>
                    {!previewDataFlow.overallPass && ` · ${previewDataFlow.reason}`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <Input
              label="Scheme Remarks / Academic Council Reference"
              value={formRemarks}
              onChange={(e) => setFormRemarks(e.target.value)}
              placeholder="e.g. Approved Academic Scheme for Course/Year"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div>
              {editingItem && (
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenIndividualHistory(editingItem.regulationCode, editingItem.regulationName);
                  }}
                  className="text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-3 py-1.5 font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  View Revision History
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving Scheme…' : `Save Scheme (${formMaxInternal} Int + ${formMaxExternal} Ext = ${currentCalculatedSum} Total)`}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* INDIVIDUAL REVISION HISTORY MODAL */}
      <Dialog
        open={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={`Audit History & Change Log: ${selectedHistoryRegulation?.code || 'Regulation'}`}
        size="4xl"
        className="max-w-[72rem]"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl border border-indigo-200 bg-linear-to-r from-indigo-50/70 via-sky-50/50 to-white flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>🕒</span> Change History for:
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-900 font-black">
                  {selectedHistoryRegulation?.code}
                </span>
                {selectedHistoryRegulation?.name && (
                  <span className="text-slate-600 font-medium">({selectedHistoryRegulation.name})</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Chronological log of modifications showing parameter diffs from ➔ to.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-900 border border-indigo-300">
              {individualHistoryLogs.length} Revisions Logged
            </span>
          </div>

          {loadingIndividualHistory ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 mb-2"></div>
              <p>Fetching revision history…</p>
            </div>
          ) : individualHistoryLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm rounded-xl border border-dashed border-slate-200 p-8 space-y-1">
              <p className="font-bold text-slate-800 text-base">No history records found</p>
              <p className="text-xs text-slate-400">Any updates to this regulation's schemes will be displayed here.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {individualHistoryLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.action === 'CREATED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : log.action === 'RESET_TO_DEFAULT'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-sky-100 text-sky-800 border border-sky-300'
                        }`}
                      >
                        {log.action}
                      </span>
                      {log.remarks && <span className="text-xs text-slate-700 font-semibold">{log.remarks}</span>}
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {log.formattedDate || log.createdAt} · By {log.changedByName || log.changedByEmail || 'Admin'}
                    </span>
                  </div>

                  {Array.isArray(log.changes) && log.changes.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 text-xs">
                      {log.changes.map((ch, idx) => (
                        <div key={idx} className="p-2 rounded bg-slate-50 border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">{ch.label}</span>
                          <div className="flex items-center gap-1.5 mt-0.5 font-mono text-[11px]">
                            <span className="text-rose-600 line-through">{String(ch.from ?? 'None')}</span>
                            <span className="text-slate-400">➔</span>
                            <span className="text-emerald-700 font-bold">{String(ch.to ?? 'None')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
