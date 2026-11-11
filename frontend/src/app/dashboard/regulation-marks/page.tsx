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
  RegulationInternalSetting,
  RegulationInternalSettingsOverview,
  CalculationSimulationResult,
} from '@/types/regulation-internals';

const CALCULATION_METHODS: { value: CalculationMethod; label: string; description: string }[] = [
  {
    value: 'WEIGHTED_TWO_MIDS',
    label: 'Weighted: Best Mid + Second-Best Mid',
    description: 'Calculates internal marks strictly from the best and second-best mid exams (e.g. 80% / 20%).',
  },
  {
    value: 'AVERAGE_ALL_MIDS',
    label: 'Average of Both Mid Exams',
    description: 'Calculates the simple arithmetic average of both conducted mid examinations.',
  },
  {
    value: 'BEST_SINGLE_MID',
    label: 'Best Single Mid Only (100%)',
    description: 'Takes 100% of the single best score among mid examinations.',
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

interface StandardPreset {
  id: string;
  label: string;
  badge: string;
  internal: number;
  external: number;
  total: number;
  minPassInt: number;
  minPassExt: number;
  minPassExtPct: number;
  minPassTot: number;
  minPassTotPct: number;
  bestWeight: number;
  otherWeight: number;
  method: CalculationMethod;
  description: string;
}

const PRESET_TEMPLATES: StandardPreset[] = [
  {
    id: 'STANDARD_30_70',
    label: '30 Internal + 70 External (100 Total)',
    badge: 'Standard JNTU / University',
    internal: 30,
    external: 70,
    total: 100,
    minPassInt: 16,
    minPassExt: 25,
    minPassExtPct: 35,
    minPassTot: 40,
    minPassTotPct: 40,
    bestWeight: 80,
    otherWeight: 20,
    method: 'WEIGHTED_TWO_MIDS',
    description: 'Traditional JNTU R16/R19/R20: 30 Internal (80/20) + 70 External theory exam.',
  },
  {
    id: 'AUTONOMOUS_40_60',
    label: '40 Internal + 60 External (100 Total)',
    badge: 'Autonomous / R23 Scheme',
    internal: 40,
    external: 60,
    total: 100,
    minPassInt: 20,
    minPassExt: 21,
    minPassExtPct: 35,
    minPassTot: 40,
    minPassTotPct: 40,
    bestWeight: 75,
    otherWeight: 25,
    method: 'WEIGHTED_TWO_MIDS',
    description: 'Autonomous institutions where Internals are 40 marks and External theory paper is 60 marks.',
  },
  {
    id: 'ANNA_25_75',
    label: '25 Internal + 75 External (100 Total)',
    badge: 'State / Technical Board',
    internal: 25,
    external: 75,
    total: 100,
    minPassInt: 13,
    minPassExt: 26,
    minPassExtPct: 35,
    minPassTot: 40,
    minPassTotPct: 40,
    bestWeight: 80,
    otherWeight: 20,
    method: 'WEIGHTED_TWO_MIDS',
    description: 'Technical board scheme with 25 continuous assessment and 75 external paper.',
  },
  {
    id: 'PRACTICAL_50_50',
    label: '50 Internal + 50 External (100 Total)',
    badge: 'Laboratory / Practical Course',
    internal: 50,
    external: 50,
    total: 100,
    minPassInt: 25,
    minPassExt: 20,
    minPassExtPct: 40,
    minPassTot: 50,
    minPassTotPct: 50,
    bestWeight: 50,
    otherWeight: 50,
    method: 'AVERAGE_ALL_MIDS',
    description: 'Laboratory courses with continuous lab evaluation (50) and external practical exam (50).',
  },
];

export default function RegulationMarksPage() {
  const toast = useToast();
  const [activeMainTab, setActiveMainTab] = useState<'schemes' | 'simulator'>('schemes');
  const [schemeViewFilter, setSchemeViewFilter] = useState<'ALL' | 'INTERNAL' | 'EXTERNAL' | 'COMBO'>('ALL');

  const [data, setData] = useState<RegulationInternalSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Formula Editor Modal State
  const [editingItem, setEditingItem] = useState<RegulationInternalSetting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form Fields - Auto Balance Mode
  const [autoBalance100, setAutoBalance100] = useState(true);

  // Form Fields - Internal (CIE)
  const [formMethod, setFormMethod] = useState<CalculationMethod>('WEIGHTED_TWO_MIDS');
  const [formBestWeight, setFormBestWeight] = useState('80');
  const [formOtherWeight, setFormOtherWeight] = useState('20');
  const [formMaxInternal, setFormMaxInternal] = useState('30');
  const [formMinPassInternal, setFormMinPassInternal] = useState('16');
  const [formRounding, setFormRounding] = useState<RoundingRule>('ROUND_2_DECIMALS');

  // Form Fields - External (SEE)
  const [formMaxExternal, setFormMaxExternal] = useState('70');
  const [formMinPassExternal, setFormMinPassExternal] = useState('25');
  const [formMinPassExternalPct, setFormMinPassExternalPct] = useState('35');
  const [formRequireExternalPass, setFormRequireExternalPass] = useState(true);

  // Form Fields - Combo & Aggregate
  const [formMaxTotal, setFormMaxTotal] = useState('100');
  const [formMinPassTotal, setFormMinPassTotal] = useState('40');
  const [formMinPassTotalPct, setFormMinPassTotalPct] = useState('40');
  const [formRequireInternalPass, setFormRequireInternalPass] = useState(false);
  const [formPassStrategy, setFormPassStrategy] = useState<PassStrategy>('EXTERNAL_AND_TOTAL');
  const [formRemarks, setFormRemarks] = useState('');

  // Simulator / Testing Workbench State
  const [testRegulationCode, setTestRegulationCode] = useState<string>('GLOBAL_DEFAULT');
  const [testMid1, setTestMid1] = useState('24');
  const [testMax1, setTestMax1] = useState('30');
  const [testAbsent1, setTestAbsent1] = useState(false);
  const [testMid2, setTestMid2] = useState('18');
  const [testMax2, setTestMax2] = useState('30');
  const [testAbsent2, setTestAbsent2] = useState(false);

  // External Exam Input for Simulator
  const [testExternalScore, setTestExternalScore] = useState('38');
  const [testExternalMax, setTestExternalMax] = useState('70');
  const [testExternalAbsent, setTestExternalAbsent] = useState(false);

  const [testServerResult, setTestServerResult] = useState<CalculationSimulationResult | null>(null);
  const [testingServer, setTestingServer] = useState(false);

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

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Derived current mathematical sum
  const currentInternalNum = parseFloat(formMaxInternal) || 0;
  const currentExternalNum = parseFloat(formMaxExternal) || 0;
  const currentCalculatedSum = currentInternalNum + currentExternalNum;
  const currentTotalNum = parseFloat(formMaxTotal) || currentCalculatedSum;
  const isSumMismatch = Math.abs(currentCalculatedSum - currentTotalNum) > 0.01;

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

    // Sample student scores: 85% on Mid 1, 65% on Mid 2, 65% on External
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
    if (overallPass) {
      if (pct >= 90) grade = 'O (Outstanding)';
      else if (pct >= 80) grade = 'A+ (Excellent)';
      else if (pct >= 70) grade = 'A (Very Good)';
      else if (pct >= 60) grade = 'B+ (Good)';
      else if (pct >= 50) grade = 'B (Above Average)';
      else if (pct >= 40) grade = 'C (Pass)';
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
  ]);

  // Open modal to configure marks rules
  const handleOpenEdit = (item: RegulationInternalSetting) => {
    setEditingItem(item);
    const itemInt = Number(item.maxInternalMarks ?? 30);
    const itemExt = Number(item.maxExternalMarks ?? 70);
    const itemTot = item.maxTotalMarks ? Number(item.maxTotalMarks) : itemInt + itemExt;

    // Detect if this regulation matches standard 100 total
    setAutoBalance100(itemTot === 100);

    // Internal
    setFormMethod(item.calculationMethod || 'WEIGHTED_TWO_MIDS');
    setFormBestWeight(String(item.bestMidWeightage ?? 80));
    setFormOtherWeight(String(item.otherMidWeightage ?? 20));
    setFormMaxInternal(String(itemInt));
    setFormMinPassInternal(String(item.minPassMarks ?? 16));
    setFormRounding(item.roundingRule || 'ROUND_2_DECIMALS');

    // External
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
    setIsModalOpen(true);
  };

  // One-click preset template applier
  const handleApplyPreset = (preset: StandardPreset) => {
    setFormMaxInternal(String(preset.internal));
    setFormMaxExternal(String(preset.external));
    setFormMaxTotal(String(preset.total));
    setFormMinPassInternal(String(preset.minPassInt));
    setFormMinPassExternal(String(preset.minPassExt));
    setFormMinPassExternalPct(String(preset.minPassExtPct));
    setFormMinPassTotal(String(preset.minPassTot));
    setFormMinPassTotalPct(String(preset.minPassTotPct));
    setFormBestWeight(String(preset.bestWeight));
    setFormOtherWeight(String(preset.otherWeight));
    setFormMethod(preset.method);
    setAutoBalance100(preset.total === 100);
    toast.push(`Applied "${preset.label}" scheme`, 'info');
  };

  // Smart Rebalance: Internal Change
  const handleMaxInternalChange = (val: string) => {
    setFormMaxInternal(val);
    const numInt = parseFloat(val);
    if (!isNaN(numInt)) {
      if (autoBalance100 && numInt <= 100) {
        const balancedExt = Math.max(0, 100 - numInt);
        setFormMaxExternal(String(balancedExt));
        setFormMaxTotal('100');
        // Auto-update external 35% pass mark
        const defaultExtPass = Math.round(balancedExt * 0.35);
        setFormMinPassExternal(String(defaultExtPass));
      } else {
        setFormMaxTotal(String(numInt + (parseFloat(formMaxExternal) || 0)));
      }
    }
  };

  // Smart Rebalance: External Change
  const handleMaxExternalChange = (val: string) => {
    setFormMaxExternal(val);
    const numExt = parseFloat(val);
    if (!isNaN(numExt)) {
      if (autoBalance100 && numExt <= 100) {
        const balancedInt = Math.max(0, 100 - numExt);
        setFormMaxInternal(String(balancedInt));
        setFormMaxTotal('100');
        const defaultExtPass = Math.round(numExt * 0.35);
        setFormMinPassExternal(String(defaultExtPass));
      } else {
        setFormMaxTotal(String((parseFloat(formMaxInternal) || 0) + numExt));
        const defaultExtPass = Math.round(numExt * 0.35);
        setFormMinPassExternal(String(defaultExtPass));
      }
    }
  };

  const handleBestWeightChange = (val: string) => {
    setFormBestWeight(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setFormOtherWeight(String(Math.max(0, 100 - num)));
    }
  };

  // Reset custom regulation rules back to global default
  const handleResetToDefault = async (item: RegulationInternalSetting) => {
    if (!item.id) return;
    if (!window.confirm(`Are you sure you want to reset ${item.regulationCode} to inherit the Global Default marks setup?`)) {
      return;
    }

    try {
      await api.resetRegulationMarksSetting(item.id);
      toast.push(`Marks setup for ${item.regulationCode} reset to Global Default`, 'success');
      void loadSettings();
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

    if (formMethod === 'WEIGHTED_TWO_MIDS') {
      if (isNaN(bestWeight) || isNaN(otherWeight) || Math.abs(bestWeight + otherWeight - 100) > 0.01) {
        toast.push(`Best mid and second mid weightage must sum to 100% (currently ${bestWeight + otherWeight}%)`, 'warning');
        return;
      }
    }

    try {
      setSaving(true);
      await api.saveRegulationMarksSetting({
        id: editingItem.id || undefined,
        regulationId: editingItem.regulationId,
        regulationCode: editingItem.regulationCode,
        regulationName: editingItem.regulationName,
        // Internal
        calculationMethod: formMethod,
        bestMidWeightage: formMethod === 'BEST_SINGLE_MID' ? 100 : formMethod === 'AVERAGE_ALL_MIDS' ? 50 : bestWeight,
        otherMidWeightage: formMethod === 'BEST_SINGLE_MID' ? 0 : formMethod === 'AVERAGE_ALL_MIDS' ? 50 : otherWeight,
        maxInternalMarks: maxInt,
        minPassMarks: minPassInt,
        minMidsRequired: formMethod === 'BEST_SINGLE_MID' ? 1 : 2,
        roundingRule: formRounding,
        // External
        maxExternalMarks: maxExt,
        minExternalPassMarks: minPassExt,
        minExternalPassPercentage: parseFloat(formMinPassExternalPct) || (minPassExt / maxExt) * 100,
        requireExternalPass: formRequireExternalPass,
        // Combo (Strictly enforces Total = Internal + External)
        maxTotalMarks: exactSum,
        minTotalPassMarks: minPassTot,
        minTotalPassPercentage: parseFloat(formMinPassTotalPct) || (minPassTot / exactSum) * 100,
        requireInternalPass: formRequireInternalPass,
        requireTotalPass: true,
        passStrategy: formPassStrategy,
        remarks: formRemarks.trim() || null,
      });

      toast.push(
        editingItem.regulationCode === 'GLOBAL_DEFAULT'
          ? 'Global Default marks setup saved successfully'
          : `Marks setup for ${editingItem.regulationCode} saved successfully (${maxInt} Internal + ${maxExt} External = ${exactSum} Total)`,
        'success',
      );
      setIsModalOpen(false);
      void loadSettings();
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
        (r.regulationName && r.regulationName.toLowerCase().includes(q)),
    );
  }, [data, searchQuery]);

  // Active regulation for testing
  const activeTestFormula = useMemo(() => {
    if (!data) return null;
    if (testRegulationCode === 'GLOBAL_DEFAULT') return data.globalDefault;
    const matched = data.regulations.find((r) => r.regulationCode === testRegulationCode);
    return matched || data.globalDefault;
  }, [data, testRegulationCode]);

  // Synchronize input scale limits when tested regulation changes
  useEffect(() => {
    if (activeTestFormula) {
      const maxIntStr = String(activeTestFormula.maxInternalMarks ?? 30);
      const maxExtStr = String(activeTestFormula.maxExternalMarks ?? 70);
      setTestMax1(maxIntStr);
      setTestMax2(maxIntStr);
      setTestExternalMax(maxExtStr);
    }
  }, [activeTestFormula]);

  // Execute full calculation simulation (Internal + External + Combo)
  const handleRunSimulation = useCallback(async () => {
    if (!activeTestFormula) return;

    const targetMaxInt = activeTestFormula.maxInternalMarks ?? 30;
    const isSingleMid = activeTestFormula.calculationMethod === 'BEST_SINGLE_MID';
    const midEntries: { marks: number; maxMarks: number; isAbsent: boolean }[] = [];

    // Mid 1
    if (testAbsent1) {
      midEntries.push({ marks: 0, maxMarks: parseFloat(testMax1) || targetMaxInt, isAbsent: true });
    } else if (testMid1 !== '' && !isNaN(parseFloat(testMid1))) {
      midEntries.push({ marks: parseFloat(testMid1), maxMarks: parseFloat(testMax1) || targetMaxInt, isAbsent: false });
    }

    // Mid 2
    if (!isSingleMid) {
      if (testAbsent2) {
        midEntries.push({ marks: 0, maxMarks: parseFloat(testMax2) || targetMaxInt, isAbsent: true });
      } else if (testMid2 !== '' && !isNaN(parseFloat(testMid2))) {
        midEntries.push({ marks: parseFloat(testMid2), maxMarks: parseFloat(testMax2) || targetMaxInt, isAbsent: false });
      }
    }

    try {
      setTestingServer(true);
      const res = await api.simulateRegulationMarksCalculation({
        midEntries,
        calculationMethod: activeTestFormula.calculationMethod,
        bestMidWeightage: activeTestFormula.bestMidWeightage,
        otherMidWeightage: activeTestFormula.otherMidWeightage,
        maxInternalMarks: activeTestFormula.maxInternalMarks,
        minPassMarks: activeTestFormula.minPassMarks,
        minMidsRequired: isSingleMid ? 1 : 2,
        roundingRule: activeTestFormula.roundingRule,
        // External inputs
        externalMarks: testExternalAbsent ? 0 : parseFloat(testExternalScore) || 0,
        externalAbsent: testExternalAbsent,
        maxExternalMarks: activeTestFormula.maxExternalMarks ?? 70,
        minExternalPassMarks: activeTestFormula.minExternalPassMarks ?? 25,
        minExternalPassPercentage: activeTestFormula.minExternalPassPercentage ?? 35,
        // Combo inputs
        maxTotalMarks: activeTestFormula.maxTotalMarks ?? 100,
        minTotalPassMarks: activeTestFormula.minTotalPassMarks ?? 40,
        minTotalPassPercentage: activeTestFormula.minTotalPassPercentage ?? 40,
        passStrategy: activeTestFormula.passStrategy ?? 'EXTERNAL_AND_TOTAL',
        requireInternalPass: activeTestFormula.requireInternalPass,
      });
      setTestServerResult(res);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Simulation failed', 'danger');
    } finally {
      setTestingServer(false);
    }
  }, [
    activeTestFormula,
    testMid1,
    testMax1,
    testAbsent1,
    testMid2,
    testMax2,
    testAbsent2,
    testExternalScore,
    testExternalMax,
    testExternalAbsent,
    toast,
  ]);

  useEffect(() => {
    if (activeMainTab === 'simulator' && activeTestFormula) {
      void handleRunSimulation();
    }
  }, [activeMainTab, activeTestFormula, handleRunSimulation]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Regulation Marks & Assessment Setup"
        description="Configure dynamic marks calculation schemes and pass criteria: Continuous Internal Evaluation (CIE), Semester End Examination (SEE), and Combined Aggregate Pass Rules."
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
          Regulation Marks Schemes
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('simulator')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeMainTab === 'simulator'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Marks Testing & Simulation Workbench
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
                      Regulations without custom overrides inherit these proportions: {data.globalDefault.maxInternalMarks} Internal + {data.globalDefault.maxExternalMarks} External = {data.globalDefault.maxTotalMarks} Total Marks.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2">
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">1. Internal CIE</span>
                      <span className="text-xs font-bold text-slate-900">/{data.globalDefault.maxInternalMarks} Marks</span>
                    </div>
                    <p className="text-xs font-semibold text-slate-800">
                      {data.globalDefault.calculationMethod === 'WEIGHTED_TWO_MIDS'
                        ? `${data.globalDefault.bestMidWeightage}% Best + ${data.globalDefault.otherMidWeightage}% Second Mid`
                        : data.globalDefault.calculationMethod === 'AVERAGE_ALL_MIDS'
                        ? 'Average of Both Mids'
                        : 'Best Single Mid'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Internal Pass Cutoff: <strong className="text-emerald-700">≥ {data.globalDefault.minPassMarks}</strong> · Rule: {data.globalDefault.roundingRule}
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

          {/* Regulations Table Card */}
          <Card>
            <CardHeader
              title="Academic Regulations Schemes Catalog"
              description="Customize Internal (CIE), External (SEE), and Combined Aggregate assessment rules per academic regulation."
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
                      placeholder="Search regulations (R23, R20)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
              }
            />
            <CardBody>
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
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-semibold">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Regulation</th>
                        {(schemeViewFilter === 'ALL' || schemeViewFilter === 'INTERNAL') && (
                          <th className="px-4 py-3 font-semibold">Internal Setup (CIE)</th>
                        )}
                        {(schemeViewFilter === 'ALL' || schemeViewFilter === 'EXTERNAL') && (
                          <th className="px-4 py-3 font-semibold">External Setup (SEE)</th>
                        )}
                        {(schemeViewFilter === 'ALL' || schemeViewFilter === 'COMBO') && (
                          <th className="px-4 py-3 font-semibold">Combined / Total Pass Criteria</th>
                        )}
                        <th className="px-4 py-3 text-center font-semibold">Status / Source</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredRegulations.map((reg) => (
                        <tr key={reg.regulationCode} className="hover:bg-slate-50/70 transition-colors">
                          {/* Regulation Code */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-200">
                                {reg.regulationCode}
                              </span>
                              <span className="font-semibold text-slate-800">{reg.regulationName}</span>
                            </div>
                            {reg.remarks && (
                              <p className="text-[11px] text-slate-500 mt-0.5 italic">{reg.remarks}</p>
                            )}
                          </td>

                          {/* Internal CIE Column */}
                          {(schemeViewFilter === 'ALL' || schemeViewFilter === 'INTERNAL') && (
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                {reg.calculationMethod === 'WEIGHTED_TWO_MIDS' ? (
                                  <span>
                                    <strong className="text-sky-700">{reg.bestMidWeightage}%</strong> Best +{' '}
                                    <strong className="text-slate-700">{reg.otherMidWeightage}%</strong> Second
                                  </span>
                                ) : reg.calculationMethod === 'AVERAGE_ALL_MIDS' ? (
                                  <span className="text-purple-800 font-medium">Average of Both Mids</span>
                                ) : (
                                  <span className="text-emerald-800 font-medium">Best Single Mid (100%)</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Scale: <strong>/{reg.maxInternalMarks}</strong> · Min Pass: <strong className="text-emerald-700">≥ {reg.minPassMarks}</strong>
                              </div>
                            </td>
                          )}

                          {/* External SEE Column */}
                          {(schemeViewFilter === 'ALL' || schemeViewFilter === 'EXTERNAL') && (
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                Min Pass: <strong className="text-emerald-700">≥ {reg.minExternalPassMarks}</strong> / {reg.maxExternalMarks} Marks
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Pass Threshold: <strong>{reg.minExternalPassPercentage}%</strong> {reg.requireExternalPass && '· Mandatory'}
                              </div>
                            </td>
                          )}

                          {/* Combined Total Column */}
                          {(schemeViewFilter === 'ALL' || schemeViewFilter === 'COMBO') && (
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                Total Pass: <strong className="text-purple-700">≥ {reg.minTotalPassMarks}</strong> / {reg.maxTotalMarks} Total ({reg.minTotalPassPercentage}%)
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Rule: <span className="font-mono text-[10px] text-slate-700">{reg.passStrategy}</span>
                              </div>
                            </td>
                          )}

                          {/* Status Badge */}
                          <td className="px-4 py-3 text-center">
                            {reg.isCustomized ? (
                              <Badge variant="success">Customized Scheme</Badge>
                            ) : (
                              <Badge variant="default">Inherited Default</Badge>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              {reg.isCustomized && (
                                <button
                                  type="button"
                                  onClick={() => void handleResetToDefault(reg)}
                                  className="text-xs text-rose-600 hover:text-rose-800 hover:underline px-2 py-1 font-medium transition-colors cursor-pointer"
                                  title="Reset back to inherit Global Default"
                                >
                                  Reset
                                </button>
                              )}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenEdit(reg)}
                              >
                                Configure Marks Scheme
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* TAB 2: COMPREHENSIVE MARKS TESTING & SIMULATOR */}
      {activeMainTab === 'simulator' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Comprehensive Marks Testing & Simulation Workbench"
              description="Input candidate test marks across Internal Mids (CIE) and Semester End Examination (SEE) to verify individual cutoffs, aggregate pass rules, and overall final results."
            />
            <CardBody>
              <div className="space-y-6">
                {/* Select Regulation to Test */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Choose Regulation to Test
                    </label>
                    <select
                      value={testRegulationCode}
                      onChange={(e) => setTestRegulationCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
                    >
                      <option value="GLOBAL_DEFAULT">Global Default Setup</option>
                      {data?.regulations.map((r) => (
                        <option key={r.regulationCode} value={r.regulationCode}>
                          {r.regulationCode} — {r.regulationName || 'Regulation'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex flex-col justify-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Active Scheme Profile for {testRegulationCode}
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      Internal: /{activeTestFormula?.maxInternalMarks ?? 30} (Min {activeTestFormula?.minPassMarks ?? 16}) + External: /{activeTestFormula?.maxExternalMarks ?? 70} (Min {activeTestFormula?.minExternalPassMarks ?? 25}) = {activeTestFormula?.maxTotalMarks ?? 100} Total (Min {activeTestFormula?.minTotalPassMarks ?? 40})
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Evaluation Strategy: <span className="font-mono text-sky-800 font-semibold">{activeTestFormula?.passStrategy ?? 'EXTERNAL_AND_TOTAL'}</span>
                    </p>
                  </div>
                </div>

                {/* VISUAL DATA FLOW BREADCRUMB PIPELINE */}
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-purple-50 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-indigo-950 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <span>🔄</span> Data Flow:
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-white border border-sky-300 font-bold text-sky-900 shadow-2xs">
                      1. Mid Exams ➔ Normalized to /{activeTestFormula?.maxInternalMarks ?? 30} CIE
                    </span>
                    <span className="text-indigo-400 font-black text-sm">➔</span>
                    <span className="px-2.5 py-1 rounded-md bg-white border border-emerald-300 font-bold text-emerald-900 shadow-2xs">
                      2. Theory Exam ➔ Scaled to /{activeTestFormula?.maxExternalMarks ?? 70} SEE
                    </span>
                    <span className="text-indigo-400 font-black text-sm">➔</span>
                    <span className="px-2.5 py-1 rounded-md bg-white border border-purple-300 font-bold text-purple-900 shadow-2xs">
                      3. Combined Total ➔ Evaluated out of /{activeTestFormula?.maxTotalMarks ?? 100} Grade
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium">
                    Auto-evaluates cutoffs & pass rules across all 3 tiers
                  </div>
                </div>

                {/* Candidate Mark Inputs (Internal & External) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Left Box: Internal Assessment Inputs */}
                  <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/20 space-y-4">
                    <div className="flex items-center justify-between border-b border-sky-100 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
                        <span>📘</span> 1. Internal Mid Examinations (CIE)
                      </h4>
                      <span className="text-xs font-bold text-slate-700">
                        Target Scale: /{activeTestFormula?.maxInternalMarks ?? 30}
                      </span>
                    </div>

                    <div className={`grid grid-cols-1 ${activeTestFormula?.calculationMethod === 'BEST_SINGLE_MID' ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-3`}>
                      {/* Mid 1 Input */}
                      <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">Mid Exam 1</span>
                          <label className="flex items-center gap-1.5 text-xs text-rose-700 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={testAbsent1}
                              onChange={(e) => setTestAbsent1(e.target.checked)}
                              className="rounded border-slate-300"
                            />
                            Absent
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Score</label>
                            <input
                              type="number"
                              disabled={testAbsent1}
                              value={testAbsent1 ? '0' : testMid1}
                              onChange={(e) => setTestMid1(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-slate-50 border border-slate-200 font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Max Scale</label>
                            <input
                              type="number"
                              value={testMax1}
                              onChange={(e) => setTestMax1(e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-md text-xs bg-slate-50 border border-slate-200 text-slate-600"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mid 2 Input */}
                      {activeTestFormula?.calculationMethod !== 'BEST_SINGLE_MID' && (
                        <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">Mid Exam 2</span>
                            <label className="flex items-center gap-1.5 text-xs text-rose-700 font-medium cursor-pointer">
                              <input
                                type="checkbox"
                                checked={testAbsent2}
                                onChange={(e) => setTestAbsent2(e.target.checked)}
                                className="rounded border-slate-300"
                              />
                              Absent
                            </label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Score</label>
                              <input
                                type="number"
                                disabled={testAbsent2}
                                value={testAbsent2 ? '0' : testMid2}
                                onChange={(e) => setTestMid2(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-slate-50 border border-slate-200 font-bold text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-1">Max Scale</label>
                              <input
                                type="number"
                                value={testMax2}
                                onChange={(e) => setTestMax2(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-md text-xs bg-slate-50 border border-slate-200 text-slate-600"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Box: External Exam Inputs */}
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-4">
                    <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                        <span>📗</span> 2. Semester End Examination (SEE / External)
                      </h4>
                      <span className="text-xs font-bold text-slate-700">
                        Target Scale: /{activeTestFormula?.maxExternalMarks ?? 70}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">External Theory Paper</span>
                        <label className="flex items-center gap-1.5 text-xs text-rose-700 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={testExternalAbsent}
                            onChange={(e) => setTestExternalAbsent(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          Absent in External
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">External Marks Scored</label>
                          <input
                            type="number"
                            disabled={testExternalAbsent}
                            value={testExternalAbsent ? '0' : testExternalScore}
                            onChange={(e) => setTestExternalScore(e.target.value)}
                            placeholder="e.g. 38"
                            className="w-full px-2.5 py-1.5 rounded-md text-xs bg-slate-50 border border-slate-200 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">External Max Scale</label>
                          <input
                            type="number"
                            value={testExternalMax}
                            onChange={(e) => setTestExternalMax(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-md text-xs bg-slate-50 border border-slate-200 text-slate-600"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 pt-1">
                        External Pass Requirement: <strong className="text-emerald-700">≥ {activeTestFormula?.minExternalPassMarks ?? 25} Marks</strong> ({activeTestFormula?.minExternalPassPercentage ?? 35}%)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Simulation Trigger & Presets */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    onClick={() => void handleRunSimulation()}
                    disabled={testingServer}
                  >
                    {testingServer ? 'Simulating…' : 'Run Complete Evaluation'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('24');
                      setTestMid2('18');
                      setTestExternalScore('42');
                      setTestAbsent1(false);
                      setTestAbsent2(false);
                      setTestExternalAbsent(false);
                    }}
                  >
                    Sample 1: Clear Pass (66 Total)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('16');
                      setTestMid2('16');
                      setTestExternalScore('25');
                      setTestAbsent1(false);
                      setTestAbsent2(false);
                      setTestExternalAbsent(false);
                    }}
                  >
                    Sample 2: Borderline Pass (41 Total)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('28');
                      setTestMid2('26');
                      setTestExternalScore('20');
                      setTestAbsent1(false);
                      setTestAbsent2(false);
                      setTestExternalAbsent(false);
                    }}
                  >
                    Sample 3: External Fail (High Internal, Ext &lt; 25)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('24');
                      setTestMid2('20');
                      setTestExternalScore('0');
                      setTestAbsent1(false);
                      setTestAbsent2(false);
                      setTestExternalAbsent(true);
                    }}
                  >
                    Sample 4: External Absent
                  </Button>
                </div>

                {/* SIMULATION OUTCOME PRESENTATION */}
                {testServerResult && (
                  <div className="rounded-xl border border-sky-300 bg-linear-to-b from-sky-50/50 to-white p-5 space-y-5 shadow-xs">
                    {/* Top Result Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-sky-200 gap-2">
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                          <span>Assessment Outcome:</span>
                          <span
                            className={`text-sm font-black px-3 py-1 rounded-md border shadow-2xs ${
                              testServerResult.status === 'PASS'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : testServerResult.status === 'ABSENT'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}
                          >
                            {testServerResult.status === 'PASS' ? 'PASSED SUBJECT' : testServerResult.status === 'ABSENT' ? 'ABSENT IN EXAM' : 'FAILED SUBJECT'}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 font-mono">{testServerResult.formulaStep}</p>
                      </div>

                      {testServerResult.combo?.grade && (
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Awarded Letter Grade</span>
                          <p className="text-2xl font-black text-sky-800">{testServerResult.combo.grade}</p>
                        </div>
                      )}
                    </div>

                    {/* Three Assessment Cards (Internal, External, Combo) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* 1. Internal Assessment Card */}
                      <div className="p-4 bg-white rounded-xl border border-sky-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-sky-700 tracking-wider">1. Internal (CIE)</span>
                          <Badge variant={testServerResult.internal?.isPass ? 'success' : 'danger'}>
                            {testServerResult.internal?.status}
                          </Badge>
                        </div>
                        <p className="text-2xl font-black text-slate-900">
                          {testServerResult.internal?.marks ?? 'N/A'}{' '}
                          <span className="text-xs font-normal text-slate-500">/ {testServerResult.internal?.targetMax}</span>
                        </p>
                        <p className="text-xs text-slate-600 font-medium">
                          Cutoff: <strong className="text-emerald-700">≥ {testServerResult.internal?.minPass} Marks</strong>
                        </p>
                        {testServerResult.internal?.formulaStep && (
                          <p className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                            {testServerResult.internal.formulaStep}
                          </p>
                        )}
                      </div>

                      {/* 2. External Assessment Card */}
                      <div className="p-4 bg-white rounded-xl border border-emerald-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider">2. External (SEE)</span>
                          <Badge variant={testServerResult.external?.isPass ? 'success' : 'danger'}>
                            {testServerResult.external?.status}
                          </Badge>
                        </div>
                        <p className="text-2xl font-black text-slate-900">
                          {testServerResult.external?.marks ?? '0'}{' '}
                          <span className="text-xs font-normal text-slate-500">/ {testServerResult.external?.targetMax}</span>
                        </p>
                        <p className="text-xs text-slate-600 font-medium">
                          Cutoff: <strong className="text-emerald-700">≥ {testServerResult.external?.minPass} Marks</strong> ({testServerResult.external?.minPassPercentage}%)
                        </p>
                        {testServerResult.external?.formulaStep && (
                          <p className="text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                            {testServerResult.external.formulaStep}
                          </p>
                        )}
                      </div>

                      {/* 3. Combined Aggregate Card */}
                      <div className="p-4 bg-white rounded-xl border border-purple-100 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-purple-700 tracking-wider">3. Combined Aggregate</span>
                          <Badge variant={testServerResult.combo?.overallPass ? 'success' : 'danger'}>
                            {testServerResult.combo?.overallStatus}
                          </Badge>
                        </div>
                        <p className="text-2xl font-black text-slate-900">
                          {testServerResult.combo?.totalMarks ?? 'N/A'}{' '}
                          <span className="text-xs font-normal text-slate-500">/ {testServerResult.combo?.targetMax}</span>
                        </p>
                        <p className="text-xs text-slate-600 font-medium">
                          Aggregate Cutoff: <strong className="text-purple-700">≥ {testServerResult.combo?.minPass} Marks</strong> ({testServerResult.combo?.minPassPercentage}%)
                        </p>
                        <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-mono text-[10px]">
                          Strategy: {testServerResult.combo?.passStrategy}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* COMPREHENSIVE MARKS SCHEME EDITOR DIALOG - EXPANDED WIDTH & CLEAR DATA FLOW */}
      <Dialog
        open={isModalOpen}
        onClose={() => !saving && setIsModalOpen(false)}
        title={
          editingItem?.regulationCode === 'GLOBAL_DEFAULT'
            ? 'Configure Global Assessment Baseline (All Regulations)'
            : `Configure Assessment Scheme & Pass Rules for ${editingItem?.regulationCode}`
        }
        size="5xl"
        className="max-w-[85rem] p-1 sm:p-2"
      >
        <form onSubmit={(e) => void handleSaveScheme(e)} className="space-y-6">
          {/* Header Context Note */}
          <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3.5 text-xs text-sky-900">
            <p className="font-semibold">
              Configuring assessment scheme for:{' '}
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-sky-200 text-sky-800">
                {editingItem?.regulationCode === 'GLOBAL_DEFAULT'
                  ? 'Global Default (All Regulations)'
                  : `${editingItem?.regulationCode} — ${editingItem?.regulationName}`}
              </span>
            </p>
            <p className="mt-1 text-slate-600">
              In academic curricula, <strong>Internal (CIE) + External (SEE) must equal the course Maximum Total Marks</strong>. Use the standard presets below or customize freely.
            </p>
          </div>

          {/* VISUAL ASSESSMENT DATA FLOW PIPELINE */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-sky-50/70 via-indigo-50/50 to-purple-50/70 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                <span>🔄</span> Academic Assessment Data Flow Pipeline
              </span>
              <span className="text-[11px] font-semibold text-indigo-800 bg-white/80 px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                3-Step Flow: CIE ➔ SEE ➔ Combined Grade
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 relative">
              {/* Step 1: CIE Pipeline */}
              <div className="p-3 bg-white/95 rounded-lg border border-sky-200 shadow-2xs space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-sky-100 text-sky-800 border border-sky-200">
                    Step 1: Internal CIE
                  </span>
                  <span className="text-xs font-black text-sky-900 font-mono">/{formMaxInternal} Marks</span>
                </div>
                <p className="text-xs font-bold text-slate-800">Mid Examinations Pipeline</p>
                <p className="text-[11px] text-slate-600">
                  {formMethod === 'WEIGHTED_TWO_MIDS'
                    ? `Takes Mid 1 & Mid 2 ➔ Weights (${formBestWeight}% Best + ${formOtherWeight}% Second)`
                    : formMethod === 'AVERAGE_ALL_MIDS'
                    ? 'Takes Mid 1 & Mid 2 ➔ Arithmetic Average'
                    : 'Takes Highest Single Mid Score (100%)'}
                </p>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span>Scale: <strong className="text-slate-800 font-mono">{formMaxInternal}M</strong></span>
                  <span>Cutoff: <strong className="text-emerald-700 font-mono">≥ {formMinPassInternal}M</strong></span>
                </div>
              </div>

              {/* Step 2: SEE Pipeline */}
              <div className="p-3 bg-white/95 rounded-lg border border-emerald-200 shadow-2xs space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Step 2: External SEE
                  </span>
                  <span className="text-xs font-black text-emerald-900 font-mono">/{formMaxExternal} Marks</span>
                </div>
                <p className="text-xs font-bold text-slate-800">Semester End Examination</p>
                <p className="text-[11px] text-slate-600">
                  Summative Theory Paper evaluated directly out of {formMaxExternal} marks.
                </p>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span>Scale: <strong className="text-slate-800 font-mono">{formMaxExternal}M</strong></span>
                  <span>Cutoff: <strong className="text-emerald-700 font-mono">≥ {formMinPassExternal}M ({formMinPassExternalPct}%)</strong></span>
                </div>
              </div>

              {/* Step 3: Combined Grade Pipeline */}
              <div className="p-3 bg-white/95 rounded-lg border border-purple-200 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase bg-purple-100 text-purple-800 border border-purple-200">
                    Step 3: Combined Grade
                  </span>
                  <span className="text-xs font-black text-purple-900 font-mono">/{currentCalculatedSum} Marks</span>
                </div>
                <p className="text-xs font-bold text-slate-800">Course Aggregation & Award</p>
                <p className="text-[11px] text-slate-600">
                  Internal CIE ({formMaxInternal}) + External SEE ({formMaxExternal}) = {currentCalculatedSum} Total.
                </p>
                <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                  <span>Strategy: <strong className="text-purple-800">{formPassStrategy === 'EXTERNAL_AND_TOTAL' ? 'Ext & Total Pass' : formPassStrategy === 'ALL_THREE' ? 'Strict 3-Way' : 'Total Pass'}</strong></span>
                  <span>Min: <strong className="text-purple-700 font-mono">≥ {formMinPassTotal}M ({formMinPassTotalPct}%)</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* PRESET TEMPLATES BAR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🎯</span> Standard University Architecture Presets:
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoBalance100}
                  onChange={(e) => setAutoBalance100(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Lock Total to 100 Course Marks
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {PRESET_TEMPLATES.map((p) => {
                const isActive =
                  parseFloat(formMaxInternal) === p.internal &&
                  parseFloat(formMaxExternal) === p.external;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'border-sky-500 bg-sky-50/80 shadow-2xs ring-2 ring-sky-300'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-[10px] font-bold text-sky-700 uppercase">{p.badge}</span>
                    <span className="block text-xs font-extrabold text-slate-900 mt-0.5">{p.label}</span>
                    <span className="block text-[10px] text-slate-500 mt-1 line-clamp-2">{p.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DYNAMIC MARKS SUM & BALANCE DISPLAY */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Course Marks Mathematical Balance:
              </span>
              <span
                className={`font-mono text-xs font-black px-2.5 py-0.5 rounded ${
                  !isSumMismatch
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {!isSumMismatch ? '✓ Perfectly Balanced' : '⚠️ Sum Mismatch'}
              </span>
            </div>

            {/* Visual Balance Bar */}
            <div className="h-4 rounded-full bg-slate-200 overflow-hidden flex shadow-inner">
              <div
                style={{ width: `${currentCalculatedSum > 0 ? (currentInternalNum / currentCalculatedSum) * 100 : 40}%` }}
                className="bg-sky-500 flex items-center justify-center text-[10px] font-bold text-white transition-all"
                title={`Internal: ${currentInternalNum} marks`}
              >
                {currentInternalNum > 0 && `${currentInternalNum}M Internal`}
              </div>
              <div
                style={{ width: `${currentCalculatedSum > 0 ? (currentExternalNum / currentCalculatedSum) * 100 : 60}%` }}
                className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white transition-all"
                title={`External: ${currentExternalNum} marks`}
              >
                {currentExternalNum > 0 && `${currentExternalNum}M External`}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600">
              <span>
                <strong>{formMaxInternal || 0}</strong> (Internal CIE) + <strong>{formMaxExternal || 0}</strong> (External SEE) ={' '}
                <strong className="text-slate-900 font-mono text-xs">{currentCalculatedSum} Total Marks</strong>
              </span>
              {autoBalance100 && (
                <span className="text-sky-700 font-medium">Auto-balanced for a 100-mark paper</span>
              )}
            </div>

            {/* Detailed Mismatch Alert if Internal is 40 and External is 70 */}
            {isSumMismatch && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <span className="text-base leading-none">⚠️</span>
                <div className="space-y-1">
                  <p className="font-bold">
                    Marks Inconsistency: Internal ({formMaxInternal}) + External ({formMaxExternal}) equals {currentCalculatedSum} marks, but Total is set to {formMaxTotal}!
                  </p>
                  <p className="text-[11px] text-amber-800">
                    If your regulation uses <strong>40 Internal marks</strong> for a 100-mark course, the external theory paper must be <strong>60 marks</strong> (40 + 60 = 100). If external is <strong>70 marks</strong>, internal is <strong>30 marks</strong> (30 + 70 = 100).
                  </p>
                  <div className="inline-flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        // Rebalance to 40 + 60 = 100
                        setFormMaxExternal('60');
                        setFormMinPassExternal('21');
                        setFormMaxTotal('100');
                        setAutoBalance100(true);
                      }}
                      className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[10px] cursor-pointer"
                    >
                      Fix to 40 Internal + 60 External (100 Total)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Rebalance to 30 + 70 = 100
                        setFormMaxInternal('30');
                        setFormMinPassInternal('16');
                        setFormMaxExternal('70');
                        setFormMinPassExternal('25');
                        setFormMaxTotal('100');
                        setAutoBalance100(true);
                      }}
                      className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[10px] cursor-pointer"
                    >
                      Fix to 30 Internal + 70 External (100 Total)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormMaxTotal(String(currentCalculatedSum));
                        setAutoBalance100(false);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10px] cursor-pointer"
                    >
                      Allow {currentCalculatedSum} Total Scale
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TWO-COLUMN SIDE-BY-SIDE SPLIT: STEP 1 (INTERNAL) & STEP 2 (EXTERNAL) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* COLUMN 1: SECTION 1 INTERNAL CIE */}
            <div className="space-y-4 p-4 rounded-xl border border-sky-200 bg-sky-50/25 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-sky-100 pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-sky-800 flex items-center gap-1.5">
                    <span>📘</span> 1. Continuous Internal Evaluation (CIE Setup)
                  </h4>
                  <span className="text-xs font-black text-sky-900 font-mono">/{formMaxInternal} Marks</span>
                </div>

                {/* Calculation Scheme Options */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Internal Mid Calculation Method
                  </label>
                  <div className="space-y-2">
                    {CALCULATION_METHODS.map((m) => (
                      <div
                        key={m.value}
                        onClick={() => setFormMethod(m.value)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          formMethod === m.value
                            ? 'border-sky-500 bg-sky-50 shadow-2xs ring-2 ring-sky-200'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p className="font-bold text-xs text-slate-900">{m.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{m.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Weights if weighted */}
                {formMethod === 'WEIGHTED_TWO_MIDS' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-white border border-slate-200">
                    <Input
                      label="Best Mid Weightage (%)"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={formBestWeight}
                      onChange={(e) => handleBestWeightChange(e.target.value)}
                      hint="e.g. 75% for Autonomous, 80% for JNTU"
                    />
                    <Input
                      label="Second-Best Mid Weightage (%)"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={formOtherWeight}
                      onChange={(e) => setFormOtherWeight(e.target.value)}
                      hint="Auto-equals 100 - Best Mid %"
                    />
                  </div>
                )}

                {/* Internal Max & Min Pass Marks */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="Max Internal Marks"
                    type="number"
                    min={1}
                    max={100}
                    value={formMaxInternal}
                    onChange={(e) => handleMaxInternalChange(e.target.value)}
                    hint="Typically 30 or 40"
                  />
                  <Input
                    label="Internal Pass Cutoff"
                    type="number"
                    min={0}
                    max={100}
                    value={formMinPassInternal}
                    onChange={(e) => setFormMinPassInternal(e.target.value)}
                    hint="Typically 16 or 20"
                  />
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Decimal Rounding</label>
                    <select
                      value={formRounding}
                      onChange={(e) => setFormRounding(e.target.value as RoundingRule)}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-slate-300 font-medium"
                    >
                      {ROUNDING_RULES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Mini Flow Indicator */}
              <div className="mt-2 p-2.5 rounded-lg bg-white border border-sky-100 text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-sky-800 text-[10px] uppercase tracking-wider block">CIE Data Flow Summary:</span>
                <p>
                  Conducts Mid 1 & Mid 2 ➔ Applies <strong>{formMethod}</strong> ➔ Normalizes score to <strong>{formMaxInternal} Marks</strong>. Cutoff is <strong>≥ {formMinPassInternal} Marks</strong>.
                </p>
              </div>
            </div>

            {/* COLUMN 2: SECTION 2 EXTERNAL SEE */}
            <div className="space-y-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/25 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <span>📗</span> 2. Semester End Examination (SEE Setup)
                  </h4>
                  <span className="text-xs font-black text-emerald-900 font-mono">/{formMaxExternal} Marks</span>
                </div>

                <div className="p-3 bg-white rounded-lg border border-emerald-100 space-y-3">
                  <p className="text-xs text-slate-600">
                    The Semester End Examination is the final summative evaluation. When Internal is <strong>{formMaxInternal}</strong>, External is scaled to <strong>{formMaxExternal}</strong> for a balanced course total.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                      label="Max External Marks"
                      type="number"
                      min={1}
                      max={100}
                      value={formMaxExternal}
                      onChange={(e) => handleMaxExternalChange(e.target.value)}
                      hint="60 (when Int=40) or 70 (when Int=30)"
                    />
                    <Input
                      label="External Min Pass Marks"
                      type="number"
                      min={0}
                      max={100}
                      value={formMinPassExternal}
                      onChange={(e) => setFormMinPassExternal(e.target.value)}
                      hint="Typically 21 (for 60) or 25 (for 70)"
                    />
                    <Input
                      label="External Pass % Cutoff"
                      type="number"
                      min={0}
                      max={100}
                      value={formMinPassExternalPct}
                      onChange={(e) => setFormMinPassExternalPct(e.target.value)}
                      hint="Standard: 35% or 40%"
                    />
                  </div>
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
                        Student MUST score ≥ {formMinPassExternal} marks in external exam to pass the course. If student scores below this cutoff, course status is FAIL even if aggregate total reaches 40%.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Mini Flow Indicator */}
              <div className="mt-2 p-2.5 rounded-lg bg-white border border-emerald-100 text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-emerald-800 text-[10px] uppercase tracking-wider block">SEE Data Flow Summary:</span>
                <p>
                  External written theory paper evaluated directly out of <strong>{formMaxExternal} Marks</strong>. Student must achieve at least <strong>{formMinPassExternal} Marks ({formMinPassExternalPct}%)</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* VISUAL EQUATION CONNECTOR BAR */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-sky-100 via-indigo-50 to-purple-100 border border-indigo-200 flex flex-wrap items-center justify-between gap-3 text-xs font-bold shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-slate-500 uppercase tracking-wider text-[10px]">Data Merging:</span>
              <span className="px-2.5 py-1 rounded-md bg-white text-sky-800 border border-sky-300 font-mono text-xs shadow-2xs">
                CIE: {formMaxInternal} Marks
              </span>
              <span className="text-indigo-600 font-black text-sm">+</span>
              <span className="px-2.5 py-1 rounded-md bg-white text-emerald-800 border border-emerald-300 font-mono text-xs shadow-2xs">
                SEE: {formMaxExternal} Marks
              </span>
              <span className="text-indigo-600 font-black text-sm">=</span>
              <span className="px-3 py-1 rounded-md bg-purple-600 text-white font-mono text-xs shadow-xs">
                {currentCalculatedSum} Maximum Total Course Marks
              </span>
            </div>
            <div className="text-slate-600 font-medium text-[11px]">
              Course Grade determined by Combining CIE + SEE
            </div>
          </div>

          {/* SECTION 3: COMBO & AGGREGATE PASS STRATEGY (FULL WIDTH) */}
          <div className="space-y-4 p-4 rounded-xl border border-purple-200 bg-purple-50/20">
            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                <span>📙</span> 3. Combined / Aggregate Pass Strategy & Award Determination
              </h4>
              <span className="text-xs font-black text-purple-900 font-mono">/{currentCalculatedSum} Total Marks</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Total Course Scale</label>
                <div className="w-full px-3 py-2 rounded-lg text-xs bg-slate-100 border border-slate-300 font-bold text-slate-900 font-mono">
                  {currentCalculatedSum} Total Marks ({formMaxInternal} Int + {formMaxExternal} Ext)
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Strictly computed from Internal + External</p>
              </div>
              <Input
                label="Min Total Pass Marks"
                type="number"
                min={0}
                max={100}
                value={formMinPassTotal}
                onChange={(e) => setFormMinPassTotal(e.target.value)}
                hint="Typically 40 out of 100"
              />
              <Input
                label="Total Aggregate Pass %"
                type="number"
                min={0}
                max={100}
                value={formMinPassTotalPct}
                onChange={(e) => setFormMinPassTotalPct(e.target.value)}
                hint="Typically 40%"
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
              Strict Three-Way Requirement: Candidate must also separately achieve ≥ Internal Pass Cutoff (Off by default in JNTU)
            </label>

            {/* REAL-TIME LIVE DATA FLOW PREVIEW CARD RIGHT INSIDE MODAL */}
            <div className="p-3.5 rounded-xl border border-indigo-200 bg-white shadow-2xs space-y-2">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <span>⚡</span> Real-Time Data Flow Calculation Preview (Live Sample):
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
                {/* Step 1 Outcome */}
                <div className="p-2.5 rounded-lg bg-sky-50/60 border border-sky-100 space-y-1">
                  <span className="text-[10px] font-bold text-sky-800 uppercase">Step 1: Internal CIE Result</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {previewDataFlow.sampleIntScore} <span className="text-xs text-slate-500">/{formMaxInternal}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Mid 1 ({previewDataFlow.sampleMid1}) + Mid 2 ({previewDataFlow.sampleMid2}) ➔{' '}
                    <strong className={previewDataFlow.intPassed ? 'text-emerald-700' : 'text-rose-700'}>
                      {previewDataFlow.intPassed ? 'Cleared Cutoff' : 'Below Cutoff'}
                    </strong>
                  </p>
                </div>

                {/* Step 2 Outcome */}
                <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase">Step 2: External SEE Result</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {previewDataFlow.sampleExt} <span className="text-xs text-slate-500">/{formMaxExternal}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    External Theory Paper ➔{' '}
                    <strong className={previewDataFlow.extPassed ? 'text-emerald-700' : 'text-rose-700'}>
                      {previewDataFlow.extPassed ? 'Cleared Cutoff' : 'Failed External'}
                    </strong>
                  </p>
                </div>

                {/* Step 3 Outcome */}
                <div className="p-2.5 rounded-lg bg-purple-50/60 border border-purple-100 space-y-1">
                  <span className="text-[10px] font-bold text-purple-800 uppercase">Step 3: Total Aggregate & Grade</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {previewDataFlow.sampleTotal} <span className="text-xs text-slate-500">/{currentCalculatedSum}</span> ({previewDataFlow.pct}%)
                  </p>
                  <p className="text-[10px] text-purple-900 font-semibold">
                    Grade: <strong className="text-purple-800">{previewDataFlow.grade}</strong>
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
              placeholder="e.g. Approved Autonomous Academic Scheme (40 Internal + 60 External = 100)"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
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
        </form>
      </Dialog>
    </div>
  );
}
