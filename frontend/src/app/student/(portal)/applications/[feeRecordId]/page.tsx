'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { ExamFeeRecord, PaymentMethod } from '@/types/fee';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { money } from '@/components/fees/money';
import { RazorpayInlinePay } from '@/components/fees/RazorpayInlinePay';
import { SelfOnlinePayPanel } from '@/components/fees/SelfOnlinePayPanel';
import { calcUpiConvenienceFee } from '@/lib/upiConvenienceFee';

type Step = 1 | 2;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function StudentApplyPage({
  params,
}: {
  params: Promise<{ feeRecordId: string }>;
}) {
  const { feeRecordId } = use(params);
  const id = parseInt(feeRecordId, 10);
  const router = useRouter();
  const user = getStoredUser();

  const [record, setRecord] = useState<ExamFeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>(1);
  const [consent, setConsent] = useState(false);
  const [declaration, setDeclaration] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | 'self_online'>('upi');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [selfOnlineReady, setSelfOnlineReady] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selfPayOpen, setSelfPayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fees, status, selfStatus] = await Promise.all([
        api.getStudentFees(),
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
      ]);
      const found = fees.find((f) => f.id === id) ?? null;
      if (!found) {
        setError('Application / fee record not found for your account.');
        setRecord(null);
      } else {
        setRecord(found);
        if (found.status === 'paid') {
          const paid = found.payments?.find((p) => p.status === 'success');
          if (paid) {
            router.replace(`/student/receipt/${paid.id}`);
            return;
          }
        }
        const awaiting = found.payments?.find(
          (p) =>
            p.paymentMode === 'self_online' &&
            p.status === 'awaiting_verification',
        );
        if (awaiting) {
          setStep(2);
          setMethod('self_online');
          setSelfPayOpen(true);
        }
      }
      setRazorpayReady(status.ready);
      setSelfOnlineReady(selfStatus.ready);
      if (!status.ready && selfStatus.ready) {
        setMethod('self_online');
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load application details.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const split = useMemo(
    () =>
      record && method !== 'self_online'
        ? calcUpiConvenienceFee(record.totalAmount, method)
        : record
          ? {
              base: Number(record.totalAmount),
              convenienceFee: 0,
              total: Number(record.totalAmount),
              applies: false,
              rate: 0,
            }
          : null,
    [record, method],
  );

  function goToPayment() {
    if (!consent || !declaration) {
      setError(
        'Please accept the declaration and consent before continuing to payment.',
      );
      return;
    }
    if (!razorpayReady && !selfOnlineReady) {
      setError(
        'Online payments are not available yet. Contact the examination cell.',
      );
      return;
    }
    setError('');
    setStep(2);
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading application…</p>
    );
  }

  if (!record) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--danger)]">
          {error || 'Application not found'}
        </p>
        <Link href="/student/applications" className="text-sm text-[var(--primary)]">
          ← Back to applications
        </Link>
      </div>
    );
  }

  const exam = record.exam;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/student/applications"
          className="text-xs font-medium text-[var(--primary)] hover:underline"
        >
          ← Applications
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Application & payment
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Review details, confirm consent, then pay on this page
        </p>
      </div>

      {/* Steps */}
      <ol className="grid grid-cols-2 gap-2">
        <li
          className={`rounded-xl border px-4 py-3 text-sm ${
            step === 1
              ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
              : 'border-[var(--border)] bg-white text-slate-600'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wide">
            Step 1
          </span>
          <p className="font-semibold">Application & consent</p>
        </li>
        <li
          className={`rounded-xl border px-4 py-3 text-sm ${
            step === 2
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hover)]'
              : 'border-[var(--border)] bg-white text-slate-600'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wide">
            Step 2
          </span>
          <p className="font-semibold">Fee payment</p>
        </li>
      </ol>

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          {/* Candidate */}
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Candidate details
              </h2>
              <Badge variant="warning">Pending payment</Badge>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <Detail label="Name" value={record.studentName} />
              <Detail
                label="PIN / Roll"
                value={record.studentRollNumber}
              />
              <Detail label="College" value={exam?.college ?? user?.college} />
              <Detail
                label="Course / Branch"
                value={
                  exam
                    ? `${exam.course} — ${exam.branch}`
                    : [user?.course, user?.branch].filter(Boolean).join(' — ') ||
                      '—'
                }
              />
              <Detail
                label="Batch"
                value={exam?.batch ?? user?.batch ?? '—'}
              />
              <Detail
                label="Year / Semester"
                value={
                  exam
                    ? `Y${exam.yearOfStudy} / Sem ${exam.semester}`
                    : user?.currentYear != null
                      ? `Y${user.currentYear} / Sem ${user.currentSemester}`
                      : '—'
                }
              />
            </dl>
          </section>

          {/* Exam */}
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Examination details
            </h2>
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <Detail label="Examination" value={exam?.name ?? `Exam #${record.examId}`} />
              <Detail
                label="Type"
                value={(exam?.type ?? '—').replace(/_/g, ' ')}
              />
              <Detail
                label="Application period"
                value={`${formatDate(exam?.applicationStartDate)} → ${formatDate(exam?.applicationEndDate)}`}
              />
              <Detail
                label="Examination dates"
                value={`${formatDate(exam?.examinationStartDate)} → ${formatDate(exam?.examinationEndDate)}`}
              />
              <Detail
                label="Due date"
                value={formatDate(record.dueDate)}
              />
            </dl>

            {exam?.instructions && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Instructions
                </p>
                <p className="whitespace-pre-wrap">{exam.instructions}</p>
              </div>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="py-2 pr-3">S.No</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 text-right">Fee (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {(record.feeBreakdown?.length
                    ? record.feeBreakdown
                    : []
                  ).map((b, i) => (
                    <tr
                      key={`${b.subjectId}-${i}`}
                      className="border-b border-[var(--border)]"
                    >
                      <td className="py-2.5 pr-3 text-[var(--muted)]">
                        {i + 1}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        {b.subjectCode}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {money(b.fee)}
                      </td>
                    </tr>
                  ))}
                  {(!record.feeBreakdown ||
                    record.feeBreakdown.length === 0) && (
                    <tr>
                      <td
                        colSpan={3}
                        className="py-4 text-center text-[var(--muted)]"
                      >
                        Subject list will appear after mapping is complete.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--muted)]">Base fee</p>
                <p className="font-semibold tabular-nums">
                  {money(record.baseFee)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Late fee</p>
                <p className="font-semibold tabular-nums">
                  {money(record.lateFee)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Exam fee total</p>
                <p className="font-bold tabular-nums text-slate-900">
                  {money(record.totalAmount)}
                </p>
              </div>
            </div>
          </section>

          {/* Consent */}
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Declaration & consent
            </h2>
            <div className="space-y-3 text-sm text-slate-700">
              <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={declaration}
                  onChange={(e) => setDeclaration(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  I hereby declare that the particulars furnished above are true
                  and correct to the best of my knowledge. I understand that any
                  incorrect information may lead to cancellation of my
                  examination registration.
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  I consent to apply for the above examination and agree to pay
                  the prescribed examination fee
                  {method === 'upi'
                    ? ' (including applicable UPI convenience charges)'
                    : ''}
                  . I understand that the application is confirmed only after
                  successful payment.
                </span>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push('/student/applications')}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!consent || !declaration}
                onClick={goToPayment}
              >
                Confirm application → Pay
              </Button>
            </div>
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Step 2 — Fee payment
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Application consent recorded. Complete payment to confirm your
                  registration for{' '}
                  <span className="font-medium text-slate-800">
                    {exam?.name ?? `Exam #${record.examId}`}
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPayOpen(false);
                  setStep(1);
                }}
                className="text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                ← Edit application
              </button>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-600">Exam fee</span>
                <span className="font-semibold tabular-nums">
                  {money(record.totalAmount)}
                </span>
              </div>
              {split?.applies && (
                <div className="mt-2 flex justify-between gap-3 text-amber-800">
                  <span>UPI convenience (2.2%)</span>
                  <span className="font-semibold tabular-nums">
                    {money(split.convenienceFee)}
                  </span>
                </div>
              )}
              <div className="mt-3 flex justify-between gap-3 border-t border-[var(--border)] pt-3 text-base">
                <span className="font-semibold text-slate-900">
                  Amount to pay
                </span>
                <span className="font-bold tabular-nums text-slate-900">
                  {money(split?.total ?? record.totalAmount)}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Payment method
              </label>
              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value as PaymentMethod | 'self_online');
                  setPayOpen(false);
                  setSelfPayOpen(false);
                }}
                className="w-full max-w-xs rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                {razorpayReady ? (
                  <>
                    <option value="upi">UPI (Razorpay)</option>
                    <option value="debit_card">Debit card</option>
                    <option value="credit_card">Credit card</option>
                    <option value="net_banking">Net banking</option>
                  </>
                ) : null}
                {selfOnlineReady ? (
                  <option value="self_online">Self Online (College UPI)</option>
                ) : null}
              </select>
              {method === 'upi' && razorpayReady && (
                <p className="mt-2 text-xs text-amber-800">
                  UPI payments include a 2.2% convenience / bank charge.
                </p>
              )}
              {method === 'self_online' && (
                <p className="mt-2 text-xs text-slate-600">
                  Pay exact fee via college UPI QR. Temporary acknowledgement
                  first; official receipt after Accounts verifies the statement.
                </p>
              )}
            </div>

            {!razorpayReady && !selfOnlineReady && (
              <div className="mt-4 rounded-[var(--radius)] bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                Online payment is temporarily unavailable. Please pay at the fee
                counter.
              </div>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPayOpen(false);
                  setSelfPayOpen(false);
                  setStep(1);
                }}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={
                  (method === 'self_online'
                    ? !selfOnlineReady || selfPayOpen
                    : !razorpayReady || payOpen) ||
                  (!razorpayReady && !selfOnlineReady)
                }
                onClick={() => {
                  setError('');
                  if (method === 'self_online') {
                    setSelfPayOpen(true);
                    setPayOpen(false);
                  } else {
                    setPayOpen(true);
                    setSelfPayOpen(false);
                  }
                }}
              >
                {method === 'self_online'
                  ? `Pay ${money(record.totalAmount)} via UPI`
                  : `Pay ${money(split?.total ?? record.totalAmount)}`}
              </Button>
            </div>

            <RazorpayInlinePay
              open={payOpen && method !== 'self_online'}
              record={record}
              paymentMethod={method === 'self_online' ? 'upi' : method}
              variant="panel"
              prefillName={user?.fullName}
              prefillContact={user?.mobile ?? undefined}
              prefillEmail={user?.email ?? undefined}
              onClose={() => setPayOpen(false)}
              onSuccess={(paymentId) => {
                setPayOpen(false);
                router.push(`/student/receipt/${paymentId}`);
              }}
            />

            <SelfOnlinePayPanel
              open={selfPayOpen && method === 'self_online'}
              record={record}
              onClose={() => {
              setSelfPayOpen(false);
              void load();
            }}
              onClaimed={async () => {
              // Don't call load() right now to avoid re-opening the dialog!
              // Wait for user to close the dialog, then load (if needed)
            }}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}
