'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { StudentExamDetail, ExamType } from '@/types/exam';
import { SdmsStudent } from '@/types/sdms';
import { money } from './money';

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
    if (!detail) return 0;
    const ids = [...selected];
    if (ids.length === 0) return 0;
    const sum = subjects
      .filter((s) => ids.includes(s.subjectId))
      .reduce((acc, s) => acc + Number(s.fee), 0);
    const allSelected = ids.length === subjects.length;
    const pkg =
      detail.exam.packageFee != null ? Number(detail.exam.packageFee) : null;
    // Package fee is the flat bundle price when all papers are selected.
    if (allSelected && pkg != null && !Number.isNaN(pkg)) {
      return pkg;
    }
    return sum;
  }, [detail, selected, subjects]);

  function toggleSubject(id: number) {
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
    setSubmitting(true);
    setError('');
    try {
      await api.applyExamForStudent(student.id, examId, {
        examType: enrollType,
        selectedSubjectIds: [...selected],
        declarationAccepted: true,
        consentAccepted: true,
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
              </div>
              {detail.exam.packageFee != null &&
                selectableSubjects.length === subjects.length && (
                <p className="mb-2 text-xs text-[var(--muted)]">
                  Package fee ₹{detail.exam.packageFee} applies when all
                  subjects are selected.
                </p>
                )}
              {enrollType === 'supply' && (
                <p className="mb-2 text-xs text-[var(--muted)]">
                  Only subjects with a latest failed result are selectable.
                  Passed subjects are disabled.
                </p>
              )}
              <ul className="space-y-2">
                {subjects.map((s) => {
                  const supplyDisabled =
                    enrollType === 'supply' && !s.supplyStatus?.eligible;
                  return (
                  <li key={s.subjectId}>
                    <label className={`flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-sm ${supplyDisabled ? 'cursor-not-allowed bg-slate-50 opacity-70' : ''}`}>
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
                      <span className="tabular-nums text-[var(--muted)]">
                        {money(s.fee)}
                      </span>
                    </label>
                  </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-right text-sm font-semibold text-slate-900">
                Estimated fee: {money(liveTotal)}
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
                  !enrollType
                }
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
