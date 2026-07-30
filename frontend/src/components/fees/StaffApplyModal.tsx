'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { StudentExamDetail, ExamType } from '@/types/exam';
import { SdmsStudent } from '@/types/sdms';
import { money } from './money';
import { can } from '@/lib/permissions';
import { getStoredUser } from '@/lib/auth';

interface StaffApplyModalProps {
  open: boolean;
  student: SdmsStudent;
  examId: number;
  examName: string;
  onClose: () => void;
  onApplied: () => void;
}

/**
 * Staff-side exam application on behalf of a student. Mirrors the student
 * apply flow exactly: enrollment type, subject selection, declaration and
 * consent — validated by the same backend service and scope checks.
 */
export function StaffApplyModal({
  open,
  student,
  examId,
  examName,
  onClose,
  onApplied,
}: StaffApplyModalProps) {
  const [detail, setDetail] = useState<StudentExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [enrollType, setEnrollType] = useState<ExamType | ''>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [declaration, setDeclaration] = useState(false);
  const [consent, setConsent] = useState(false);
  const [overrideDues, setOverrideDues] = useState(false);
  const staffUser = getStoredUser();
  const canOverrideDues = can(staffUser, 'fees:due_override');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getStudentExamForStaff(student.id, examId);
      setDetail(res);
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
      setDeclaration(false);
      setConsent(false);
    } catch (err) {
      setDetail(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load examination details.',
      );
    } finally {
      setLoading(false);
    }
  }, [student.id, examId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const subjects = useMemo(() => detail?.exam.subjects ?? [], [detail]);
  const selectableSubjects = useMemo(
    () =>
      subjects.filter(
        (s) => enrollType !== 'supply' || s.supplyStatus?.eligible,
      ),
    [enrollType, subjects],
  );

  const liveTotal = useMemo(() => {
    if (!detail || !enrollType) return 0;
    const tiers = detail.exam.supplyFeeByCount ?? null;
    const pkg =
      detail.exam.packageFee != null ? Number(detail.exam.packageFee) : null;
    if (enrollType === 'regular') {
      return pkg != null && !Number.isNaN(pkg) ? pkg : 0;
    }
    const n = selected.size;
    if (n < 1) return 0;
    if (n === subjects.length && subjects.every((s) => selected.has(s.subjectId))) {
      return pkg != null && !Number.isNaN(pkg) ? pkg : 0;
    }
    if (!Array.isArray(tiers) || tiers.length < n) return 0;
    const amount = Number(tiers[n - 1]);
    return Number.isNaN(amount) ? 0 : amount;
  }, [detail, enrollType, selected, subjects]);

  function toggleSubject(id: number) {
    if (enrollType === 'regular') return;
    if (!selectableSubjects.some((s) => s.subjectId === id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  async function submit() {
    if (!enrollType) {
      setError('Select the enrollment type (Regular / Supply).');
      return;
    }
    if (selected.size === 0) {
      setError('Select at least one subject.');
      return;
    }
    if (!declaration || !consent) {
      setError(
        'Confirm the declaration and consent on behalf of the student.',
      );
      return;
    }
    if (
      detail?.dueClearance?.restrictionEnabled !== false &&
      (detail?.dueClearance?.hasOverdue || detail?.dueClearance?.blocked) &&
      !(canOverrideDues && overrideDues)
    ) {
      setError(
        detail.dueClearance.message ||
          'Student has overdue fee dues. Clear dues or use override privilege.',
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.applyExamForStudent(student.id, examId, {
        examType: enrollType,
        selectedSubjectIds: [...selected],
        declarationAccepted: true,
        consentAccepted: true,
        overrideDues: canOverrideDues && overrideDues,
      });
      onApplied();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to submit the application.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
              Apply on behalf of student
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {examName}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {student.studentName} ·{' '}
              {student.pinNo || student.admissionNumber} · {student.branch}
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-[var(--muted)] hover:text-slate-900"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">
            Loading examination…
          </p>
        ) : !detail ? null : (
          <div className="space-y-4">
            {detail.dueClearance?.hasOverdue || detail.dueClearance?.blocked ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-950">
                  Overdue fee dues — {money(detail.dueClearance.totalDue)}
                </h3>
                <p className="mt-1 text-sm text-amber-900">
                  {detail.dueClearance.message}
                </p>
                {detail.dueClearance.restrictionEnabled === false ? (
                  <p className="mt-2 text-xs font-medium text-amber-800">
                    Apply restriction is off in Settings — application is
                    allowed.
                  </p>
                ) : null}
                {detail.dueClearance.byHead?.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-amber-900">
                    {detail.dueClearance.byHead.map((h) => (
                      <li key={h.feeHeadId}>
                        {h.feeHeadName}: {money(h.due)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canOverrideDues &&
                detail.dueClearance.restrictionEnabled !== false ? (
                  <label className="mt-3 flex items-start gap-2 text-sm text-amber-950">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={overrideDues}
                      onChange={(e) => setOverrideDues(e.target.checked)}
                    />
                    <span>
                      Override dues and allow this application (requires
                      fees:due_override)
                    </span>
                  </label>
                ) : detail.dueClearance.restrictionEnabled !== false &&
                  !canOverrideDues ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Application is blocked until dues are cleared.
                  </p>
                ) : null}
              </section>
            ) : null}
            <section className="rounded-xl border border-[var(--border)] p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">
                Applying as
              </h3>
              {(detail.openTypes?.length ?? 0) === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  This student already applied for this examination. Another
                  enrollment type requires a separate examination.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {(detail.openTypes ?? []).map((t) => (
                    <label
                      key={t}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm capitalize ${
                        enrollType === t
                          ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="staff-enroll-type"
                        checked={enrollType === t}
                        onChange={() => chooseEnrollmentType(t)}
                      />
                      {t.replace(/_/g, ' ')}
                    </label>
                  ))}
                </div>
              )}
              {(detail.applications?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-[var(--muted)]">
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

            <section className="rounded-xl border border-[var(--border)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Subjects
                </h3>
                {enrollType !== 'regular' ? (
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-[var(--primary)] hover:underline"
                    onClick={() =>
                      setSelected(
                        new Set(selectableSubjects.map((s) => s.subjectId)),
                      )
                    }
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-[var(--muted)] hover:underline"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                </div>
                ) : null}
              </div>
              {enrollType === 'regular' ? (
                <p className="mb-2 text-xs text-[var(--muted)]">
                  Regular includes all papers. Package fee
                  {detail.exam.packageFee != null
                    ? ` ₹${detail.exam.packageFee}`
                    : ''}
                  .
                </p>
              ) : (
                <p className="mb-2 text-xs text-[var(--muted)]">
                  {enrollType === 'supply'
                    ? 'Only subjects with a latest failed result are selectable. '
                    : ''}
                  Fee by subject count (1…N−1); all subjects uses package fee
                  {Array.isArray(detail.exam.supplyFeeByCount) &&
                  detail.exam.supplyFeeByCount.length > 0
                    ? ` · tiers: ${detail.exam.supplyFeeByCount
                        .map((a, i) => `${i + 1}=₹${a}`)
                        .join(', ')}`
                    : ''}
                  {detail.exam.packageFee != null
                    ? ` · package ₹${detail.exam.packageFee}`
                    : ''}
                  .
                </p>
              )}
              <ul className="space-y-2">
                {subjects.map((s) => {
                  const supplyDisabled =
                    enrollType === 'supply' && !s.supplyStatus?.eligible;
                  const regularLocked = enrollType === 'regular';
                  return (
                  <li key={s.subjectId}>
                    <label className={`flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm ${supplyDisabled || regularLocked ? 'cursor-not-allowed bg-slate-50 opacity-70' : ''}`}>
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(s.subjectId)}
                          disabled={supplyDisabled || regularLocked}
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
                              {s.examDate ?? ''}
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
                    </label>
                  </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-right text-sm font-semibold text-slate-900">
                Estimated fee: {money(liveTotal)}
                {enrollType !== 'regular' && selected.size > 0
                  ? ` (${selected.size} subject${selected.size === 1 ? '' : 's'})`
                  : ''}
              </p>
            </section>

            <section className="space-y-2 rounded-xl border border-[var(--border)] p-4">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={declaration}
                  onChange={(e) => setDeclaration(e.target.checked)}
                />
                <span>
                  The student declares that the particulars furnished are true
                  and that they are eligible to appear for this examination
                  (confirmed at the collection desk).
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
                  The student consents to the processing of this application
                  and the selected subjects for fee calculation and payment.
                </span>
              </label>
            </section>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={
                  submitting ||
                  !(detail.openTypes?.length ?? 0) ||
                  !enrollType ||
                  (detail.canApply === false &&
                    !(canOverrideDues && overrideDues))
                }
              >
                {submitting
                  ? 'Submitting…'
                  : detail.canApply === false &&
                      !(canOverrideDues && overrideDues)
                    ? 'Clear dues to apply'
                    : 'Submit application'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
