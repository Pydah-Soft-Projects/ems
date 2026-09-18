'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SoftSearchField, StatusFilter, KpiTile } from '@/components/ui/SoftSearch';
import { ApiError, api } from '@/lib/api';
import { money } from '@/components/fees/CollectPaymentModal';
import { FeeHead, FeeHeadType, CreateFeeHeadInput, RegulationAmountInput } from '@/types/fee-head';
import { Regulation } from '@/types/regulation';

type ScopeFilter = 'all' | 'GLOBAL' | 'REGULATION_SPECIFIC';
type ActiveFilter = 'all' | 'active' | 'inactive';

const scopeTabs: { id: ScopeFilter; label: string }[] = [
  { id: 'all', label: 'All Scopes' },
  { id: 'GLOBAL', label: 'Global (All Regs)' },
  { id: 'REGULATION_SPECIFIC', label: 'Regulation Specific' },
];

const inputClass =
  'h-10 w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)]';

function getCourseEndDateForRegulation(r: Regulation): string {
  if (r.scopes && r.scopes.length > 0) {
    for (const scope of r.scopes) {
      if (scope.batch) {
        const parts = scope.batch.split('-').map((p) => p.trim());
        if (parts.length === 2 && parts[1].length === 4) {
          return `${parts[1]}-06-30`;
        }
        if (parts.length === 2 && parts[1].length === 2) {
          const startYear = parseInt(parts[0], 10);
          if (!isNaN(startYear)) {
            const endYear = Math.floor(startYear / 100) * 100 + parseInt(parts[1], 10);
            return `${endYear}-06-30`;
          }
        }
        const singleYear = parseInt(parts[0], 10);
        if (!isNaN(singleYear) && singleYear > 2000) {
          return `${singleYear + 4}-06-30`;
        }
      }
    }
  }

  const match = r.code.match(/R?(\d{2})/i);
  if (match) {
    const codeYearShort = parseInt(match[1], 10);
    const codeStartYear = codeYearShort > 50 ? 1900 + codeYearShort : 2000 + codeYearShort;
    const courseEndYear = codeStartYear + 4;
    return `${courseEndYear}-06-30`;
  }

  if (r.effectiveDate) {
    const effYear = new Date(r.effectiveDate).getFullYear();
    if (!isNaN(effYear)) {
      return `${effYear + 4}-06-30`;
    }
  }

  const currentYear = new Date().getFullYear();
  return `${currentYear}-06-30`;
}

export default function FeeHeadsPage() {
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([]);
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Search and Filter State
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');

  // Popup 1: Fee Head Master Catalog Popup (Shows existing heads & create form inside)
  const [isMasterPopupOpen, setIsMasterPopupOpen] = useState(false);
  const [editingMasterHead, setEditingMasterHead] = useState<FeeHead | null>(null);

  // Popup 2: Configure Pricing & Amount Mapping Modal
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [targetHeadForPricing, setTargetHeadForPricing] = useState<FeeHead | null>(null);

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Fee Head Master Form State
  const [masterName, setMasterName] = useState('');
  const [masterCode, setMasterCode] = useState('');
  const [masterDescription, setMasterDescription] = useState('');
  const [isMandatory, setIsMandatory] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Pricing & Amount Mapping Form State
  type FeeHeadSlabItem = {
    id: string;
    startDate: string;
    endDate: string;
    amount: string;
    label: string;
  };

  const [pricingType, setPricingType] = useState<FeeHeadType>('GLOBAL');
  const [defaultAmount, setDefaultAmount] = useState<string>('1000');
  const [regAmountsMap, setRegAmountsMap] = useState<Record<string, string>>({});
  const [regEffectiveUntilMap, setRegEffectiveUntilMap] = useState<Record<string, string>>({});
  const [regAmountAfterEndMap, setRegAmountAfterEndMap] = useState<Record<string, string>>({});
  const [regSlabsMap, setRegSlabsMap] = useState<Record<string, FeeHeadSlabItem[]>>({});
  const [expandedRegCodes, setExpandedRegCodes] = useState<Record<string, boolean>>({});

  // Global Time Period Presets
  const [globalEffectiveUntil, setGlobalEffectiveUntil] = useState('');
  const [globalAmountAfterEnd, setGlobalAmountAfterEnd] = useState('');

  // Deleting State
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [headsData, regsData] = await Promise.all([
        api.getFeeHeads(),
        api.getRegulations().catch(() => []),
      ]);
      setFeeHeads(headsData);
      setRegulations(regsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load fee heads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Open Master Catalog Popup
  const openMasterPopup = (headToEdit?: FeeHead) => {
    if (headToEdit) {
      setEditingMasterHead(headToEdit);
      setMasterName(headToEdit.name);
      setMasterCode(headToEdit.code);
      setMasterDescription(headToEdit.description || '');
      setIsMandatory(headToEdit.isMandatory);
      setIsActive(headToEdit.isActive);
    } else {
      setEditingMasterHead(null);
      setMasterName('');
      setMasterCode('');
      setMasterDescription('');
      setIsMandatory(false);
      setIsActive(true);
    }
    setModalError('');
    setIsMasterPopupOpen(true);
  };

  // Open Pricing & Amount Mapping Modal
  const openPricingModal = (head: FeeHead) => {
    setTargetHeadForPricing(head);
    setPricingType(head.type || 'GLOBAL');
    setDefaultAmount(String(head.defaultAmount || 0));
    setGlobalEffectiveUntil('');
    setGlobalAmountAfterEnd('');
    setModalError('');

    const map: Record<string, string> = {};
    const untilMap: Record<string, string> = {};
    const afterMap: Record<string, string> = {};
    const slabsMap: Record<string, FeeHeadSlabItem[]> = {};
    const expanded: Record<string, boolean> = {};

    regulations.forEach((r, idx) => {
      const existing = (head.regulationAmounts || []).find(
        (entry) => entry.regulationCode.toUpperCase() === r.code.toUpperCase(),
      );
      const courseEndDate = getCourseEndDateForRegulation(r);
      map[r.code] = existing ? String(existing.amount) : String(head.defaultAmount || 0);
      untilMap[r.code] = existing?.effectiveUntil ? String(existing.effectiveUntil) : courseEndDate;
      afterMap[r.code] = existing?.amountAfterEnd != null ? String(existing.amountAfterEnd) : '';

      if (existing?.slabs && existing.slabs.length > 0) {
        slabsMap[r.code] = existing.slabs.map((s, i) => ({
          id: String(i + 1),
          startDate: s.startDate || '',
          endDate: s.endDate || '',
          amount: String(s.amount || 0),
          label: s.label || '',
        }));
      } else {
        slabsMap[r.code] = [
          {
            id: '1',
            startDate: '',
            endDate: untilMap[r.code],
            amount: map[r.code],
            label: 'Standard Period',
          },
        ];
      }

      // Expand first regulation by default
      expanded[r.code] = idx === 0;
    });

    setRegAmountsMap(map);
    setRegEffectiveUntilMap(untilMap);
    setRegAmountAfterEndMap(afterMap);
    setRegSlabsMap(slabsMap);
    setExpandedRegCodes(expanded);
    setIsPricingModalOpen(true);
  };

  const closePopups = () => {
    setIsMasterPopupOpen(false);
    setIsPricingModalOpen(false);
    setEditingMasterHead(null);
    setTargetHeadForPricing(null);
    setModalError('');
  };

  // Save Fee Head Master inside Master Popup
  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterName.trim()) {
      setModalError('Fee Head Name is required');
      return;
    }
    if (!masterCode.trim()) {
      setModalError('Fee Head Code is required');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      if (editingMasterHead) {
        await api.updateFeeHead(editingMasterHead.id, {
          name: masterName.trim(),
          code: masterCode.trim().toUpperCase(),
          description: masterDescription.trim() || undefined,
          isMandatory,
          isActive,
        });
        setActionSuccess(`Fee Head Master '${masterName}' updated successfully!`);
      } else {
        await api.createFeeHead({
          name: masterName.trim(),
          code: masterCode.trim().toUpperCase(),
          description: masterDescription.trim() || undefined,
          type: 'GLOBAL',
          defaultAmount: 0,
          regulationAmounts: [],
          isMandatory,
          isActive,
        });
        setActionSuccess(`Fee Head Master '${masterName}' created successfully! You can now configure its pricing.`);
      }

      setEditingMasterHead(null);
      setMasterName('');
      setMasterCode('');
      setMasterDescription('');
      setIsMandatory(false);
      setIsActive(true);

      void loadData();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to save Fee Head Master.');
    } finally {
      setSaving(false);
    }
  };

  const addSlabToReg = (code: string, courseEndDate: string) => {
    const current = regSlabsMap[code] || [];
    const lastSlab = current[current.length - 1];
    const newId = String(Date.now());
    const newSlab: FeeHeadSlabItem = {
      id: newId,
      startDate: lastSlab?.endDate || '',
      endDate: courseEndDate || '',
      amount: String(parseFloat(lastSlab?.amount || defaultAmount || '1000') + 500),
      label: `Late Slab ${current.length}`,
    };
    setRegSlabsMap((prev) => ({
      ...prev,
      [code]: [...(prev[code] || []), newSlab],
    }));
  };

  const removeSlabFromReg = (code: string, slabId: string) => {
    setRegSlabsMap((prev) => ({
      ...prev,
      [code]: (prev[code] || []).filter((s) => s.id !== slabId),
    }));
  };

  const updateSlabInReg = (code: string, slabId: string, field: keyof FeeHeadSlabItem, val: string) => {
    setRegSlabsMap((prev) => ({
      ...prev,
      [code]: (prev[code] || []).map((s) => (s.id === slabId ? { ...s, [field]: val } : s)),
    }));
  };

  const toggleExpandReg = (code: string) => {
    setExpandedRegCodes((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  // Save Pricing & Amount Mapping
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHeadForPricing) return;

    const numDefaultAmount = parseFloat(defaultAmount);
    if (isNaN(numDefaultAmount) || numDefaultAmount < 0) {
      setModalError('Please enter a valid default amount');
      return;
    }

    const regAmounts: RegulationAmountInput[] = [];
    if (pricingType === 'REGULATION_SPECIFIC') {
      for (const r of regulations) {
        const amtStr = regAmountsMap[r.code] ?? defaultAmount;
        const amtVal = parseFloat(amtStr);
        if (isNaN(amtVal) || amtVal < 0) {
          setModalError(`Please enter a valid base amount for regulation ${r.code}`);
          return;
        }

        const rawSlabs = regSlabsMap[r.code] || [];
        const slabs = rawSlabs.map((s, sIdx) => ({
          startDate: s.startDate ? s.startDate.trim() : null,
          endDate: s.endDate ? s.endDate.trim() : null,
          amount: sIdx === 0 && (parseFloat(s.amount) === 0 || isNaN(parseFloat(s.amount)) || parseFloat(s.amount) !== amtVal)
            ? amtVal
            : (parseFloat(s.amount) || 0),
          label: s.label ? s.label.trim() : '',
        }));

        if (slabs.length === 1 && slabs[0]) {
          slabs[0].amount = amtVal;
        }

        const primaryEndDate = slabs[0]?.endDate || regEffectiveUntilMap[r.code] || null;
        const primaryAfterEnd = slabs[1]?.amount != null ? slabs[1].amount : (parseFloat(regAmountAfterEndMap[r.code]) || null);

        regAmounts.push({
          regulationId: String(r.id),
          regulationCode: r.code,
          amount: amtVal,
          effectiveUntil: primaryEndDate,
          amountAfterEnd: primaryAfterEnd,
          slabs,
        });
      }
    }

    setSaving(true);
    setModalError('');
    try {
      await api.updateFeeHead(targetHeadForPricing.id, {
        type: pricingType,
        defaultAmount: numDefaultAmount,
        regulationAmounts: pricingType === 'REGULATION_SPECIFIC' ? regAmounts : [],
      });

      setActionSuccess(`Pricing for '${targetHeadForPricing.name}' updated successfully!`);
      closePopups();
      void loadData();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to save pricing.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (head: FeeHead) => {
    try {
      await api.updateFeeHead(head.id, { isActive: !head.isActive });
      setActionSuccess(`Fee head '${head.name}' ${!head.isActive ? 'activated' : 'deactivated'}.`);
      void loadData();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update fee head status.');
    }
  };

  const handleDelete = async (head: FeeHead) => {
    if (!window.confirm(`Are you sure you want to delete Fee Head '${head.name}'?`)) {
      return;
    }
    setDeletingId(head.id);
    try {
      await api.deleteFeeHead(head.id);
      setActionSuccess(`Fee head '${head.name}' deleted.`);
      void loadData();
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete fee head.');
    } finally {
      setDeletingId(null);
    }
  };

  const copyDefaultToAllRegs = () => {
    const updated: Record<string, string> = {};
    regulations.forEach((r) => {
      updated[r.code] = defaultAmount;
    });
    setRegAmountsMap(updated);
  };

  const applyGlobalTimePeriodToAllRegs = () => {
    const updatedUntil: Record<string, string> = {};
    const updatedAfter: Record<string, string> = {};
    regulations.forEach((r) => {
      if (globalEffectiveUntil) updatedUntil[r.code] = globalEffectiveUntil;
      if (globalAmountAfterEnd) updatedAfter[r.code] = globalAmountAfterEnd;
    });
    setRegEffectiveUntilMap({ ...regEffectiveUntilMap, ...updatedUntil });
    setRegAmountAfterEndMap({ ...regAmountAfterEndMap, ...updatedAfter });
  };

  // Filtered List for Main Page
  const filteredFeeHeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return feeHeads.filter((head) => {
      if (scopeFilter !== 'all' && head.type !== scopeFilter) return false;
      if (activeFilter === 'active' && !head.isActive) return false;
      if (activeFilter === 'inactive' && head.isActive) return false;
      if (!q) return true;
      return (
        head.name.toLowerCase().includes(q) ||
        head.code.toLowerCase().includes(q) ||
        (head.description || '').toLowerCase().includes(q)
      );
    });
  }, [feeHeads, search, scopeFilter, activeFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = feeHeads.length;
    const globalCount = feeHeads.filter((h) => h.type === 'GLOBAL').length;
    const regSpecificCount = feeHeads.filter((h) => h.type === 'REGULATION_SPECIFIC').length;
    const mappedCount = feeHeads.filter((h) => Number(h.defaultAmount) > 0 || (h.regulationAmounts && h.regulationAmounts.length > 0)).length;
    const activeCount = feeHeads.filter((h) => h.isActive).length;

    return { total, globalCount, regSpecificCount, mappedCount, activeCount };
  }, [feeHeads]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fee Heads Creation & Pricing"
        description="Manage fee heads and set global or regulation-specific fee amounts, time window deadlines, and revised post-date pricing."
        action={
          <Button type="button" onClick={() => openMasterPopup()} className="shadow-md">
            Fee Head Master Popup
          </Button>
        }
      />

      {actionSuccess ? (
        <Alert tone="success">
          {actionSuccess}
        </Alert>
      ) : null}

      {/* KPI Stat Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Total Fee Heads"
          value={String(stats.total)}
          hint="Master fee category catalog"
          tone="primary"
        />
        <KpiTile
          label="Global Amount Mapped"
          value={String(stats.globalCount)}
          hint="Flat standard rate across regulations"
          tone="accent"
        />
        <KpiTile
          label="Regulation Specific"
          value={String(stats.regSpecificCount)}
          hint="Custom amounts per regulation (R18, R20, R22)"
          tone="warning"
        />
        <KpiTile
          label="Active Fee Heads"
          value={String(stats.activeCount)}
          hint={`${stats.total - stats.activeCount} inactive head(s)`}
          tone="success"
        />
      </section>

      {/* Unified Single View Card */}
      <Card>
        <CardHeader
          title="Fee Heads & Amount Mappings"
          description={
            loading
              ? 'Loading fee heads…'
              : `${filteredFeeHeads.length} fee head${filteredFeeHeads.length !== 1 ? 's' : ''} listed`
          }
          action={
            <div className="flex flex-wrap items-center gap-3">
              <StatusFilter items={scopeTabs} value={scopeFilter} onChange={setScopeFilter} />
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
                className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-medium text-slate-800 outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>
          }
        />
        <CardBody className="space-y-4 !pt-0">
          <div className="max-w-md">
            <SoftSearchField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code, name, or description…"
            />
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          {loading ? (
            <LoadingBlock label="Loading fee heads catalog…" />
          ) : filteredFeeHeads.length === 0 ? (
            <EmptyState
              title="No fee heads found"
              description="No fee heads match your current search and filters. Click 'Fee Head Master' to view existing master heads or create a new one."
              action={
                <Button type="button" size="sm" onClick={() => openMasterPopup()}>
                  Fee Head Master Popup
                </Button>
              }
            />
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-[0.6875rem] uppercase tracking-wider text-[var(--muted)] border-y border-[var(--border)]">
                    <th className="px-6 py-3.5 font-semibold">Fee Head Name & Code</th>
                    <th className="px-4 py-3.5 font-semibold">Scope</th>
                    <th className="px-4 py-3.5 font-semibold">Standard Amount</th>
                    <th className="px-4 py-3.5 font-semibold">Regulation-Wise Pricing & Time Slabs</th>
                    <th className="px-4 py-3.5 font-semibold">Status</th>
                    <th className="px-6 py-3.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeeHeads.map((head) => {
                    const isGlobal = head.type === 'GLOBAL';
                    const isUnmapped = Number(head.defaultAmount) === 0 && (!head.regulationAmounts || head.regulationAmounts.length === 0);

                    return (
                      <tr
                        key={head.id}
                        className="border-b border-[var(--border)] transition hover:bg-[var(--primary-soft)]/20"
                      >
                        <td className="px-6 py-4 align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{head.name}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 border border-slate-200">
                              {head.code}
                            </span>
                            {head.isMandatory ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                Mandatory
                              </span>
                            ) : null}
                          </div>
                          {head.description ? (
                            <p className="mt-1 text-xs text-[var(--muted)] line-clamp-1">
                              {head.description}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-4 py-4 align-top">
                          {isUnmapped ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                              Pending Pricing
                            </span>
                          ) : isGlobal ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                              Global
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 border border-slate-200">
                              Regulation Specific
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top tabular-nums font-semibold text-slate-900">
                          {money(head.defaultAmount)}
                        </td>

                        <td className="px-4 py-4 align-top">
                          {isUnmapped ? (
                            <span className="text-xs text-amber-700 italic font-medium">
                              No amount configured yet. Click Configure Pricing.
                            </span>
                          ) : isGlobal ? (
                            <span className="text-xs text-[var(--muted)] italic">
                              Uniform {money(head.defaultAmount)} across all regulations
                            </span>
                          ) : head.regulationAmounts && head.regulationAmounts.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {head.regulationAmounts.map((r) => (
                                <span
                                  key={r.regulationCode}
                                  className="inline-flex flex-col rounded-md bg-slate-50 px-2.5 py-1.5 text-xs border border-slate-200 shadow-2xs"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900">Reg {r.regulationCode}:</span>
                                    <span className="tabular-nums font-bold text-slate-900">
                                      {money(r.amount)}
                                    </span>
                                  </div>
                                  {r.effectiveUntil ? (
                                    <span className="text-[10px] text-slate-600 font-semibold mt-0.5">
                                      Until {r.effectiveUntil}
                                      {r.amountAfterEnd != null ? ` → then ${money(r.amountAfterEnd)}` : ''}
                                    </span>
                                  ) : null}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600 font-medium">
                              Falls back to default ({money(head.defaultAmount)})
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(head)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition ${
                              head.isActive
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                head.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            {head.isActive ? 'Active' : 'Inactive'}
                          </button>
                        </td>

                        <td className="px-6 py-4 align-top text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => openPricingModal(head)}
                            >
                              Configure Pricing
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openMasterPopup(head)}
                            >
                              Edit Master
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              disabled={deletingId === head.id}
                              onClick={() => handleDelete(head)}
                            >
                              {deletingId === head.id ? 'Deleting…' : 'Delete'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* POPUP 1: FEE HEAD MASTER POPUP (Shows Existing Masters + Create Form Inside) */}
      {isMasterPopupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Fee Head Master Catalog
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Create a new fee head master or view/edit existing fee head master categories.
                </p>
              </div>
              <button
                type="button"
                onClick={closePopups}
                className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                Close
              </button>
            </div>

            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}

            {/* Create / Edit Form Box Inside Popup */}
            <div className="rounded-xl border border-[var(--border)] bg-slate-50/70 p-5 space-y-4">
              <h4 className="text-sm font-bold text-slate-900">
                {editingMasterHead ? `Edit Fee Head Master: ${editingMasterHead.name}` : '+ Create New Fee Head Master'}
              </h4>

              <form onSubmit={handleSaveMaster} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Fee Head Name <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      required
                      value={masterName}
                      onChange={(e) => setMasterName(e.target.value)}
                      placeholder="e.g., Condonation Fee, Lab Fee, Caution Deposit"
                      className={inputClass}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Fee Head Code <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      required
                      value={masterCode}
                      onChange={(e) => setMasterCode(e.target.value.toUpperCase())}
                      placeholder="e.g., COND01, LAB01, CERT01"
                      className={inputClass}
                    />
                  </label>
                </div>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Description</span>
                  <input
                    type="text"
                    value={masterDescription}
                    onChange={(e) => setMasterDescription(e.target.value)}
                    placeholder="Brief description of this fee head category..."
                    className={inputClass}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <span className="text-xs font-medium text-slate-800">Active Status</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMandatory}
                      onChange={(e) => setIsMandatory(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]"
                    />
                    <span className="text-xs font-medium text-slate-800">Mandatory Fee</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  {editingMasterHead ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingMasterHead(null);
                        setMasterName('');
                        setMasterCode('');
                        setMasterDescription('');
                      }}
                    >
                      Cancel Edit
                    </Button>
                  ) : null}
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? 'Saving…' : editingMasterHead ? 'Update Master' : '+ Create Master'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Existing Fee Head Masters List Inside Popup */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                Existing Fee Head Masters ({feeHeads.length})
              </h4>

              {feeHeads.length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">
                  No fee head masters created yet. Fill out the form above to create your first fee head master!
                </p>
              ) : (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 sticky top-0 border-b border-[var(--border)]">
                      <tr className="uppercase text-[10px] font-semibold text-slate-600">
                        <th className="px-4 py-2">Code</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {feeHeads.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono font-semibold text-slate-800">{h.code}</td>
                          <td className="px-4 py-2 font-bold text-slate-900">{h.name}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${h.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                              {h.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMasterHead(h);
                                setMasterName(h.name);
                                setMasterCode(h.code);
                                setMasterDescription(h.description || '');
                                setIsMandatory(h.isMandatory);
                                setIsActive(h.isActive);
                              }}
                              className="text-xs font-semibold text-[var(--primary)] hover:underline"
                            >
                              Edit
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(h)}
                              className="text-xs font-semibold text-rose-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-[var(--border)]">
              <Button type="button" variant="ghost" onClick={closePopups}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* POPUP 2: CONFIGURE PRICING & AMOUNT MAPPING MODAL */}
      {isPricingModalOpen && targetHeadForPricing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl flex flex-col space-y-4 my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Configure Pricing: {targetHeadForPricing.name}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Code: <span className="font-mono font-bold text-slate-800">{targetHeadForPricing.code}</span> — Set global flat amount or custom regulation-specific pricing and date slabs.
                </p>
              </div>
              <button
                type="button"
                onClick={closePopups}
                className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
              >
                Close
              </button>
            </div>

            {modalError ? <Alert tone="danger">{modalError}</Alert> : null}

            {/* Scrollable Form Body */}
            <form onSubmit={handleSavePricing} className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[62vh]">
              {/* Scope Selection */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">
                  Pricing Scope <span className="text-rose-500">*</span>
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setPricingType('GLOBAL')}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      pricingType === 'GLOBAL'
                        ? 'border-slate-800 bg-slate-100/70 ring-2 ring-slate-400/20'
                        : 'border-[var(--border)] hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">Global Pricing</p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        Standard flat amount applies universally to all regulations.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPricingType('REGULATION_SPECIFIC')}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      pricingType === 'REGULATION_SPECIFIC'
                        ? 'border-slate-800 bg-slate-100/70 ring-2 ring-slate-400/20'
                        : 'border-[var(--border)] hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-slate-900">Regulation Specific Pricing</p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        Expandable regulation accordions with custom time period & fee slabs.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Standard Default Amount */}
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">
                  {pricingType === 'GLOBAL' ? 'Global Standard Amount (₹)' : 'Default Fallback Amount (₹)'}{' '}
                  <span className="text-rose-500">*</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={defaultAmount}
                  onChange={(e) => setDefaultAmount(e.target.value)}
                  className={inputClass}
                />
              </label>

              {/* Regulation Specific Accordion List */}
              {pricingType === 'REGULATION_SPECIFIC' ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                        Regulation Specific Expandable Configurations
                      </h4>
                      <p className="text-[11px] text-slate-600">
                        Expand each regulation to set base fee amounts and add custom date-range fee slabs.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyDefaultToAllRegs}
                      className="!text-[11px] !py-1 text-slate-700 hover:bg-slate-200/60"
                    >
                      Copy Default Amount to All
                    </Button>
                  </div>

                  {regulations.length === 0 ? (
                    <p className="text-xs text-[var(--muted)] italic">
                      No regulations registered in the system yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {regulations.map((r) => {
                        const courseEndDate = getCourseEndDateForRegulation(r);
                        const isExpanded = Boolean(expandedRegCodes[r.code]);
                        const slabs = regSlabsMap[r.code] || [];
                        const regAmount = regAmountsMap[r.code] ?? defaultAmount;

                        return (
                          <div
                            key={r.id}
                            className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs transition"
                          >
                            {/* Accordion Header */}
                            <button
                              type="button"
                              onClick={() => toggleExpandReg(r.code)}
                              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100/80 transition cursor-pointer text-left border-b border-slate-100"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-900 border border-slate-200">
                                  Regulation {r.code}
                                </span>
                                <span className="text-xs font-semibold text-slate-800">
                                  {r.name}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">
                                  · Course End: {courseEndDate}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                                  Base: ₹{regAmount} · {slabs.length} Slab{slabs.length !== 1 ? 's' : ''}
                                </span>
                                <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                                  {isExpanded ? 'Collapse ▲' : 'Expand ▼'}
                                </span>
                              </div>
                            </button>

                            {/* Accordion Content */}
                            {isExpanded ? (
                              <div className="p-4 border-t border-slate-100 space-y-4 bg-white animate-in fade-in duration-150">
                                {/* Base Amount & Course End Date Banner */}
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block space-y-1">
                                    <span className="text-xs font-semibold text-slate-700">
                                      Standard Base Amount (₹) <span className="text-rose-500">*</span>
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={regAmountsMap[r.code] ?? defaultAmount}
                                      onChange={(e) => {
                                        const newAmt = e.target.value;
                                        setRegAmountsMap((prev) => ({ ...prev, [r.code]: newAmt }));
                                        setRegSlabsMap((prev) => {
                                          const existingSlabs = prev[r.code] || [];
                                          if (existingSlabs.length > 0) {
                                            const updatedSlabs = [...existingSlabs];
                                            updatedSlabs[0] = { ...updatedSlabs[0], amount: newAmt };
                                            return { ...prev, [r.code]: updatedSlabs };
                                          }
                                          return prev;
                                        });
                                      }}
                                      className="h-9 w-full rounded-lg border border-slate-200 px-3 font-semibold tabular-nums text-xs text-slate-900 focus:border-slate-600 focus:ring-1 focus:ring-slate-400 outline-none"
                                    />
                                  </label>

                                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200 flex flex-col justify-center">
                                    <span className="text-[11px] font-bold text-slate-900">
                                      Course End Date: {courseEndDate}
                                    </span>
                                    <span className="text-[10px] text-slate-600">
                                      Default cutoff date prefilled into time slabs below.
                                    </span>
                                  </div>
                                </div>

                                {/* Multi-Slabs Table/List */}
                                <div className="space-y-2 pt-1 border-t border-slate-100">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                      Time Period & Fee Slabs ({slabs.length})
                                    </span>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => addSlabToReg(r.code, courseEndDate)}
                                      className="!text-xs !py-1 !px-2.5"
                                    >
                                      + Add Time Slab
                                    </Button>
                                  </div>

                                  {slabs.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-2">
                                      No custom slabs defined. The standard base amount applies indefinitely.
                                    </p>
                                  ) : (
                                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                      {slabs.map((s, sIdx) => (
                                        <div
                                          key={s.id}
                                          className="grid gap-2 sm:grid-cols-12 items-center rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs"
                                        >
                                          <div className="sm:col-span-3 space-y-0.5">
                                            <span className="text-[10px] font-semibold text-slate-500">
                                              Start Date
                                            </span>
                                            <input
                                              type="date"
                                              value={s.startDate}
                                              onChange={(e) =>
                                                updateSlabInReg(r.code, s.id, 'startDate', e.target.value)
                                              }
                                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                                            />
                                          </div>

                                          <div className="sm:col-span-3 space-y-0.5">
                                            <span className="text-[10px] font-semibold text-slate-500">
                                              End Date (Deadline)
                                            </span>
                                            <input
                                              type="date"
                                              value={s.endDate}
                                              onChange={(e) =>
                                                updateSlabInReg(r.code, s.id, 'endDate', e.target.value)
                                              }
                                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                                            />
                                          </div>

                                          <div className="sm:col-span-2 space-y-0.5">
                                            <span className="text-[10px] font-semibold text-slate-500">
                                              Amount (₹)
                                            </span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="1"
                                              value={s.amount}
                                              onChange={(e) =>
                                                updateSlabInReg(r.code, s.id, 'amount', e.target.value)
                                              }
                                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold tabular-nums text-slate-900"
                                            />
                                          </div>

                                          <div className="sm:col-span-3 space-y-0.5">
                                            <span className="text-[10px] font-semibold text-slate-500">
                                              Label / Note
                                            </span>
                                            <input
                                              type="text"
                                              placeholder={`e.g. Slab ${sIdx + 1}`}
                                              value={s.label}
                                              onChange={(e) =>
                                                updateSlabInReg(r.code, s.id, 'label', e.target.value)
                                              }
                                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                                            />
                                          </div>

                                          <div className="sm:col-span-1 flex justify-end pt-3 sm:pt-0">
                                            <button
                                              type="button"
                                              onClick={() => removeSlabFromReg(r.code, s.id)}
                                              className="rounded-md p-1 text-xs font-bold text-rose-600 hover:bg-rose-100 transition"
                                              title="Remove slab"
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)] shrink-0">
                <Button type="button" variant="ghost" onClick={closePopups} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving Pricing…' : 'Save Pricing & Amount Mapping'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
