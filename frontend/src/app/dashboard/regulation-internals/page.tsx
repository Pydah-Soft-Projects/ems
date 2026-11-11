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

export default function RegulationInternalsPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'formulas' | 'testing'>('formulas');
  const [data, setData] = useState<RegulationInternalSettingsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Formula Editor Modal state
  const [editingItem, setEditingItem] = useState<RegulationInternalSetting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [formMethod, setFormMethod] = useState<CalculationMethod>('WEIGHTED_TWO_MIDS');
  const [formBestWeight, setFormBestWeight] = useState('80');
  const [formOtherWeight, setFormOtherWeight] = useState('20');
  const [formMaxMarks, setFormMaxMarks] = useState('30');
  const [formMinPassMarks, setFormMinPassMarks] = useState('16');
  const [formRounding, setFormRounding] = useState<RoundingRule>('ROUND_2_DECIMALS');
  const [formRemarks, setFormRemarks] = useState('');

  // Dedicated Testing Workbench State (strictly configured mid exams only)
  const [testRegulationCode, setTestRegulationCode] = useState<string>('GLOBAL_DEFAULT');
  const [testMid1, setTestMid1] = useState('24');
  const [testMax1, setTestMax1] = useState('30');
  const [testAbsent1, setTestAbsent1] = useState(false);
  const [testMid2, setTestMid2] = useState('18');
  const [testMax2, setTestMax2] = useState('30');
  const [testAbsent2, setTestAbsent2] = useState(false);
  const [testServerResult, setTestServerResult] = useState<CalculationSimulationResult | null>(null);
  const [testingServer, setTestingServer] = useState(false);

  // Load Settings on Mount
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getRegulationInternalSettings();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load regulation calculation settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Open modal for editing a regulation or global default
  const handleOpenEdit = (item: RegulationInternalSetting) => {
    setEditingItem(item);
    setFormMethod(item.calculationMethod || 'WEIGHTED_TWO_MIDS');
    setFormBestWeight(String(item.bestMidWeightage ?? 80));
    setFormOtherWeight(String(item.otherMidWeightage ?? 20));
    setFormMaxMarks(String(item.maxInternalMarks ?? 30));
    setFormMinPassMarks(String(item.minPassMarks ?? 16));
    setFormRounding(item.roundingRule || 'ROUND_2_DECIMALS');
    setFormRemarks(item.remarks || '');
    setIsModalOpen(true);
  };

  // When changing Best Weight, automatically balance Other Weight to 100%
  const handleBestWeightChange = (val: string) => {
    setFormBestWeight(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setFormOtherWeight(String(Math.max(0, 100 - num)));
    }
  };

  // Reset custom regulation formula back to global default
  const handleResetToDefault = async (item: RegulationInternalSetting) => {
    if (!item.id) return;
    if (!window.confirm(`Are you sure you want to reset ${item.regulationCode} to inherit the Global Default formula?`)) {
      return;
    }

    try {
      await api.resetRegulationInternalSetting(item.id);
      toast.push(`Formula for ${item.regulationCode} reset to Global Default`, 'success');
      void loadSettings();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to reset formula', 'danger');
    }
  };

  // Save Formula
  const handleSaveFormula = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const maxMarks = parseFloat(formMaxMarks);
    const minPass = parseFloat(formMinPassMarks);
    const bestWeight = parseFloat(formBestWeight);
    const otherWeight = parseFloat(formOtherWeight);
    const strictMids = formMethod === 'BEST_SINGLE_MID' ? 1 : 2;

    if (isNaN(maxMarks) || maxMarks <= 0) {
      toast.push('Target Maximum Internal Marks must be greater than 0', 'warning');
      return;
    }

    if (isNaN(minPass) || minPass < 0 || minPass > maxMarks) {
      toast.push('Minimum Pass Marks must be between 0 and Maximum Marks', 'warning');
      return;
    }

    if (formMethod === 'WEIGHTED_TWO_MIDS') {
      if (isNaN(bestWeight) || isNaN(otherWeight) || Math.abs(bestWeight + otherWeight - 100) > 0.01) {
        toast.push(`Best mid and other mid weightage must sum to 100% (currently ${bestWeight + otherWeight}%)`, 'warning');
        return;
      }
    }

    try {
      setSaving(true);
      await api.saveRegulationInternalSetting({
        id: editingItem.id || undefined,
        regulationId: editingItem.regulationId,
        regulationCode: editingItem.regulationCode,
        regulationName: editingItem.regulationName,
        calculationMethod: formMethod,
        bestMidWeightage: formMethod === 'BEST_SINGLE_MID' ? 100 : formMethod === 'AVERAGE_ALL_MIDS' ? 50 : bestWeight,
        otherMidWeightage: formMethod === 'BEST_SINGLE_MID' ? 0 : formMethod === 'AVERAGE_ALL_MIDS' ? 50 : otherWeight,
        maxInternalMarks: maxMarks,
        minPassMarks: minPass,
        minMidsRequired: strictMids,
        roundingRule: formRounding,
        remarks: formRemarks.trim() || null,
      });

      toast.push(
        editingItem.regulationCode === 'GLOBAL_DEFAULT'
          ? 'Global Default calculation formula updated successfully'
          : `Calculation formula for ${editingItem.regulationCode} saved successfully`,
        'success',
      );
      setIsModalOpen(false);
      void loadSettings();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Failed to save formula', 'danger');
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

  // Selected regulation for testing
  const activeTestFormula = useMemo(() => {
    if (!data) return null;
    if (testRegulationCode === 'GLOBAL_DEFAULT') return data.globalDefault;
    const matched = data.regulations.find((r) => r.regulationCode === testRegulationCode);
    return matched || data.globalDefault;
  }, [data, testRegulationCode]);

  // Synchronize max marks when tested regulation changes
  useEffect(() => {
    if (activeTestFormula) {
      const maxStr = String(activeTestFormula.maxInternalMarks ?? 30);
      setTestMax1(maxStr);
      setTestMax2(maxStr);
    }
  }, [activeTestFormula]);

  // Run calculation simulation in testing tab strictly for configured exams
  const handleRunSimulation = useCallback(async () => {
    if (!activeTestFormula) return;

    const targetMax = activeTestFormula.maxInternalMarks ?? 30;
    const isSingleMid = activeTestFormula.calculationMethod === 'BEST_SINGLE_MID';
    const midEntries: { marks: number; maxMarks: number; isAbsent: boolean }[] = [];

    // Mid 1
    if (testAbsent1) {
      midEntries.push({ marks: 0, maxMarks: parseFloat(testMax1) || targetMax, isAbsent: true });
    } else if (testMid1 !== '' && !isNaN(parseFloat(testMid1))) {
      midEntries.push({ marks: parseFloat(testMid1), maxMarks: parseFloat(testMax1) || targetMax, isAbsent: false });
    }

    // Mid 2 (only if formula uses 2 mids)
    if (!isSingleMid) {
      if (testAbsent2) {
        midEntries.push({ marks: 0, maxMarks: parseFloat(testMax2) || targetMax, isAbsent: true });
      } else if (testMid2 !== '' && !isNaN(parseFloat(testMid2))) {
        midEntries.push({ marks: parseFloat(testMid2), maxMarks: parseFloat(testMax2) || targetMax, isAbsent: false });
      }
    }

    try {
      setTestingServer(true);
      const res = await api.simulateRegulationInternalCalculation({
        midEntries,
        calculationMethod: activeTestFormula.calculationMethod,
        bestMidWeightage: activeTestFormula.bestMidWeightage,
        otherMidWeightage: activeTestFormula.otherMidWeightage,
        maxInternalMarks: activeTestFormula.maxInternalMarks,
        minPassMarks: activeTestFormula.minPassMarks,
        minMidsRequired: isSingleMid ? 1 : 2,
        roundingRule: activeTestFormula.roundingRule,
      });
      setTestServerResult(res);
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Simulation failed', 'danger');
    } finally {
      setTestingServer(false);
    }
  }, [activeTestFormula, testMid1, testMax1, testAbsent1, testMid2, testMax2, testAbsent2, toast]);

  useEffect(() => {
    if (activeTab === 'testing' && activeTestFormula) {
      void handleRunSimulation();
    }
  }, [activeTab, activeTestFormula, handleRunSimulation]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Regulation Internal Calculations"
        description="Set up and test regulation-specific internal marks formulas, mid examination weightages, target max marks, and pass criteria."
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

      {/* Top Tab Bar: Setup vs Dedicated Testing */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('formulas')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'formulas'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          Regulation Formulas Setup
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('testing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'testing'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Formula Testing & Simulator
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800">
          <p className="font-semibold">Error Loading Settings</p>
          <p className="text-xs mt-1 text-rose-600">{error}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadSettings()}>
            Retry
          </Button>
        </div>
      ) : null}

      {/* TAB 1: FORMULAS SETUP */}
      {activeTab === 'formulas' && (
        <div className="space-y-6">
          {/* Global Default Formula Card */}
          {data?.globalDefault && (
            <Card className="border-sky-200 bg-linear-to-r from-sky-50/40 via-white to-slate-50/30">
              <CardHeader
                title="Global Default Formula"
                description="Used automatically for any academic regulation that has not configured a custom calculation scheme."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenEdit(data.globalDefault)}
                  >
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit Global Default
                  </Button>
                }
              />
              <CardBody>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-white border border-sky-100 shadow-2xs">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Calculation Scheme</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {data.globalDefault.calculationMethod === 'WEIGHTED_TWO_MIDS'
                        ? `${data.globalDefault.bestMidWeightage}% Best + ${data.globalDefault.otherMidWeightage}% Second-Best`
                        : data.globalDefault.calculationMethod === 'AVERAGE_ALL_MIDS'
                        ? 'Simple Average of Both Mids'
                        : 'Best Single Mid Exam (100%)'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Method: <span className="font-mono text-sky-700">{data.globalDefault.calculationMethod}</span>
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Target Scale</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      Maximum: <span className="text-slate-900">{data.globalDefault.maxInternalMarks}</span> Marks
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Min Pass: <strong className="text-emerald-700 font-semibold">{data.globalDefault.minPassMarks}</strong> marks (
                      {((data.globalDefault.minPassMarks / data.globalDefault.maxInternalMarks) * 100).toFixed(0)}%)
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Evaluation Criteria</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      Strict Exam Count: <span className="text-slate-900">{data.globalDefault.calculationMethod === 'BEST_SINGLE_MID' ? 1 : 2}</span> Mid(s)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Rounding: <span className="font-medium text-slate-700">{data.globalDefault.roundingRule}</span>
                    </p>
                  </div>

                  <div className="flex flex-col justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-50 text-sky-800 border border-sky-200">
                      <svg className="w-4 h-4 text-sky-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Active Global System Fallback
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Regulations Table Card */}
          <Card>
            <CardHeader
              title="Academic Regulations Schemes"
              description="Specific mid marks calculation rules assigned to academic regulations. Click 'Configure Formula' to customize any regulation."
              action={
                <div className="w-72">
                  <input
                    type="text"
                    placeholder="Search regulations (e.g. R23, R20)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              }
            />
            <CardBody>
              {loading ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600 mb-2"></div>
                  <p>Loading regulation calculation setups…</p>
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
                        <th className="px-4 py-3 font-semibold">Formula / Calculation Scheme</th>
                        <th className="px-4 py-3 text-center font-semibold">Target Max Marks</th>
                        <th className="px-4 py-3 text-center font-semibold">Min Pass Marks</th>
                        <th className="px-4 py-3 text-center font-semibold">Status / Source</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredRegulations.map((reg) => (
                        <tr key={reg.regulationCode} className="hover:bg-slate-50/70 transition-colors">
                          {/* Regulation Info */}
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

                          {/* Applied Formula */}
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {reg.calculationMethod === 'WEIGHTED_TWO_MIDS' ? (
                                <span className="inline-flex items-center gap-1.5 text-slate-800">
                                  <strong className="text-sky-700">{reg.bestMidWeightage}%</strong> Best Mid +{' '}
                                  <strong className="text-slate-700">{reg.otherMidWeightage}%</strong> Second Mid
                                </span>
                              ) : reg.calculationMethod === 'AVERAGE_ALL_MIDS' ? (
                                <span className="text-purple-800 font-medium">Average of Both Mids</span>
                              ) : (
                                <span className="text-emerald-800 font-medium">Best Single Mid (100%)</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Method: {reg.calculationMethod} · Strictly {reg.calculationMethod === 'BEST_SINGLE_MID' ? 1 : 2} Mid(s)
                            </div>
                          </td>

                          {/* Target Max Marks */}
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                              {reg.maxInternalMarks}
                            </span>
                          </td>

                          {/* Min Pass Marks */}
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {reg.minPassMarks}
                            </span>
                          </td>

                          {/* Status / Source Badge */}
                          <td className="px-4 py-3 text-center">
                            {reg.isCustomized ? (
                              <Badge variant="success">Customized Formula</Badge>
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
                                Configure Formula
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

      {/* TAB 2: DEDICATED FORMULA TESTING & SIMULATOR PAGE */}
      {activeTab === 'testing' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Formula Testing & Simulation Workbench"
              description="Select any regulation and input candidate test marks to verify calculation steps, weight distributions, and Pass/Fail cutoffs strictly per configuration."
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
                      <option value="GLOBAL_DEFAULT">Global Default Formula</option>
                      {data?.regulations.map((r) => (
                        <option key={r.regulationCode} value={r.regulationCode}>
                          {r.regulationCode} — {r.regulationName || 'Regulation'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex flex-col justify-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Active Formula Profile for {testRegulationCode}
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      {activeTestFormula?.formulaDescription || 'Dynamic Formula'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Target Max: <strong>{activeTestFormula?.maxInternalMarks ?? 30}</strong> · Min Pass:{' '}
                      <strong className="text-emerald-700">{activeTestFormula?.minPassMarks ?? 16}</strong> · Method:{' '}
                      <span className="font-mono text-sky-700">{activeTestFormula?.calculationMethod}</span>
                    </p>
                  </div>
                </div>

                {/* Score Input Panels strictly based on configured exams */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Configured Mid Examinations ({activeTestFormula?.calculationMethod === 'BEST_SINGLE_MID' ? '1 Mid Required' : 'Strictly 2 Mids Required'})
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      Scale: <strong>/{activeTestFormula?.maxInternalMarks ?? 30}</strong>
                    </span>
                  </div>

                  <div className={`grid grid-cols-1 ${activeTestFormula?.calculationMethod === 'BEST_SINGLE_MID' ? 'sm:grid-cols-1 max-w-md' : 'sm:grid-cols-2'} gap-4`}>
                    {/* Mid 1 Input */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900">Mid Exam 1</span>
                          {activeTestFormula?.calculationMethod === 'WEIGHTED_TWO_MIDS' && (
                            <span className="ml-2 text-[11px] text-sky-700 font-semibold">
                              ({activeTestFormula.bestMidWeightage}% if best / {activeTestFormula.otherMidWeightage}% if second)
                            </span>
                          )}
                        </div>
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Marks Scored</label>
                          <input
                            type="number"
                            disabled={testAbsent1}
                            value={testAbsent1 ? '0' : testMid1}
                            onChange={(e) => setTestMid1(e.target.value)}
                            placeholder="e.g. 24"
                            className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 border border-slate-200 disabled:bg-slate-100 font-bold text-slate-900"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 mb-1">Max Scale</label>
                          <input
                            type="number"
                            value={testMax1}
                            onChange={(e) => setTestMax1(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 border border-slate-200 font-medium text-slate-700"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mid 2 Input (Strictly shown only when formula uses 2 mids) */}
                    {activeTestFormula?.calculationMethod !== 'BEST_SINGLE_MID' && (
                      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-900">Mid Exam 2</span>
                            {activeTestFormula?.calculationMethod === 'WEIGHTED_TWO_MIDS' && (
                              <span className="ml-2 text-[11px] text-sky-700 font-semibold">
                                ({activeTestFormula.otherMidWeightage}% if second / {activeTestFormula.bestMidWeightage}% if best)
                              </span>
                            )}
                          </div>
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
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Marks Scored</label>
                            <input
                              type="number"
                              disabled={testAbsent2}
                              value={testAbsent2 ? '0' : testMid2}
                              onChange={(e) => setTestMid2(e.target.value)}
                              placeholder="e.g. 18"
                              className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 border border-slate-200 disabled:bg-slate-100 font-bold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Max Scale</label>
                            <input
                              type="number"
                              value={testMax2}
                              onChange={(e) => setTestMax2(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg text-xs bg-slate-50 border border-slate-200 font-medium text-slate-700"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Simulation Trigger Button & Strict Samples */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => void handleRunSimulation()}
                    disabled={testingServer}
                  >
                    {testingServer ? 'Simulating…' : 'Run Calculation Test'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('25');
                      setTestMid2('10');
                      setTestAbsent1(false);
                      setTestAbsent2(false);
                    }}
                  >
                    Load Sample (25 & 10)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('28');
                      setTestMid2('26');
                      setTestAbsent1(false);
                      setTestAbsent2(false);
                    }}
                  >
                    Load Sample (28 & 26)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTestMid1('24');
                      setTestMid2('0');
                      setTestAbsent1(false);
                      setTestAbsent2(true);
                    }}
                  >
                    Load Sample (Mid 2 Absent)
                  </Button>
                </div>

                {/* Simulation Result Presentation */}
                {testServerResult && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-sky-100 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Calculation Test Outcome</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{testServerResult.formulaDescription}</p>
                      </div>
                      <span
                        className={`text-xs font-extrabold px-3 py-1 rounded-md border shadow-2xs ${
                          testServerResult.isPass
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : testServerResult.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {testServerResult.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <div className="p-3 bg-white rounded-lg border border-sky-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Final Calculated Marks</p>
                        <p className="text-2xl font-black text-slate-900 mt-1">
                          {testServerResult.marks ?? 'N/A'}{' '}
                          <span className="text-xs font-normal text-slate-500">/ {testServerResult.targetMax}</span>
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-sky-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Best Mid Normalized</p>
                        <p className="text-lg font-bold text-sky-800 mt-1">
                          {testServerResult.bestMid != null ? `${testServerResult.bestMid} / ${testServerResult.targetMax}` : '-'}
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-sky-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Second Mid Normalized</p>
                        <p className="text-lg font-bold text-slate-700 mt-1">
                          {testServerResult.secondMid != null ? `${testServerResult.secondMid} / ${testServerResult.targetMax}` : '-'}
                        </p>
                      </div>

                      <div className="p-3 bg-white rounded-lg border border-sky-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">Pass Threshold</p>
                        <p className="text-lg font-bold text-emerald-700 mt-1">
                          ≥ {testServerResult.minPass} Marks
                        </p>
                      </div>
                    </div>

                    {testServerResult.formulaStep && (
                      <div className="p-3 rounded-lg bg-white border border-sky-100">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Mathematical Step Breakdown:
                        </p>
                        <p className="font-mono text-xs font-semibold text-slate-800 mt-1">
                          {testServerResult.formulaStep}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* FORMULA EDITOR DIALOG */}
      <Dialog
        open={isModalOpen}
        onClose={() => !saving && setIsModalOpen(false)}
        title={
          editingItem?.regulationCode === 'GLOBAL_DEFAULT'
            ? 'Configure Global Default Internal Calculation Formula'
            : `Configure Internal Calculation Formula for ${editingItem?.regulationCode}`
        }
        size="lg"
      >
        <form onSubmit={(e) => void handleSaveFormula(e)} className="space-y-5">
          <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3.5 text-xs text-sky-900">
            <p className="font-semibold">
              Configuring formula for:{' '}
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-sky-200 text-sky-800">
                {editingItem?.regulationCode === 'GLOBAL_DEFAULT' ? 'Global Default (All Regulations)' : `${editingItem?.regulationCode} — ${editingItem?.regulationName}`}
              </span>
            </p>
            <p className="mt-1 text-slate-600">
              When marks are entered or student progress is tracked, EMS dynamically executes this exact formula for all subjects under this regulation.
            </p>
          </div>

          {/* Strategy / Calculation Method */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Calculation Method / Scheme
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {CALCULATION_METHODS.map((m) => (
                <div
                  key={m.value}
                  onClick={() => setFormMethod(m.value)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    formMethod === m.value
                      ? 'border-sky-500 bg-sky-50/70 shadow-xs ring-2 ring-sky-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="font-bold text-xs text-slate-900">{m.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Conditional Weights if WEIGHTED_TWO_MIDS */}
          {formMethod === 'WEIGHTED_TWO_MIDS' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <Input
                  label="Best Mid Weightage (%)"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={formBestWeight}
                  onChange={(e) => handleBestWeightChange(e.target.value)}
                  hint="e.g. 80% for R20/R23, 70% for R16/R19"
                />
              </div>

              <div>
                <Input
                  label="Second-Best Mid Weightage (%)"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={formOtherWeight}
                  onChange={(e) => setFormOtherWeight(e.target.value)}
                  hint="Must equal 100 - Best Mid %"
                />
              </div>
            </div>
          )}

          {/* Target Max Marks & Min Pass Marks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Target Max Internal Marks"
                type="number"
                min={1}
                max={100}
                step={1}
                value={formMaxMarks}
                onChange={(e) => setFormMaxMarks(e.target.value)}
                hint="Strict maximum marks (normally 30, 40, or 25)"
              />
            </div>

            <div>
              <Input
                label="Minimum Pass Marks"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={formMinPassMarks}
                onChange={(e) => setFormMinPassMarks(e.target.value)}
                hint="Strict pass cutoff (normally 16 out of 30)"
              />
            </div>
          </div>

          {/* Rounding Rule */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Decimal & Rounding Rule
            </label>
            <select
              value={formRounding}
              onChange={(e) => setFormRounding(e.target.value as RoundingRule)}
              className="w-full px-3 py-2 rounded-lg text-xs bg-white border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-sky-500 font-medium"
            >
              {ROUNDING_RULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} ({r.example})
                </option>
              ))}
            </select>
          </div>

          {/* Remarks */}
          <div>
            <Input
              label="Formula Notes / Description"
              value={formRemarks}
              onChange={(e) => setFormRemarks(e.target.value)}
              placeholder="e.g. Approved by Academic Council on Regulation R23"
            />
          </div>

          {/* Form Actions */}
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
              {saving ? 'Saving Formula…' : 'Save Calculation Formula'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
