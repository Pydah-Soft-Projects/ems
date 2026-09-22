'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  ExamFeeRecord,
  OfflinePaymentInput,
  Payment,
  PaymentMethod,
} from '@/types/fee';
import { formatPaymentIST } from '@/lib/formatIST';
import { StudentExamListItem } from '@/types/exam';
import { SdmsStudent } from '@/types/sdms';
import { money } from './money';
import { RazorpayInlinePay } from '@/components/fees/RazorpayInlinePay';
import { SelfOnlinePayPanel } from '@/components/fees/SelfOnlinePayPanel';
import { CanaraDynamicQrPanel } from '@/components/fees/CanaraDynamicQrPanel';
import { StaffApplyModal } from '@/components/fees/StaffApplyModal';
import { FeeHead, FeeHeadResolution } from '@/types/fee-head';
import type { RevaluationStudentDetail } from '@/types/revaluation';
import {
  calcUpiConvenienceFee,
  feeRecordDisplayName,
  isDuplicateHallTicketFeeRecord,
  paymentLineLabel,
} from '@/lib/upiConvenienceFee';

type CollectChannel =
  | PaymentMethod
  | 'razorpay'
  | 'self_online'
  | 'canara_dynamic_qr';

interface FeeCollectionDeskProps {
  rollNumber: string;
}

export type OptionalResolvedFeeHead = {
  head: FeeHead;
  resolved: FeeHeadResolution;
};

export function FeeCollectionDesk({ rollNumber }: FeeCollectionDeskProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [canaraReady, setCanaraReady] = useState(false);
  const [canaraMissing, setCanaraMissing] = useState<string[]>([]);
  const [canaraMockMode, setCanaraMockMode] = useState(false);
  const [razorpayRecord, setRazorpayRecord] = useState<ExamFeeRecord | null>(
    null,
  );
  const [selfOnlineRecord, setSelfOnlineRecord] =
    useState<ExamFeeRecord | null>(null);
  const [canaraRecord, setCanaraRecord] = useState<ExamFeeRecord | null>(null);
  const [eligibleExams, setEligibleExams] = useState<StudentExamListItem[]>([]);
  const [eligibleError, setEligibleError] = useState('');
  const [applyExam, setApplyExam] = useState<StudentExamListItem | null>(null);
  const [feeTab, setFeeTab] = useState<'examinations' | 'revaluations'>('examinations');
  const [revaluationDetails, setRevaluationDetails] = useState<RevaluationStudentDetail[]>([]);
  const [revaluationSelection, setRevaluationSelection] = useState<Record<number, number[]>>({});
  const [applyingRevaluation, setApplyingRevaluation] = useState<number | null>(null);
  const [revaluationPopup, setRevaluationPopup] = useState<RevaluationStudentDetail | null>(null);

  // Fee Head Application State
  const [feeHeadsList, setFeeHeadsList] = useState<FeeHead[]>([]);
  const [optionalFeeHeads, setOptionalFeeHeads] = useState<OptionalResolvedFeeHead[]>([]);
  const [selectedOptionalHeadIds, setSelectedOptionalHeadIds] = useState<Set<string>>(new Set());
  const [targetFeeRecord, setTargetFeeRecord] = useState<ExamFeeRecord | null>(null);
  const [selectedHeadId, setSelectedHeadId] = useState('');
  const [customHeadAmount, setCustomHeadAmount] = useState('');
  const [resolvedHeadInfo, setResolvedHeadInfo] = useState<FeeHeadResolution | null>(null);
  const [applyingHead, setApplyingHead] = useState(false);
  const [headError, setHeadError] = useState('');

  const loadFeeHeads = async () => {
    try {
      const heads = await api.getFeeHeads({ isActive: true });
      setFeeHeadsList(heads);
    } catch {
      setFeeHeadsList([]);
    }
  };

  const openApplyHeadModal = (record: ExamFeeRecord) => {
    setTargetFeeRecord(record);
    setSelectedHeadId('');
    setCustomHeadAmount('');
    setResolvedHeadInfo(null);
    setHeadError('');
    void loadFeeHeads();
  };

  const handleSelectHead = async (headId: string) => {
    setSelectedHeadId(headId);
    setResolvedHeadInfo(null);
    if (!headId) {
      setCustomHeadAmount('');
      return;
    }
    const head = feeHeadsList.find((h) => String(h.id) === headId);
    if (!head) return;

    const regCode = sdms?.batch || targetFeeRecord?.exam?.batch || undefined;

    try {
      const res = await api.resolveFeeHead(headId, regCode);
      setCustomHeadAmount(String(res.amount));
      setResolvedHeadInfo(res);
    } catch {
      setCustomHeadAmount(String(head.defaultAmount || 0));
    }
  };

  const handleApplyFeeHead = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetFeeRecord || !selectedHeadId) {
      setHeadError('Please select a fee head.');
      return;
    }
    const amountVal = parseFloat(customHeadAmount);
    if (isNaN(amountVal) || amountVal < 0) {
      setHeadError('Please enter a valid amount.');
      return;
    }

    setApplyingHead(true);
    setHeadError('');
    try {
      const regCode = sdms?.batch || targetFeeRecord?.exam?.batch || undefined;
      await api.applyFeeHeadToRecord({
        feeRecordId: targetFeeRecord.id,
        headId: selectedHeadId,
        regulationCode: regCode,
        customAmount: amountVal,
      });
      setTargetFeeRecord(null);
      void load();
    } catch (err) {
      setHeadError(err instanceof ApiError ? err.message : 'Failed to apply fee head.');
    } finally {
      setApplyingHead(false);
    }
  };

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

  const loadRevaluations = async (identifier: string) => {
    try {
      const notifications = await api.getRevaluationNotifications();
      const published = notifications.filter((notification) => notification.status === 'published');
      const details = (await Promise.all(published.map(async (notification) => {
        try {
          return await api.getRevaluationStudent(notification.id, identifier);
        } catch {
          return null;
        }
      }))).filter((detail): detail is RevaluationStudentDetail => detail !== null);
      setRevaluationDetails(details);
    } catch {
      setRevaluationDetails([]);
    }
  };

  async function applyRevaluation(detail: RevaluationStudentDetail) {
    const selected = revaluationSelection[detail.notification.id] ?? [];
    if (!selected.length) return;
    setApplyingRevaluation(detail.notification.id);
    setError('');
    try {
      await api.applyRevaluation(detail.notification.id, {
        studentIdentifier: rollNumber,
        selectedSubjectIds: selected,
      });
      await load();
      await loadRevaluations(rollNumber);
      setRevaluationPopup(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to apply revaluation.');
    } finally {
      setApplyingRevaluation(null);
    }
  }

  const popupSelection = revaluationPopup
    ? revaluationSelection[revaluationPopup.notification.id] ?? []
    : [];
  const popupFee = revaluationPopup
    ? revaluationPopup.notification.feesByCount[popupSelection.length - 1]
    : null;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [lookup, methods] = await Promise.all([
        api.lookupFeeCollection(rollNumber),
        api.getPaymentMethodsStatus().catch(() => ({
          razorpay: { enabled: false, configured: false, ready: false },
          selfOnline: {
            enabled: false,
            configured: false,
            ready: false,
            upiId: null,
            merchantName: '',
          },
          canara: {
            enabled: false,
            mockMode: false,
            configured: false,
            ready: false,
            oauthReady: false,
            upiId: null,
            qrCallbackUrl: '',
            missing: [] as string[],
          },
        })),
      ]);
      setRazorpayReady(methods.razorpay.ready);
      setSelfOnlineReady(methods.selfOnline.ready);
      setCanaraReady(methods.canara.ready);
      setCanaraMockMode(Boolean(methods.canara.mockMode));
      setCanaraMissing(
        Array.isArray(methods.canara.missing) ? methods.canara.missing : [],
      );
      setRecords(lookup.records);
      setStudentName(lookup.studentName ?? '');
      const pending = lookup.records.filter((r) => r.status === 'pending');
      const feeRecordIdRaw = searchParams.get('feeRecordId');
      const feeRecordId = feeRecordIdRaw ? Number(feeRecordIdRaw) : null;
      const preselected =
        feeRecordId &&
        pending.some((record) => record.id === feeRecordId)
          ? feeRecordId
          : pending[0]?.id ?? null;
      setSelectedIds(
        preselected != null ? new Set([preselected]) : new Set(),
      );

      try {
        const pay = await api.getPayments(undefined, lookup.rollNumber);
        setPayments(pay);
      } catch {
        setPayments([]);
      }

      let fetchedSdms: SdmsStudent | null = null;
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
        fetchedSdms = exact;
        setSdms(exact);
        if (exact?.studentName) setStudentName(exact.studentName);
        if (exact) {
          await loadEligibleExams(exact.id);
          await loadRevaluations(rollNumber);
        } else {
          setEligibleExams([]);
          setRevaluationDetails([]);
        }
      } catch {
        setSdms(null);
        setEligibleExams([]);
        setRevaluationDetails([]);
      }

      try {
        const heads = await api.getFeeHeads({ isActive: true });
        setFeeHeadsList(heads);
        const regCode = fetchedSdms?.batch || lookup.records[0]?.exam?.batch || rollNumber;
        const resolvedList: OptionalResolvedFeeHead[] = await Promise.all(
          heads.map(async (head) => {
            try {
              const res = await api.resolveFeeHead(head.id, regCode);
              return { head, resolved: res };
            } catch {
              return {
                head,
                resolved: {
                  feeHeadId: head.id,
                  code: head.code,
                  name: head.name,
                  type: head.type,
                  appliedRegulation: null,
                  amount: head.defaultAmount || 0,
                },
              };
            }
          }),
        );
        setOptionalFeeHeads(resolvedList);
      } catch {
        setFeeHeadsList([]);
        setOptionalFeeHeads([]);
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

  const selectedOptionalTotal = useMemo(() => {
    let sum = 0;
    for (const item of optionalFeeHeads) {
      if (selectedOptionalHeadIds.has(String(item.head.id))) {
        sum += Number(item.resolved.amount || 0);
      }
    }
    return sum;
  }, [optionalFeeHeads, selectedOptionalHeadIds]);

  const selectedPendingTotal = useMemo(
    () => selectedPending.reduce((s, r) => s + Number(r.totalAmount), 0),
    [selectedPending],
  );

  const collectTotal = selectedPendingTotal + selectedOptionalTotal;

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
    if (selectedPending.length === 0 && selectedOptionalHeadIds.size === 0) {
      setPayError('Select at least one pending fee or optional fee head to collect.');
      return;
    }

    setSaving(true);
    setPayError('');

    let pendingToPay = [...selectedPending];

    // Apply checked optional fee heads first
    if (selectedOptionalHeadIds.size > 0) {
      const regCode = sdms?.batch || selectedPending[0]?.exam?.batch || undefined;
      const targetFeeRecordId = selectedPending[0]?.id || null;

      let appliedRecord: ExamFeeRecord | null = null;
      for (const headIdStr of Array.from(selectedOptionalHeadIds)) {
        const item = optionalFeeHeads.find((o) => String(o.head.id) === headIdStr);
        if (item) {
          try {
            appliedRecord = await api.applyFeeHeadToRecord({
              feeRecordId: targetFeeRecordId,
              headId: item.head.id,
              regulationCode: regCode,
              customAmount: item.resolved.amount,
              studentRollNumber: rollNumber,
              studentName: displayName,
            });
          } catch (err) {
            console.warn('Failed to apply optional fee head:', err);
          }
        }
      }
      setSelectedOptionalHeadIds(new Set());

      if (pendingToPay.length === 0 && appliedRecord) {
        pendingToPay = [appliedRecord];
      } else if (targetFeeRecordId && appliedRecord) {
        pendingToPay = pendingToPay.map((r) => (r.id === appliedRecord!.id ? appliedRecord! : r));
      }
    }

    if (pendingToPay.length === 0) {
      setSaving(false);
      setPayError('Failed to prepare fee record for payment.');
      return;
    }

    if (paymentMethod === 'razorpay') {
      if (!razorpayReady) {
        setSaving(false);
        setPayError(
          'Razorpay is not configured. Enable it under Settings → Razorpay.',
        );
        return;
      }
      if (pendingToPay.length !== 1) {
        setSaving(false);
        setPayError('Select exactly one fee row or fee head combination for online Razorpay payment.');
        return;
      }
      setSaving(false);
      setPayError('');
      setSelfOnlineRecord(null);
      setCanaraRecord(null);
      setRazorpayRecord(pendingToPay[0]);
      return;
    }

    if (paymentMethod === 'self_online') {
      if (!selfOnlineReady) {
        setSaving(false);
        setPayError(
          'Self Online is not configured. Enable Merchant UPI ID under Settings → Self Online UPI.',
        );
        return;
      }
      if (pendingToPay.length !== 1) {
        setSaving(false);
        setPayError('Select exactly one fee row or fee head combination for Self Online UPI payment.');
        return;
      }
      setSaving(false);
      setPayError('');
      setRazorpayRecord(null);
      setCanaraRecord(null);
      setSelfOnlineRecord(pendingToPay[0]);
      return;
    }

    if (paymentMethod === 'canara_dynamic_qr') {
      if (!canaraReady) {
        setSaving(false);
        setPayError(
          'Canara Dynamic QR is not ready. Configure it under Settings → Canara Bank Dynamic QR.',
        );
        return;
      }
      if (pendingToPay.length !== 1) {
        setSaving(false);
        setPayError('Select exactly one fee row or fee head combination for Canara Dynamic QR payment.');
        return;
      }
      setSaving(false);
      setPayError('');
      setRazorpayRecord(null);
      setSelfOnlineRecord(null);
      setCanaraRecord(pendingToPay[0]);
      return;
    }

    if (!collectedBy.trim()) {
      setSaving(false);
      setPayError('Collector name is required.');
      return;
    }

    try {
      let lastPaymentId: number | null = null;
      for (const record of pendingToPay) {
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
        afterPaymentSuccess(lastPaymentId);
      } else {
        await load();
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSaving(false);
    }
  }

  const returnToExamId = (() => {
    const raw = searchParams.get('examId');
    const parsed = Number(raw ?? '');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();

  const fromDuplicateHallTickets =
    searchParams.get('from') === 'duplicate-hall-tickets';

  function afterPaymentSuccess(paymentId: number) {
    if (fromDuplicateHallTickets) {
      router.push('/dashboard/duplicate-hall-tickets?tab=approve');
      return;
    }
    router.push(`/dashboard/fees/receipt/${paymentId}`);
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
          afterPaymentSuccess(paymentId);
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

      <CanaraDynamicQrPanel
        open={canaraRecord != null}
        record={canaraRecord}
        variant="overlay"
        onClose={() => {
          setCanaraRecord(null);
          void load();
        }}
        onPaid={(paymentId) => {
          setCanaraRecord(null);
          afterPaymentSuccess(paymentId);
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
          {fromDuplicateHallTickets ? (
            <Button
              type="button"
              variant="ghost"
              className="mb-2 !px-2.5 !py-1 text-xs"
              onClick={() =>
                router.push('/dashboard/duplicate-hall-tickets')
              }
            >
              ← Back to duplicate hall tickets
            </Button>
          ) : returnToExamId ? (
            <Button
              type="button"
              variant="ghost"
              className="mb-2 !px-2.5 !py-1 text-xs"
              onClick={() => router.push(`/dashboard/exams/${returnToExamId}?tab=hall-tickets`)}
            >
              ← Back to hall tickets
            </Button>
          ) : null}
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

          {/* Examination and revaluation application tabs */}
          {sdms && (
            <div className="rounded-2xl border border-[var(--border)] bg-white shadow-sm">
              <div className="border-b border-[var(--border)] px-5 pt-4">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFeeTab('examinations')} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${feeTab === 'examinations' ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-600'}`}>Examinations</button>
                  <button type="button" onClick={() => setFeeTab('revaluations')} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${feeTab === 'revaluations' ? 'bg-[var(--primary)] text-white' : 'bg-slate-100 text-slate-600'}`}>Revaluations</button>
                </div>
              </div>
              {feeTab === 'examinations' ? <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div><h3 className="font-semibold text-slate-900">Eligible examinations</h3><p className="text-xs text-[var(--muted)]">Published exams in this student&apos;s academic scope.</p></div>
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
              </> : <div className="p-5">
                <h3 className="font-semibold text-slate-900">Eligible revaluations</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">Published revaluation notifications matching this student&apos;s programme, batch, year, and semester.</p>
                {revaluationDetails.length === 0 ? <p className="py-5 text-sm text-[var(--muted)]">No published revaluations match this student.</p> : <div className="mt-4 space-y-3">{revaluationDetails.map((detail) => { const selected = revaluationSelection[detail.notification.id] ?? []; const existing = records.find((record) => record.feeType === 'REVALUATION' && record.revaluationNotificationId === detail.notification.id); return <div key={detail.notification.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4"><div><p className="font-semibold text-slate-900">{detail.notification.title}</p><p className="text-xs text-[var(--muted)]">{detail.notification.regulationCode} · {detail.notification.startDate} → {detail.notification.endDate}</p></div><div className="flex items-center gap-2">{existing ? <Badge variant={existing.status === 'paid' ? 'success' : 'warning'}>{existing.status}</Badge> : <Button size="sm" onClick={() => setRevaluationPopup(detail)}>Apply</Button>}</div></div>; })}</div>}
              </div>}
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
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-sm text-[var(--muted)]"
                      >
                        No fees found for this selection.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      const balance =
                        r.status === 'pending' ? Number(r.totalAmount) : 0;
                      const duplicate = isDuplicateHallTicketFeeRecord(r.feeBreakdown);
                      const feeName = feeRecordDisplayName(r);
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
                              {duplicate ? 'Duplicate hall ticket fee' : r.exam?.name ?? `Exam #${r.examId}`}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              {duplicate
                                ? `Duplicate hall ticket fee · Y${r.exam?.yearOfStudy ?? '—'} / S${r.exam?.semester ?? '—'}`
                                : `Y${r.exam?.yearOfStudy ?? '—'} / S${r.exam?.semester ?? '—'} · ${r.feeBreakdown?.map((b) => `${b.feeHeadName || b.subjectName || b.subjectCode} (${money(b.amount ?? b.fee ?? 0)})`).join(' + ') || 'Exam fee'}`}
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
                          <td className="px-4 py-3 text-right">
                            {r.status === 'pending' ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => openApplyHeadModal(r)}
                              >
                                + Fee Head
                              </Button>
                            ) : (
                              <span className="text-xs text-[var(--muted)]">—</span>
                            )}
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
                          {formatPaymentIST(p.paidAt)}
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
              {selectedPending.length === 0 && selectedOptionalHeadIds.size === 0 ? (
                <p className="text-[var(--muted)]">
                  Select fee rows on the left or optional fee heads below
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
                  {Array.from(selectedOptionalHeadIds).map((headIdStr) => {
                    const item = optionalFeeHeads.find((o) => String(o.head.id) === headIdStr);
                    if (!item) return null;
                    return (
                      <li
                        key={headIdStr}
                        className="flex items-start justify-between gap-2 border-t border-slate-200/60 pt-1.5"
                      >
                        <span className="text-xs font-medium text-slate-800">
                          + {item.head.name}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                          {money(item.resolved.amount)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Optional Fee Heads (Select to Apply & Pay) */}
            {optionalFeeHeads.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Optional Fee Heads (Apply & Pay)
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Select to include in payment
                  </span>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {optionalFeeHeads.map(({ head, resolved }) => {
                    const isChecked = selectedOptionalHeadIds.has(String(head.id));
                    return (
                      <label
                        key={head.id}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border transition cursor-pointer text-xs ${
                          isChecked
                            ? 'border-slate-800 bg-white ring-1 ring-slate-400/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedOptionalHeadIds((prev) => {
                              const next = new Set(prev);
                              const idStr = String(head.id);
                              if (next.has(idStr)) next.delete(idStr);
                              else next.add(idStr);
                              return next;
                            });
                          }}
                          className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-900 truncate">
                              {head.name}
                            </span>
                            <span className="font-bold tabular-nums text-slate-900 shrink-0">
                              {money(resolved.amount)}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 line-clamp-1">
                            {head.type === 'GLOBAL'
                              ? `Global Flat Rate`
                              : `Reg ${resolved.appliedRegulation || 'Default'} Price`}
                            {resolved.isTimePeriodExpired ? ' · Post-Deadline Rate' : ''}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

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
                    ['canara_dynamic_qr', 'Canara QR'],
                    ['self_online', 'Self Online'],
                  ] as const
                ).map(([value, label]) => {
                  const disabled =
                    (value === 'razorpay' && !razorpayReady) ||
                    (value === 'self_online' && !selfOnlineReady) ||
                    (value === 'canara_dynamic_qr' && !canaraReady);
                  const title =
                    value === 'razorpay' && !razorpayReady
                      ? 'Configure Razorpay in Settings'
                      : value === 'self_online' && !selfOnlineReady
                        ? 'Configure Self Online UPI in Settings'
                        : value === 'canara_dynamic_qr' && !canaraReady
                          ? 'Configure Canara Dynamic QR in Settings'
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
              {!canaraReady && (
                <p className="mt-2 text-xs text-amber-700">
                  Canara Dynamic QR offline
                  {canaraMissing.length
                    ? ` — missing: ${canaraMissing.join(', ')}`
                    : ' — complete credentials + OAuth in'}{' '}
                  <Link
                    href="/dashboard/settings"
                    className="font-semibold underline"
                  >
                    Settings
                  </Link>
                  .
                </p>
              )}
              {canaraReady && canaraMockMode && (
                <p className="mt-2 text-xs text-amber-700">
                  Canara ready in <strong>test mode</strong> — bank payments will
                  not clear fee dues.
                </p>
              )}
              {canaraReady && !canaraMockMode && (
                <p className="mt-2 text-xs text-slate-600">
                  Canara ready (live settlement).
                </p>
              )}
            </div>

            {paymentMethod !== 'razorpay' &&
              paymentMethod !== 'self_online' &&
              paymentMethod !== 'canara_dynamic_qr' && (
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
              paymentMethod !== 'self_online' && (
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
              disabled={saving || (selectedPending.length === 0 && selectedOptionalHeadIds.size === 0)}
            >
              {saving
                ? 'Processing…'
                : paymentMethod === 'razorpay'
                  ? 'Pay with Razorpay'
                  : paymentMethod === 'self_online'
                    ? 'Open Self Online QR'
                    : 'Confirm payment'}
            </Button>
          </form>
        </aside>
      </div>

      {revaluationPopup ? (
        <Modal
          open
          onClose={() => setRevaluationPopup(null)}
          title="Apply revaluation"
          description={`${revaluationPopup.notification.title} · ${revaluationPopup.student.name}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Select the subjects to send for revaluation.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {revaluationPopup.subjects.map((subject) => (
                <label key={subject.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={popupSelection.includes(subject.id)}
                    onChange={() => setRevaluationSelection((current) => ({
                      ...current,
                      [revaluationPopup.notification.id]: popupSelection.includes(subject.id)
                        ? popupSelection.filter((id) => id !== subject.id)
                        : [...popupSelection, subject.id],
                    }))}
                  />
                  <span>{subject.code} - {subject.name}<span className="ml-2 text-xs text-slate-500">Sem {subject.semester ?? '—'}</span></span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm font-semibold text-slate-800">Total amount: {popupFee == null ? 'Select subjects' : money(popupFee)}</span>
              <Button
                onClick={() => void applyRevaluation(revaluationPopup)}
                loading={applyingRevaluation === revaluationPopup.notification.id}
                disabled={!popupSelection.length}
              >
                Apply revaluation
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Apply Fee Head Modal Dialog */}
      {targetFeeRecord ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="font-bold text-slate-900">Apply Additional Fee Head</h3>
                <p className="text-xs text-[var(--muted)]">
                  Add custom/regulation fee head to record #{targetFeeRecord.id} ({targetFeeRecord.studentName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTargetFeeRecord(null)}
                className="rounded-full px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                Close
              </button>
            </div>

            {headError ? (
              <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 font-medium">
                {headError}
              </div>
            ) : null}

            <form onSubmit={handleApplyFeeHead} className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">Select Fee Head</span>
                <select
                  required
                  value={selectedHeadId}
                  onChange={(e) => handleSelectHead(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--primary)]"
                >
                  <option value="">-- Choose active fee head --</option>
                  {feeHeadsList.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.code}) — {h.type === 'GLOBAL' ? `Global ₹${h.defaultAmount}` : 'Regulation Specific'}
                    </option>
                  ))}
                </select>
              </label>

              {selectedHeadId ? (
                <>
                  {resolvedHeadInfo ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-slate-800">
                        <span>
                          {resolvedHeadInfo.type === 'GLOBAL'
                            ? 'Global Flat Price'
                            : `Regulation-Wise Price (${resolvedHeadInfo.appliedRegulation || 'Default'})`}
                        </span>
                        <span className="tabular-nums text-slate-900 font-extrabold text-sm">
                          {money(resolvedHeadInfo.amount)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        {resolvedHeadInfo.type === 'GLOBAL'
                          ? 'Global standard rate applies flat across all regulations.'
                          : resolvedHeadInfo.isCustomForRegulation
                          ? `Custom amount configured specifically for regulation / batch ${resolvedHeadInfo.appliedRegulation}.`
                          : `No custom amount for regulation ${resolvedHeadInfo.appliedRegulation}; using default fallback amount.`}
                      </p>
                      {resolvedHeadInfo.isTimePeriodExpired ? (
                        <p className="text-[10px] text-amber-700 font-semibold">
                          Standard deadline passed; post-deadline rate applied.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-700">
                      Applicable Fee Amount (₹)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={customHeadAmount}
                      onChange={(e) => setCustomHeadAmount(e.target.value)}
                      className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-[var(--primary)]"
                    />
                    <p className="text-[11px] text-[var(--muted)]">
                      Amount automatically computed for student regulation ({sdms?.batch || 'Default'}). You can adjust if authorized.
                    </p>
                  </label>
                </>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTargetFeeRecord(null)}
                  disabled={applyingHead}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={applyingHead || !selectedHeadId}
                >
                  {applyingHead ? 'Applying…' : 'Apply Fee Head'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
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
