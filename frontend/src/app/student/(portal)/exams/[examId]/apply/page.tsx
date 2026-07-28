'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { ExamFeeRecord, PaymentMethod } from '@/types/fee';
import { StudentExamDetail, ExamType } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { money } from '@/components/fees/money';
import { RazorpayInlinePay } from '@/components/fees/RazorpayInlinePay';
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

export default function StudentExamApplyPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId: examIdParam } = use(params);
  const examId = parseInt(examIdParam, 10);
  const router = useRouter();
  const user = getStoredUser();

  const [detail, setDetail] = useState<StudentExamDetail | null>(null);
  const [feeRecord, setFeeRecord] = useState<ExamFeeRecord | null>(null);
  const [enrollType, setEnrollType] = useState<ExamType | ''>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>(1);
  const [consent, setConsent] = useState(false);
  const [declaration, setDeclaration] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, status] = await Promise.all([
        api.getStudentExam(examId),
        api.getRazorpayStatus().catch(() => ({
          enabled: false,
          configured: false,
          ready: false,
        })),
      ]);
      setDetail(res);
      setRazorpayReady(status.ready);
      const open =
        res.openTypes ??
        (res.exam.allowedTypes?.length
          ? res.exam.allowedTypes
          : [res.exam.type]);
      const initialType = open.length === 1 ? open[0] : '';
      setEnrollType(initialType);
      setSelected(
        new Set(
          res.exam.subjects
            .filter(
              (s) => initialType !== 'supply' || s.supplyStatus?.eligible,
            )
            .map((s) => s.subjectId),
        ),
      );

      // Pending payment for any type → unified application lifecycle page
      const pendingApp = res.applications?.find((a) => a.feeStatus === 'pending');
      if (pendingApp?.feeRecordId) {
        router.replace(`/student/applications/${pendingApp.feeRecordId}`);
        return;
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load examination details.',
      );
    } finally {
      setLoading(false);
    }
  }, [examId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const subjects = useMemo(() => detail?.exam.subjects ?? [], [detail]);
  const selectableSubjects = useMemo(
    () =>
      subjects.filter(
        (s) => enrollType !== 'supply' || s.supplyStatus?.eligible,
      ),
    [enrollType, subjects],
  );

  const liveTotal = useMemo(() => {
    if (!detail) return 0;
    const ids = [...selected];
    if (ids.length === 0) return 0;
    const sum = subjects
      .filter((s) => ids.includes(s.subjectId))
      .reduce((acc, s) => acc + Number(s.fee), 0);
    const allSelected =
      ids.length === subjects.length &&
      subjects.every((s) => ids.includes(s.subjectId));
    const pkg = detail.exam.packageFee != null ? Number(detail.exam.packageFee) : null;
    // Package fee is the flat bundle price when all papers are selected.
    if (allSelected && pkg != null && !Number.isNaN(pkg)) {
      return pkg;
    }
    return sum;
  }, [detail, selected, subjects]);

  const split = useMemo(
    () =>
      feeRecord
        ? calcUpiConvenienceFee(feeRecord.totalAmount, method)
        : calcUpiConvenienceFee(liveTotal, method),
    [feeRecord, liveTotal, method],
  );

  function toggleSubject(id: number) {
    if (!selectableSubjects.some((s) => s.subjectId === id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    if (on) setSelected(new Set(selectableSubjects.map((s) => s.subjectId)));
    else setSelected(new Set());
  }

  function chooseEnrollmentType(type: ExamType) {
    setEnrollType(type);
    setSelected(
      new Set(
        subjects
          .filter((s) => type !== 'supply' || s.supplyStatus?.eligible)
          .map((s) => s.subjectId),
      ),
    );
  }

  async function submitApplication() {
    const restrictionOn = detail?.dueClearance?.restrictionEnabled !== false;
    const hasOverdue = Boolean(
      detail?.dueClearance?.hasOverdue ?? detail?.dueClearance?.blocked,
    );
    if (
      detail?.canApply === false ||
      (restrictionOn && hasOverdue)
    ) {
      setError(
        detail?.dueClearance?.message ||
          'Clear all overdue fee dues before applying for the examination.',
      );
      return;
    }
    if (!enrollType) {
      setError('Select Regular or Supply (enrollment type).');
      return;
    }
    if (!consent || !declaration) {
      setError('Please accept the declaration and consent before continuing.');
      return;
    }
    if (selected.size === 0) {
      setError('Select at least one subject.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await api.createStudentExamApplication(examId, {
        examType: enrollType,
        selectedSubjectIds: [...selected],
        declarationAccepted: true,
        consentAccepted: true,
      });
      setFeeRecord(result.feeRecord);
      // Continue payment on the unified application lifecycle page
      router.push(`/student/applications/${result.feeRecord.id}`);
      return;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to submit application.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted)]">Loading examination…</p>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--danger)]">
          {error || 'Examination not found'}
        </p>
        <Link href="/student" className="text-sm text-[var(--primary)]">
          ← Back
        </Link>
      </div>
    );
  }

  const exam = detail.exam;
  const existingApp = detail.applications?.[0] ?? null;

  // Already applied → no apply form; point to the application / hall ticket.
  if (existingApp && (detail.openTypes?.length ?? 0) === 0 && !feeRecord) {
    return (
      <div className="space-y-5">
        <div>
          <Link
            href="/student/exams"
            className="text-xs font-medium text-[var(--primary)] hover:underline"
          >
            ← Examinations
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {exam.name}
          </h1>
        </div>
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-sm)]">
          <Badge variant={existingApp.feeStatus === 'paid' ? 'success' : 'warning'}>
            {existingApp.feeStatus === 'paid' ? 'Applied' : 'Payment due'}
          </Badge>
          <p className="mt-3 text-sm text-slate-700">
            You have already applied for this examination as{' '}
            <strong>{existingApp.examType.replace(/_/g, ' ')}</strong>. Another
            enrollment type requires a separate examination.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {existingApp.feeStatus === 'paid' ? (
              <Button
                type="button"
                onClick={() =>
                  router.push(`/student/hall-tickets/${existingApp.id}`)
                }
              >
                See hall ticket
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  router.push(`/student/applications/${existingApp.feeRecordId}`)
                }
              >
                Review & pay
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/student/exams')}
            >
              Back to examinations
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {feeRecord ? (
        <RazorpayInlinePay
          open={payOpen}
          record={feeRecord}
          paymentMethod={method}
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
      ) : null}

      <div>
        <Link
          href="/student/exams"
          className="text-xs font-medium text-[var(--primary)] hover:underline"
        >
          ← Examinations
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Apply — {exam.name}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Choose Regular or Supply, select subjects, consent, then pay.
        </p>
      </div>

      {detail.dueClearance?.hasOverdue || detail.dueClearance?.blocked ? (
        <section className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-base font-semibold text-amber-950">
            Outstanding fee dues
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            {detail.dueClearance.message}
          </p>
          {detail.dueClearance.restrictionEnabled === false ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              Apply restriction is currently off in Settings — you can still
              submit this application.
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-800">
              You can review examination details below. Clear all overdue dues
              before submitting an application.
            </p>
          )}
          <p className="mt-3 text-sm font-semibold text-amber-950">
            Total overdue: {money(detail.dueClearance.totalDue)}
          </p>
          {detail.dueClearance.byTerm?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Term-wise due
              </p>
              <ul className="mt-1 space-y-1 text-sm text-amber-900">
                {detail.dueClearance.byTerm.map((t) => (
                  <li key={t.termNumber}>
                    Term {t.termNumber}: {money(t.due)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {detail.dueClearance.byHead?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Head-wise due
              </p>
              <ul className="mt-1 space-y-2 text-sm text-amber-900">
                {detail.dueClearance.byHead.map((h) => (
                  <li key={h.feeHeadId}>
                    <span className="font-medium">
                      {h.feeHeadName}
                      {h.feeHeadCode ? ` (${h.feeHeadCode})` : ''}:{' '}
                      {money(h.due)}
                    </span>
                    {h.terms?.filter((t) => t.overdue && t.due > 0).length ? (
                      <ul className="ml-3 mt-1 space-y-0.5 text-xs text-amber-800">
                        {h.terms
                          .filter((t) => t.overdue && t.due > 0)
                          .map((t) => (
                            <li key={`${h.feeHeadId}-${t.termNumber}-${t.dueDate}`}>
                              Term {t.termNumber}
                              {t.dueDate ? ` · due ${t.dueDate}` : ''} ·{' '}
                              {money(t.due)}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

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
          <p className="font-semibold">Subjects & consent</p>
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
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Candidate
              </h2>
              <Badge variant="default">Enrollment</Badge>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Name" value={user?.fullName ?? '—'} />
              <Detail label="PIN" value={user?.pinNo ?? '—'} />
              <Detail label="College" value={exam.college ?? user?.college} />
              <Detail
                label="Course / Branch"
                value={`${exam.course} — ${exam.branch}`}
              />
            </dl>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Applying as
            </h2>
            <p className="mb-3 text-xs text-[var(--muted)]">
              Select one enrollment type. Only one application is accepted per
              examination.
            </p>
            {(detail.openTypes?.length ?? 0) === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                You already applied for this examination. To use another
                enrollment type, a separate examination must be published.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {(detail.openTypes ?? []).map((t) => (
                  <label
                    key={t}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                      enrollType === t
                        ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="enrollType"
                      checked={enrollType === t}
                      onChange={() => chooseEnrollmentType(t)}
                    />
                    {t.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            )}
            {(detail.applications?.length ?? 0) > 0 && (
              <p className="mt-3 text-xs text-[var(--muted)]">
                Already applied:{' '}
                {detail.applications
                  .map(
                    (a) =>
                      `${a.examType.replace(/_/g, ' ')} (${a.feeStatus ?? '—'})`,
                  )
                  .join(', ')}
              </p>
            )}
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Subjects
              </h2>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-[var(--primary)] hover:underline"
                  onClick={() => toggleAll(true)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-[var(--muted)] hover:underline"
                  onClick={() => toggleAll(false)}
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="mb-3 text-xs text-[var(--muted)]">
              {enrollType === 'supply'
                ? 'Only subjects whose latest result is failed can be selected. Passed subjects are disabled.'
                : 'All selected by default. Deselect any you are not applying for.'}
              {exam.packageFee != null &&
              selectableSubjects.length === subjects.length
                ? ` Package fee applies when all subjects are selected (₹${exam.packageFee}).`
                : ''}
            </p>
            <ul className="space-y-2">
              {subjects.map((s) => {
                const supplyDisabled =
                  enrollType === 'supply' && !s.supplyStatus?.eligible;
                return (
                <li key={s.subjectId}>
                  <label className={`flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm ${supplyDisabled ? 'cursor-not-allowed bg-slate-50 opacity-70' : ''}`}>
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(s.subjectId)}
                        disabled={supplyDisabled}
                        onChange={() => toggleSubject(s.subjectId)}
                      />
                      <span>
                        <span className="font-medium">{s.code}</span>
                        {s.name ? ` — ${s.name}` : ''}
                        {enrollType === 'supply' && (
                          <span className={`block text-xs ${s.supplyStatus?.eligible ? 'text-rose-700' : 'text-[var(--muted)]'}`}>
                            {s.supplyStatus
                              ? `${s.supplyStatus.eligible ? 'Not passed — eligible' : s.supplyStatus.passed ? 'Passed — not selectable' : 'No previous result found — not selectable'} · Grade ${s.supplyStatus.grade ?? '—'} · Grade points ${s.supplyStatus.gradePoints ?? '—'}`
                              : 'No previous result found — not selectable'}
                          </span>
                        )}
                        {(s.examDate || s.startTime) && (
                          <span className="block text-xs text-[var(--muted)]">
                            {s.examDate ? formatDate(s.examDate) : ''}
                            {s.session
                              ? ` · ${s.session === 'FN' ? 'Forenoon' : 'Afternoon'}`
                              : ''}
                            {s.startTime && s.endTime
                              ? ` · ${s.startTime}–${s.endTime}`
                              : ''}
                            {s.durationMinutes
                              ? ` (${s.durationMinutes} min)`
                              : ''}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {money(s.fee)}
                    </span>
                  </label>
                </li>
                );
              })}
            </ul>
            <p className="mt-4 text-right text-sm font-semibold text-slate-900">
              Estimated fee: {money(liveTotal)}
            </p>
          </section>

          <section className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={declaration}
                onChange={(e) => setDeclaration(e.target.checked)}
              />
              <span>
                I declare that the particulars furnished are true and that I am
                eligible to appear for this examination.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I consent to the processing of my application and selected
                subjects for examination fee calculation and payment.
              </span>
            </label>
          </section>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/student')}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitApplication()}
              disabled={
                submitting ||
                !(detail.openTypes?.length) ||
                !enrollType ||
                detail.canApply === false
              }
            >
              {submitting
                ? 'Submitting…'
                : detail.canApply === false
                  ? 'Clear dues to apply'
                  : 'Submit & continue to pay'}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && feeRecord && (
        <div className="space-y-4">
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Application fee
            </h2>
            <p className="text-sm text-slate-700">
              Amount due: <strong>{money(feeRecord.totalAmount)}</strong>
            </p>
            {feeRecord.feeBreakdown?.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
                {feeRecord.feeBreakdown.map((b) => (
                  <li key={b.subjectId}>
                    {b.subjectCode}: {money(b.fee)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Payment method
            </h2>
            <select
              className="w-full rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="upi">UPI</option>
              <option value="debit_card">Debit card</option>
              <option value="credit_card">Credit card</option>
              <option value="net_banking">Net banking</option>
            </select>
            {method === 'upi' && split && (
              <p className="mt-2 text-xs text-amber-800">
                UPI includes 2.2% convenience fee — total {money(split.total)}
              </p>
            )}
            {!razorpayReady && (
              <p className="mt-2 text-sm text-[var(--danger)]">
                Online payments are not configured. Contact the examination cell.
              </p>
            )}
          </section>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push('/student')}
            >
              Pay later
            </Button>
            <Button
              type="button"
              disabled={!razorpayReady}
              onClick={() => setPayOpen(true)}
            >
              Pay with Razorpay
            </Button>
          </div>
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
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}
