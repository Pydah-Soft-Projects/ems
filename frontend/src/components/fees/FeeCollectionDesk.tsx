'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  ExamFeeRecord,
  OfflinePaymentInput,
  Payment,
  PaymentMethod,
} from '@/types/fee';
import { StudentExamListItem } from '@/types/exam';
import { SdmsStudent } from '@/types/sdms';
import { money } from './money';
import { RazorpayInlinePay } from '@/components/fees/RazorpayInlinePay';
import { SelfOnlinePayPanel } from '@/components/fees/SelfOnlinePayPanel';
import { CanaraUpiPayPanel } from '@/components/fees/CanaraUpiPayPanel';
import { StaffApplyModal } from '@/components/fees/StaffApplyModal';
import { calcUpiConvenienceFee, paymentLineLabel } from '@/lib/upiConvenienceFee';

type CollectChannel = PaymentMethod | 'razorpay' | 'self_online' | 'canara_upi';

interface FeeCollectionDeskProps {
  rollNumber: string;
}

export function FeeCollectionDesk({ rollNumber }: FeeCollectionDeskProps) {
  const router = useRouter();
  const user = getStoredUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sdms, setSdms] = useState<SdmsStudent | null>(null);
  const [studentName, setStudentName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [paymentMethod, setPaymentMethod] = useState<CollectChannel>('cash');
  const [collectedBy] = useState(
    user?.fullName || user?.username || '',
  );
  const [bankName, setBankName] = useState('');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState('');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [selfOnlineReady, setSelfOnlineReady] = useState(false);
  const [canaraUpiReady, setCanaraUpiReady] = useState(false);
  const [razorpayRecord, setRazorpayRecord] = useState<ExamFeeRecord | null>(
    null,
  );
  const [selfOnlineRecord, setSelfOnlineRecord] =
    useState<ExamFeeRecord | null>(null);
  const [canaraUpiRecord, setCanaraUpiRecord] = useState<ExamFeeRecord | null>(
    null,
  );
  const [eligibleExams, setEligibleExams] = useState<StudentExamListItem[]>([]);
  const [eligibleError, setEligibleError] = useState('');
  const [applyExam, setApplyExam] = useState<StudentExamListItem | null>(null);

  const loadEligibleExams = async (studentId: number) => {
    setEligibleError('');
    try {
      setEligibleExams(await api.getStudentExamsForStaff(studentId));
    } catch (err) {
      setEligibleExams([]);
      setEligibleError(
        err instanceof ApiError
          ? err.message
          : 'Could not load eligible examinations.',
      );
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [lookup, rzStatus, selfStatus, canaraStatus] = await Promise.all([
        api.lookupFeeCollection(rollNumber),
        api.getRazorpayStatus().catch(() => ({
          enabled: false,
          configured: false,
          ready: false,
        })),
        api.getSelfOnlineStatus().catch(() => ({
          enabled: false,
          configured: false,
          ready: false,
          upiId: null,
          merchantName: '',
          paymentNote: '',
          expiryHours: 48,
        })),
        api.getCanaraUpiStatus().catch(() => ({
          enabled: false,
          configured: false,
          ready: false,
        })),
      ]);
      setRazorpayReady(rzStatus.ready);
      setSelfOnlineReady(selfStatus.ready);
      setCanaraUpiReady(canaraStatus.ready);
      setRecords(lookup.records);
      setStudentName(lookup.studentName ?? '');
      const pending = lookup.records.filter((r) => r.status === 'pending');
      setSelectedIds(new Set(pending.slice(0, 1).map((r) => r.id)));

      try {
        const pay = await api.getPayments(undefined, lookup.rollNumber);
        setPayments(pay);
      } catch {
        setPayments([]);
      }

      try {
        // search matches name, PIN, and admission number (2026 batch has no PIN yet)
        const res = await api.getSdmsStudents({
          search: rollNumber,
          limit: 10,
        });
        const exact =
          res.items.find(
            (s) =>
              s.pinNo?.toLowerCase() === rollNumber.toLowerCase() ||
              s.admissionNumber?.toLowerCase() === rollNumber.toLowerCase(),
          ) ?? res.items[0] ?? null;
        setSdms(exact);
        if (exact?.studentName) setStudentName(exact.studentName);
        if (exact) {
          await loadEligibleExams(exact.id);
        } else {
          setEligibleExams([]);
        }
      } catch {
        setSdms(null);
        setEligibleExams([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load student fee details.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollNumber]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of records) {
      if (r.exam?.yearOfStudy) set.add(r.exam.yearOfStudy);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [records]);

  const yearSummaries = useMemo(() => {
    return years.map((y) => {
      const rows = records.filter((r) => r.exam?.yearOfStudy === y);
      const balance = rows
        .filter((r) => r.status === 'pending')
        .reduce((s, r) => s + Number(r.totalAmount), 0);
      const paid = rows
        .filter((r) => r.status === 'paid')
        .reduce((s, r) => s + Number(r.totalAmount), 0);
      const total = rows.reduce((s, r) => s + Number(r.totalAmount), 0);
      return {
        year: y,
        balance,
        paid,
        total,
        status: balance > 0 ? 'DUE' : 'PAID',
      };
    });
  }, [records, years]);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (yearFilter !== 'all' && r.exam?.yearOfStudy !== yearFilter) {
        return false;
      }
      if (statusFilter === 'active' && r.status !== 'pending') return false;
      return true;
    });
  }, [records, yearFilter, statusFilter]);

  const totalDue = useMemo(
    () =>
      records
        .filter((r) => r.status === 'pending')
        .reduce((s, r) => s + Number(r.totalAmount), 0),
    [records],
  );

  const selectedPending = useMemo(
    () =>
      records.filter(
        (r) => selectedIds.has(r.id) && r.status === 'pending',
      ),
    [records, selectedIds],
  );

  const collectTotal = selectedPending.reduce(
    (s, r) => s + Number(r.totalAmount),
    0,
  );

  function toggleRecord(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmPayment(e: FormEvent) {
    e.preventDefault();
    if (selectedPending.length === 0) {
      setPayError('Select at least one pending fee to collect.');
      return;
    }

    if (paymentMethod === 'razorpay') {
      if (!razorpayReady) {
        setPayError(
          'Razorpay is not configured. Enable it under Settings → Razorpay.',
        );
        return;
      }
      if (selectedPending.length !== 1) {
        setPayError('Select exactly one fee row for online Razorpay payment.');
        return;
      }
      setPayError('');
      setSelfOnlineRecord(null);
      setCanaraUpiRecord(null);
      setRazorpayRecord(selectedPending[0]);
      return;
    }

    if (paymentMethod === 'self_online') {
      if (!selfOnlineReady) {
        setPayError(
          'Self Online is not configured. Enable Merchant UPI ID under Settings → Self Online UPI.',
        );
        return;
      }
      if (selectedPending.length !== 1) {
        setPayError('Select exactly one fee row for Self Online UPI payment.');
        return;
      }
      setPayError('');
      setRazorpayRecord(null);
      setCanaraUpiRecord(null);
      setSelfOnlineRecord(selectedPending[0]);
      return;
    }

    if (paymentMethod === 'canara_upi') {
      if (!canaraUpiReady) {
        setPayError(
          'Canara UPI is not configured. Add credentials under Settings → Canara Bank UPI.',
        );
        return;
      }
      if (selectedPending.length !== 1) {
        setPayError('Select exactly one fee row for Canara Bank UPI payment.');
        return;
      }
      setPayError('');
      setRazorpayRecord(null);
      setSelfOnlineRecord(null);
      setCanaraUpiRecord(selectedPending[0]);
      return;
    }

    if (!collectedBy.trim()) {
      setPayError('Collector name is required.');
      return;
    }
    setSaving(true);
    setPayError('');
    try {
      let lastPaymentId: number | null = null;
      for (const record of selectedPending) {
        const payload: OfflinePaymentInput = {
          feeRecordId: record.id,
          paymentMethod: paymentMethod as PaymentMethod,
          collectedBy: collectedBy.trim(),
          bankName: bankName.trim() || undefined,
          transactionNumber: transactionNumber.trim() || undefined,
          remarks: remarks.trim() || undefined,
        };
        const result = await api.payOffline(payload);
        lastPaymentId = result.payment.id;
      }
      if (lastPaymentId) {
        router.push(`/dashboard/fees/receipt/${lastPaymentId}`);
      } else {
        await load();
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSaving(false);
    }
  }

  const displayName = studentName || sdms?.studentName || rollNumber;
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading fee collection…</p>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
        <Link
          href="/dashboard/fees"
          className="text-sm font-medium text-[var(--primary)]"
        >
          ← Back to fee list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RazorpayInlinePay
        open={razorpayRecord != null}
        record={razorpayRecord}
        paymentMethod="upi"
        variant="overlay"
        prefillName={displayName}
        prefillContact={
          sdms?.preferredMobileNumber || sdms?.studentMobile || undefined
        }
        prefillEmail={sdms?.email || undefined}
        onClose={() => {
          setRazorpayRecord(null);
          void load();
        }}
        onSuccess={(paymentId) => {
          setRazorpayRecord(null);
          router.push(`/dashboard/fees/receipt/${paymentId}`);
        }}
      />

      <SelfOnlinePayPanel
        open={selfOnlineRecord != null}
        record={selfOnlineRecord}
        variant="overlay"
        onClose={() => {
          setSelfOnlineRecord(null);
          void load();
        }}
        onClaimed={async () => {
          // Don't call load() right now to avoid re-opening the dialog!
        }}
      />

      <CanaraUpiPayPanel
        open={canaraUpiRecord != null}
        record={canaraUpiRecord}
        variant="overlay"
        onClose={() => {
          setCanaraUpiRecord(null);
          void load();
        }}
        onPaid={(paymentId) => {
          setCanaraUpiRecord(null);
          router.push(`/dashboard/fees/receipt/${paymentId}`);
        }}
      />

      {sdms && applyExam ? (
        <StaffApplyModal
          open={applyExam != null}
          student={sdms}
          examId={applyExam.id}
          examName={applyExam.name}
          onClose={() => setApplyExam(null)}
          onApplied={() => {
            setApplyExam(null);
            void load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href="/dashboard/fees"
            className="text-xs font-medium text-[var(--primary)] hover:underline"
          >
            ← Fee list
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Fee Collection
          </h1>
          <p className="text-sm text-[var(--muted)]">
            Collect examination fees for this student
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          {/* Student banner */}
          <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-md)]">
            <div className="flex flex-wrap items-center gap-4 px-5 py-5">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-lg font-bold text-[var(--primary)]">
                {initials || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-bold text-slate-900">
                    {displayName}
                  </h2>
                  {sdms?.course && (
                    <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-semibold uppercase text-[var(--primary)]">
                      {sdms.course}
                    </span>
                  )}
                  {sdms?.branch && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold uppercase text-[var(--accent-hover)]">
                      {sdms.branch}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <MetaChip
                    label="ADM"
                    value={sdms?.admissionNumber ?? '—'}
                  />
                  <MetaChip label="PIN" value={rollNumber} />
                  <MetaChip
                    label="YR"
                    value={
                      sdms
                        ? `${sdms.currentYear} (S${sdms.currentSemester})`
                        : '—'
                    }
                  />
                  <MetaChip label="BATCH" value={sdms?.batch ?? '—'} />
                  <MetaChip
                    label="STATUS"
                    value={sdms?.studentStatus ?? '—'}
                  />
                </div>
              </div>
              <div className="rounded-[var(--radius)] bg-[var(--accent-soft)] px-4 py-3 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-hover)]">
                  Total due
                </p>
                <p className="text-3xl font-bold tabular-nums text-slate-900">
                  {money(totalDue)}
                </p>
              </div>
            </div>
          </div>

          {/* Year cards */}
          {yearSummaries.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {yearSummaries.map((y) => {
                const active = yearFilter === y.year;
                return (
                  <button
                    key={y.year}
                    type="button"
                    onClick={() =>
                      setYearFilter((prev) =>
                        prev === y.year ? 'all' : y.year,
                      )
                    }
                    className={`rounded-[var(--radius-lg)] border bg-white p-4 text-left shadow-[var(--shadow-sm)] transition ${
                      active
                        ? 'border-[var(--primary)] ring-2 ring-[var(--ring)]'
                        : 'border-[var(--border)] hover:border-[var(--primary)]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-[var(--primary)]">
                          Y{y.year}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          YEAR {y.year}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          y.status === 'PAID'
                            ? 'text-[var(--success)]'
                            : 'text-amber-600'
                        }`}
                      >
                        {y.status}
                      </span>
                    </div>
                    <p
                      className={`mt-3 text-lg font-bold tabular-nums ${
                        y.balance > 0 ? 'text-amber-600' : 'text-[var(--success)]'
                      }`}
                    >
                      {money(y.balance)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Total {money(y.total)} · Paid {money(y.paid)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Eligible examinations — apply on behalf of the student */}
          {sdms && (
            <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    Eligible examinations
                  </h3>
                  <p className="text-xs text-[var(--muted)]">
                    Published exams in this student&apos;s scope — apply here
                    on their behalf, then collect the fee below
                  </p>
                </div>
              </div>
              {eligibleError ? (
                <p className="px-5 py-4 text-sm text-[var(--danger)]">
                  {eligibleError}
                </p>
              ) : eligibleExams.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[var(--muted)]">
                  No published examinations match this student&apos;s
                  college/course/branch/year/semester scope.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                        <th className="px-4 py-3">Examination</th>
                        <th className="px-4 py-3">Application window</th>
                        <th className="px-4 py-3">Applied</th>
                        <th className="px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleExams.map((exam) => (
                        <tr
                          key={exam.id}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {exam.name}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              Y{exam.yearOfStudy} / S{exam.semester} ·{' '}
                              {exam.subjectCount} subject
                              {exam.subjectCount !== 1 ? 's' : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--muted)]">
                            {exam.applicationStartDate ?? '—'} →{' '}
                            {exam.applicationEndDate ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {exam.applications.length === 0 ? (
                              <span className="text-[var(--muted)]">—</span>
                            ) : (
                              exam.applications.map((a) => (
                                <span
                                  key={a.id}
                                  className="mr-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 capitalize"
                                >
                                  {a.examType.replace(/_/g, ' ')} (
                                  {a.feeStatus ?? '—'})
                                </span>
                              ))
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {exam.openTypes.length > 0 ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setApplyExam(exam)}
                              >
                                Apply
                              </Button>
                            ) : (
                              <span className="text-xs font-semibold text-[var(--success)]">
                                Fully applied
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Fee dues */}
          <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Fee dues breakdown
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Examination fees for this student
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'active' | 'all')
                  }
                  className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="active">Active fees</option>
                  <option value="all">All fees</option>
                </select>
                <select
                  value={yearFilter === 'all' ? 'all' : String(yearFilter)}
                  onChange={(e) =>
                    setYearFilter(
                      e.target.value === 'all'
                        ? 'all'
                        : parseInt(e.target.value, 10),
                    )
                  }
                  className="rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="all">All years</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-4 py-3">Select</th>
                    <th className="px-4 py-3">Fee / examination</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Late</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                      >
                        No fees found for this selection.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const balance =
                        r.status === 'pending' ? Number(r.totalAmount) : 0;
                      return (
                        <tr
                          key={r.id}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              disabled={r.status !== 'pending'}
                              checked={selectedIds.has(r.id)}
                              onChange={() => toggleRecord(r.id)}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {r.exam?.name ?? `Exam #${r.examId}`}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              Y{r.exam?.yearOfStudy ?? '—'} / S
                              {r.exam?.semester ?? '—'} ·{' '}
                              {r.feeBreakdown
                                ?.map((b) => b.subjectCode)
                                .join(', ') || 'Exam fee'}
                            </p>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {money(r.baseFee)}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {money(r.lateFee)}
                          </td>
                          <td className="px-4 py-3 font-semibold tabular-nums">
                            {money(balance)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                r.status === 'paid' ? 'success' : 'warning'
                              }
                            >
                              {r.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transactions */}
          <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h3 className="font-semibold text-slate-900">
                Transaction history
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                      >
                        No matching transactions found.
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr
                        key={p.id}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-4 py-3 text-xs text-[var(--muted)]">
                          {new Date(p.paidAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {paymentLineLabel(p)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <div>{p.receiptNumber}</div>
                          {p.transactionReference ? (
                            <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                              Order {p.transactionReference}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 capitalize">
                          <span className="block">
                            {p.paymentMode} / {p.paymentMethod}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              p.status === 'success'
                                ? 'text-[var(--success)]'
                                : p.status === 'voided' || p.status === 'failed'
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums">
                          {money(p.amountPaid)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {p.status === 'success' ? (
                              <Link
                                href={`/dashboard/fees/receipt/${p.id}`}
                                className="text-xs font-semibold text-[var(--primary)] hover:underline"
                              >
                                Receipt
                              </Link>
                            ) : p.status === 'awaiting_verification' ? (
                              <Link
                                href="/dashboard/fees/self-online"
                                className="text-xs font-semibold text-amber-700 hover:underline"
                              >
                                Reconcile
                              </Link>
                            ) : (
                              <span className="text-xs text-[var(--muted)]">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Collect sidebar */}
        <aside className="h-fit rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm xl:sticky xl:top-4">
          <h3 className="text-center text-xs font-bold uppercase tracking-widest text-[var(--primary)]">
            Collect fee
          </h3>

          <form onSubmit={(e) => void confirmPayment(e)} className="mt-5 space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-sm">
              {selectedPending.length === 0 ? (
                <p className="text-[var(--muted)]">
                  Select fee rows on the left
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedPending.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-start justify-between gap-2"
                    >
                      <span className="text-xs text-slate-700">
                        {r.exam?.name ?? `Exam #${r.examId}`}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {money(r.totalAmount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
              <span className="text-sm font-medium text-slate-600">
                Total amount
              </span>
              <span className="text-xl font-bold tabular-nums text-slate-900">
                {money(collectTotal)}
              </span>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Payment method
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['cash', 'Cash'],
                    ['bank_transfer', 'Bank'],
                    ['razorpay', 'Razorpay'],
                    ['self_online', 'Self Online'],
                    ['canara_upi', 'Canara UPI'],
                  ] as const
                ).map(([value, label]) => {
                  const disabled =
                    (value === 'razorpay' && !razorpayReady) ||
                    (value === 'self_online' && !selfOnlineReady) ||
                    (value === 'canara_upi' && !canaraUpiReady);
                  const title =
                    value === 'razorpay' && !razorpayReady
                      ? 'Configure Razorpay in Settings'
                      : value === 'self_online' && !selfOnlineReady
                        ? 'Configure Self Online UPI in Settings'
                        : value === 'canara_upi' && !canaraUpiReady
                          ? 'Configure Canara Bank UPI in Settings'
                          : undefined;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      title={title}
                      onClick={() => setPaymentMethod(value)}
                      className={`rounded-lg px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        paymentMethod === value
                          ? 'bg-[var(--primary)] text-white'
                          : 'border border-[var(--border)] bg-white text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {paymentMethod === 'razorpay' && selectedPending.length === 1 && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  UPI total{' '}
                  {money(
                    calcUpiConvenienceFee(
                      selectedPending[0].totalAmount,
                      'upi',
                    ).total,
                  )}{' '}
                  (fee{' '}
                  {money(selectedPending[0].totalAmount)} + 2.2% convenience)
                </p>
              )}
              {paymentMethod === 'self_online' && (
                <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                  Exact fee amount via college UPI QR. Temporary acknowledgement
                  first; official receipt after statement verification.
                </p>
              )}
              {paymentMethod === 'canara_upi' && (
                <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                  Exact fee via Canara Bank dynamic QR. Fee marks paid when the
                  bank confirms (live callback / status).
                </p>
              )}
              {!razorpayReady && (
                <p className="mt-2 text-xs text-amber-700">
                  Razorpay offline — enable keys in{' '}
                  <Link
                    href="/dashboard/settings"
                    className="font-semibold underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              )}
              {!selfOnlineReady && (
                <p className="mt-2 text-xs text-amber-700">
                  Self Online offline — add Merchant UPI ID in{' '}
                  <Link
                    href="/dashboard/settings"
                    className="font-semibold underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              )}
              {!canaraUpiReady && (
                <p className="mt-2 text-xs text-amber-700">
                  Canara UPI offline — add bank credentials in{' '}
                  <Link
                    href="/dashboard/settings"
                    className="font-semibold underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              )}
            </div>

            {paymentMethod !== 'razorpay' &&
              paymentMethod !== 'self_online' &&
              paymentMethod !== 'canara_upi' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Collected by
              </label>
              <input
                value={collectedBy}
                readOnly
                tabIndex={-1}
                className="w-full cursor-default rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Locked to your signed-in account
              </p>
            </div>
            )}

            {paymentMethod === 'bank_transfer' && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Bank name
                  </label>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Transaction / UTR
                  </label>
                  <input
                    value={transactionNumber}
                    onChange={(e) => setTransactionNumber(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}

            {paymentMethod !== 'razorpay' &&
              paymentMethod !== 'self_online' &&
              paymentMethod !== 'canara_upi' && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Remarks / notes (optional)
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder="Add any additional notes here…"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </div>
            )}

            {payError && (
              <p className="text-sm text-[var(--danger)]">{payError}</p>
            )}

            <Button
              type="submit"
              fullWidth
              disabled={saving || selectedPending.length === 0}
            >
              {saving
                ? 'Processing…'
                : paymentMethod === 'razorpay'
                  ? 'Pay with Razorpay'
                  : paymentMethod === 'self_online'
                    ? 'Open Self Online QR'
                    : paymentMethod === 'canara_upi'
                      ? 'Open Canara UPI QR'
                      : 'Confirm payment'}
            </Button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-0.5 font-medium text-[var(--muted)]">
      <span className="opacity-70">{label}: </span>
      {value}
    </span>
  );
}
