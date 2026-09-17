'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, ExamApplicationReportResponse } from '@/lib/api';
import { Exam } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';

import { downloadExamApplicationReportPdf } from '@/lib/printExamApplicationReport';

function formatMoney(amount: number) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(d);
  }
}

export default function ExamReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'summary' | 'breakdown' | 'students' | 'not_applied'>('summary');

  const [rawReportData, setRawReportData] = useState<ExamApplicationReportResponse | null>(null);
  const initialLoadDone = React.useRef(false);

  const loadData = useCallback(async (isInitial = false) => {
    setLoading(true);
    setError(null);
    try {
      if (isInitial && !initialLoadDone.current) {
        const [examsData, reportData] = await Promise.all([
          api.getExams().catch(() => []),
          api.getExamApplicationReport({
            examId: selectedExamId ? Number(selectedExamId) : undefined,
          }),
        ]);
        setExams(examsData);
        setRawReportData(reportData);
        initialLoadDone.current = true;
      } else {
        const data = await api.getExamApplicationReport({
          examId: selectedExamId ? Number(selectedExamId) : undefined,
        });
        setRawReportData(data);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, [selectedExamId]);

  useEffect(() => {
    void loadData(!initialLoadDone.current);
  }, [selectedExamId, loadData]);

  const availableBatches = useMemo(() => {
    if (!rawReportData) return [];
    const set = new Set<string>();
    rawReportData.items.forEach((item) => item.batch && set.add(item.batch));
    return Array.from(set).sort();
  }, [rawReportData]);

  const availableBranches = useMemo(() => {
    if (!rawReportData) return [];
    const set = new Set<string>();
    rawReportData.items.forEach((item) => item.branch && set.add(item.branch));
    return Array.from(set).sort();
  }, [rawReportData]);

  const reportData = useMemo(() => {
    if (!rawReportData) return null;

    let items = rawReportData.items;

    if (selectedBatch) {
      const b = selectedBatch.trim().toLowerCase();
      items = items.filter((i) => (i.batch || '').toLowerCase() === b);
    }

    if (selectedBranch) {
      const br = selectedBranch.trim().toLowerCase();
      items = items.filter((i) => (i.branch || '').toLowerCase() === br);
    }

    const breakdownMap = new Map<string, {
      examName?: string;
      batch: string;
      branch: string;
      course: string;
      totalEligible: number;
      totalApplied: number;
      paidCount: number;
      notPaidCount: number;
      paidWithLateFeeCount: number;
      totalAmountCollected: number;
      totalLateFeeCollected: number;
    }>();

    for (const b of rawReportData.breakdown) {
      const bExamName = b.examName || 'Multiple/Unknown';
      breakdownMap.set(`${bExamName}||${b.batch}||${b.branch}||${b.course}`, {
        examName: bExamName,
        batch: b.batch,
        branch: b.branch,
        course: b.course,
        totalEligible: b.totalEligible || 0,
        totalApplied: 0,
        paidCount: 0,
        notPaidCount: 0,
        paidWithLateFeeCount: 0,
        totalAmountCollected: 0,
        totalLateFeeCollected: 0,
      });
    }

    for (const item of items) {
      const bExamName = item.examName || 'Multiple/Unknown';
      const key = `${bExamName}||${item.batch}||${item.branch}||${item.course}`;
      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          examName: bExamName,
          batch: item.batch,
          branch: item.branch,
          course: item.course,
          totalEligible: 0,
          totalApplied: 0,
          paidCount: 0,
          notPaidCount: 0,
          paidWithLateFeeCount: 0,
          totalAmountCollected: 0,
          totalLateFeeCollected: 0,
        });
      }
      const b = breakdownMap.get(key)!;
      if (item.status !== 'not_applied') {
        b.totalApplied += 1;
        if (item.isPaid) {
          b.paidCount += 1;
          b.totalAmountCollected += item.totalAmount || 0;
          b.totalLateFeeCollected += item.lateFee || 0;
          if (item.isPaidLateFee) {
            b.paidWithLateFeeCount += 1;
          }
        } else {
          b.notPaidCount += 1;
        }
      }
    }

    let totalEligibleAll = 0;
    const breakdown = Array.from(breakdownMap.values())
      .filter((b) => {
        if (selectedBatch && b.batch.toLowerCase() !== selectedBatch.trim().toLowerCase()) return false;
        if (selectedBranch && b.branch.toLowerCase() !== selectedBranch.trim().toLowerCase()) return false;
        return true;
      })
      .sort((a, b) => 
        (a.examName || '').localeCompare(b.examName || '') || 
        a.batch.localeCompare(b.batch) || 
        a.branch.localeCompare(b.branch)
      );

    for (const b of breakdown) {
      totalEligibleAll += b.totalEligible;
    }

    let listItems = items;
    if (selectedStatus && selectedStatus !== 'all') {
      const s = selectedStatus.toLowerCase().trim();
      if (s === 'paid') {
        listItems = listItems.filter((i) => i.isPaid);
      } else if (s === 'not_paid' || s === 'applied_not_paid') {
        listItems = listItems.filter((i) => !i.isPaid && i.status !== 'not_applied');
      } else if (s === 'paid_with_late_fee') {
        listItems = listItems.filter((i) => i.isPaidLateFee);
      } else if (s === 'not_applied') {
        listItems = listItems.filter((i) => i.status === 'not_applied');
      }
    } else {
      // For 'all' status, we might just want to show applied students by default, 
      // or we can show all depending on what tab is active. 
      // Actually, since we'll have a separate tab for not applied, let's keep listItems as is, 
      // and let the tabs filter it visually, or change selectedStatus when clicking tabs.
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      listItems = listItems.filter(
        (i) =>
          (i.studentRollNumber || '').toLowerCase().includes(term) ||
          (i.studentName || '').toLowerCase().includes(term) ||
          (i.examName || '').toLowerCase().includes(term)
      );
    }

    listItems.sort((a, b) => {
      const branchA = a.branch || '';
      const branchB = b.branch || '';
      if (branchA !== branchB) return branchA.localeCompare(branchB);
      
      const pinA = a.studentRollNumber || '';
      const pinB = b.studentRollNumber || '';
      return pinA.localeCompare(pinB);
    });

    const appliedItems = items.filter((i) => i.status !== 'not_applied');
    const totalApplied = appliedItems.length;
    const paidCount = appliedItems.filter((i) => i.isPaid).length;
    const notPaidCount = appliedItems.filter((i) => !i.isPaid).length;
    const paidWithLateFeeCount = appliedItems.filter((i) => i.isPaidLateFee).length;
    const totalAmountCollected = appliedItems
      .filter((i) => i.isPaid)
      .reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const totalLateFeeCollected = appliedItems
      .filter((i) => i.isPaid)
      .reduce((sum, i) => sum + (i.lateFee || 0), 0);
    return {
      summary: {
        totalEligible: totalEligibleAll,
        totalApplied,
        paidCount,
        notPaidCount,
        paidWithLateFeeCount,
        totalAmountCollected,
        totalLateFeeCollected,
      },
      breakdown,
      items: listItems,
    };
  }, [rawReportData, selectedBatch, selectedBranch, selectedStatus, search]);

  const handlePrintPdf = () => {
    if (!reportData) return;
    const selectedExamObj = exams.find((e) => String(e.id) === selectedExamId);
    downloadExamApplicationReportPdf({
      collegeName: 'PYDAH COLLEGE OF ENGINEERING',
      reportTitle: 'EXAM APPLICATION & PAYMENT STATUS REPORT',
      examName: selectedExamObj
        ? `${selectedExamObj.name} (${(selectedExamObj as unknown as { code?: string }).code || selectedExamObj.status})`
        : 'All Examinations',
      batchFilter: selectedBatch || 'All Batches',
      branchFilter: selectedBranch || 'All Branches',
      statusFilter:
        selectedStatus === 'not_paid'
          ? 'Unpaid / Pending Students Only'
          : selectedStatus === 'paid'
            ? 'Paid Students Only'
            : selectedStatus === 'paid_with_late_fee'
              ? 'Paid with Late Fee Only'
              : 'All Statuses',
      reportData,
    });
  };

  const summary = reportData?.summary ?? {
    totalEligible: 0,
    totalApplied: 0,
    paidCount: 0,
    notPaidCount: 0,
    paidWithLateFeeCount: 0,
    totalAmountCollected: 0,
    totalLateFeeCollected: 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Application Reports"
        description="Summary of student applications, payment status (Paid, Not Paid, Paid with Late Fee), and batch/branch breakdown."
        action={
          <Button variant="secondary" onClick={handlePrintPdf} disabled={!reportData}>
            Print PDF Report
          </Button>
        }
      />

      {/* Filters Bar */}
      <Card className="border-[var(--border)] bg-white shadow-xs">
        <CardBody className="p-4">
          <div className={`grid gap-3 sm:grid-cols-2 ${activeTab === 'students' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Filter Exam</label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">All Examinations</option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} ({(ex as unknown as { code?: string }).code || ex.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Batch</label>
              <select
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">All Batches</option>
                {availableBatches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Branch</label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-[var(--primary)] focus:outline-none"
              >
                <option value="">All Branches</option>
                {availableBranches.map((br) => (
                  <option key={br} value={br}>
                    {br}
                  </option>
                ))}
              </select>
            </div>

            {(activeTab === 'students' || activeTab === 'not_applied') && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Student Status Filter</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-[var(--primary)] focus:outline-none"
                >
                  {activeTab === 'not_applied' ? (
                    <option value="not_applied">Not Applied</option>
                  ) : (
                    <>
                      <option value="all">All Applied</option>
                      <option value="paid">Paid Only</option>
                      <option value="not_paid">Applied but Not Paid</option>
                      <option value="paid_with_late_fee">Paid with Late Fee</option>
                    </>
                  )}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Search Student</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PIN or Name…"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-2xs focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Metric Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Total Eligible</p>
          <p className="mt-1 text-2xl font-bold text-sky-950">{summary.totalEligible}</p>
          <p className="mt-1 text-[11px] text-sky-600">Total eligible in scope</p>
        </div>

        <div
          onClick={() => {
            setSelectedStatus('all');
            setActiveTab('students');
          }}
          className="cursor-pointer rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 to-white p-4 shadow-2xs transition hover:border-indigo-300 hover:shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Total Applied</p>
          <p className="mt-1 text-2xl font-bold text-indigo-950">{summary.totalApplied}</p>
          <p className="mt-1 text-[11px] text-indigo-600">Click to view all applied students</p>
        </div>

        <div
          onClick={() => {
            setSelectedStatus('paid');
            setActiveTab('students');
          }}
          className="cursor-pointer rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-2xs transition hover:border-emerald-300 hover:shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Paid Students</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{summary.paidCount}</p>
          <p className="mt-1 text-[11px] text-emerald-600">Click to view paid students</p>
        </div>

        <div
          onClick={() => {
            setSelectedStatus('not_paid');
            setActiveTab('students');
          }}
          className={`cursor-pointer rounded-xl border p-4 shadow-2xs transition hover:shadow-sm ${
            selectedStatus === 'not_paid'
              ? 'border-rose-400 bg-rose-100/80 ring-2 ring-rose-400/50'
              : 'border-rose-200 bg-gradient-to-br from-rose-50/70 to-white hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Applied But Not Paid</p>
            <span className="rounded bg-rose-200/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-900">
              FILTER
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-rose-950">{summary.notPaidCount}</p>
          <p className="mt-1 text-[11px] font-medium text-rose-700">Click to view unpaid students</p>
        </div>

        <div
          onClick={() => {
            setSelectedStatus('paid_with_late_fee');
            setActiveTab('students');
          }}
          className="cursor-pointer rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/70 to-white p-4 shadow-2xs transition hover:border-amber-300 hover:shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Paid with Late Fee</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{summary.paidWithLateFeeCount}</p>
          <p className="mt-1 text-[11px] text-amber-700">
            Late Fee: {formatMoney(summary.totalLateFeeCollected)}
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-2xs">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Total Collected</p>
          <p className="mt-1 text-2xl font-bold text-blue-950">{formatMoney(summary.totalAmountCollected)}</p>
          <p className="mt-1 text-[11px] text-blue-600">Total revenue generated</p>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {loading ? (
        <LoadingBlock label="Loading exam application report data…" />
      ) : (
        <div className="space-y-4">
          <Tabs
            items={[
              { id: 'summary', label: 'Summary Overview' },
              { id: 'breakdown', label: `Batch & Branch Breakdown (${reportData?.breakdown.length ?? 0})` },
              { id: 'students', label: `Applied Students List (${reportData?.items.filter(i => i.status !== 'not_applied').length ?? 0})` },
              { id: 'not_applied', label: `Not Applied Students List (${reportData?.items.filter(i => i.status === 'not_applied').length ?? 0})` },
            ]}
            activeId={activeTab}
            onChange={(id) => {
              setActiveTab(id as 'summary' | 'breakdown' | 'students' | 'not_applied');
              if (id === 'not_applied') {
                setSelectedStatus('not_applied');
              } else if (id === 'students' && selectedStatus === 'not_applied') {
                setSelectedStatus('all');
              }
            }}
          />

          {activeTab === 'summary' && (
            <Card>
              <CardHeader
                title="Batch & Branch Application Overview"
                description="Summary counts of applied, paid, pending, and late-fee paid students grouped by batch and branch."
              />
              <CardBody>
                {reportData?.breakdown.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">No application data found for selected filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-100/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        <tr>
                          {!selectedExamId && <th className="px-3 py-2.5 w-48">Exam Name</th>}
                          <th className="px-3 py-2.5">Batch</th>
                          <th className="px-3 py-2.5">Branch</th>
                          <th className="px-3 py-2.5">Course</th>
                          <th className="px-3 py-2.5 text-center">Eligible</th>
                          <th className="px-3 py-2.5 text-center">Applied</th>
                          <th className="px-3 py-2.5 text-center">Paid</th>
                          <th className="px-3 py-2.5 text-center">Not Paid</th>
                          <th className="px-3 py-2.5 text-center">Paid w/ Late Fee</th>
                          <th className="px-3 py-2.5 text-right">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70">
                        {reportData?.breakdown.map((row, idx) => (
                          <tr key={`${row.examName}-${row.batch}-${row.branch}-${idx}`} className="hover:bg-slate-50/70">
                            {!selectedExamId && (
                              <td className="px-3 py-2.5 text-xs text-slate-600 font-medium">
                                {row.examName || 'N/A'}
                              </td>
                            )}
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{row.batch}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-800">{row.branch}</td>
                            <td className="px-3 py-2.5 text-slate-600">{row.course}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-slate-900">{row.totalEligible}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-indigo-900">{row.totalApplied}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-emerald-700">{row.paidCount}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-rose-600">{row.notPaidCount}</td>
                            <td className="px-3 py-2.5 text-center font-semibold text-amber-800">{row.paidWithLateFeeCount}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                              {formatMoney(row.totalAmountCollected)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {activeTab === 'breakdown' && (
            <Card>
              <CardHeader title="Batch & Branch Breakdown Matrix" description="Detailed counts matrix grouped by Batch and Branch." />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      <tr>
                        {!selectedExamId && <th className="px-3 py-2.5 w-48">Exam Name</th>}
                        <th className="px-3 py-2.5">Batch</th>
                        <th className="px-3 py-2.5">Branch</th>
                        <th className="px-3 py-2.5 text-center">Total Eligible</th>
                        <th className="px-3 py-2.5 text-center">Total Applied</th>
                        <th className="px-3 py-2.5 text-center">Paid Count</th>
                        <th className="px-3 py-2.5 text-center">Not Paid Count</th>
                        <th className="px-3 py-2.5 text-center">Paid with Late Fee</th>
                        <th className="px-3 py-2.5 text-right">Late Fee Collected</th>
                        <th className="px-3 py-2.5 text-right">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {reportData?.breakdown.map((row, idx) => (
                        <tr key={`${row.examName}-${row.batch}-${row.branch}-${idx}`} className="hover:bg-slate-50/70">
                          {!selectedExamId && (
                            <td className="px-3 py-2.5 text-xs text-slate-600 font-medium">
                              {row.examName || 'N/A'}
                            </td>
                          )}
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{row.batch}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-800">{row.branch}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-slate-900">{row.totalEligible}</td>
                          <td className="px-3 py-2.5 text-center font-bold text-indigo-900">{row.totalApplied}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-emerald-700">{row.paidCount}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-rose-600">{row.notPaidCount}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-amber-800">{row.paidWithLateFeeCount}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-amber-900">
                            {formatMoney(row.totalLateFeeCollected)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                            {formatMoney(row.totalAmountCollected)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}

          {(activeTab === 'students' || activeTab === 'not_applied') && (
            <Card>
              <CardHeader
                title={activeTab === 'not_applied' ? 'Not Applied Students' : 'Individual Student Applications & Payments'}
                description={activeTab === 'not_applied' ? 'List of eligible students who have not applied.' : 'Complete list of applied students with fee details and payment status.'}
              />
              <CardBody>
                {reportData?.items.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--muted)]">No student records found matching current criteria.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-100/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                        <tr>
                          <th className="px-3 py-2.5">Roll No / PIN</th>
                          <th className="px-3 py-2.5">Student Name</th>
                          <th className="px-3 py-2.5">Exam Name</th>
                          <th className="px-3 py-2.5">Batch</th>
                          <th className="px-3 py-2.5">Branch</th>
                          <th className="px-3 py-2.5 text-right">Base Fee</th>
                          <th className="px-3 py-2.5 text-right">Late Fee</th>
                          <th className="px-3 py-2.5 text-right">Total Fee</th>
                          <th className="px-3 py-2.5 text-center">Status</th>
                          <th className="px-3 py-2.5">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70">
                        {reportData?.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{item.studentRollNumber}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-900">{item.studentName}</td>
                            <td className="px-3 py-2.5 text-slate-700">{item.examName}</td>
                            <td className="px-3 py-2.5 text-slate-600">{item.batch}</td>
                            <td className="px-3 py-2.5 text-slate-600">{item.branch}</td>
                            <td className="px-3 py-2.5 text-right text-slate-700">{formatMoney(item.baseFee)}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-amber-800">
                              {item.lateFee > 0 ? formatMoney(item.lateFee) : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatMoney(item.totalAmount)}</td>
                            <td className="px-3 py-2.5 text-center">
                              {item.status === 'not_applied' ? (
                                <span className="inline-flex items-center rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-800">
                                  NOT APPLIED
                                </span>
                              ) : item.isPaid ? (
                                item.isPaidLateFee ? (
                                  <span className="inline-flex items-center rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                    PAID (LATE FEE)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                    PAID
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                  APPLIED, NOT PAID
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">{formatDate(item.paidAt || item.submittedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
