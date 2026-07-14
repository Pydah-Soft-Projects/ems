'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Exam } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface PublishExamModalProps {
  open: boolean;
  exam: Exam | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onPublish: () => Promise<void>;
}

export function PublishExamModal({
  open,
  exam,
  saving,
  error,
  onClose,
  onPublish,
}: PublishExamModalProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [scopeLabel, setScopeLabel] = useState('');

  useEffect(() => {
    if (!open || !exam) return;

    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setEligibleCount(null);
    setScopeLabel('');

    api
      .getExamEligibleStudents(exam.id)
      .then((res) => {
        if (cancelled) return;
        setEligibleCount(res.total);
        const branchPart = res.exam.scopes?.length
          ? [...new Set(res.exam.scopes.map((s) => s.branch))].join(', ')
          : res.exam.branch;
        const secPart = res.exam.scopes?.some((s) => s.section)
          ? ` · sec ${res.exam.scopes
              .filter((s) => s.section)
              .map((s) => s.section)
              .join(', ')}`
          : '';
        setScopeLabel(
          `${res.exam.college} · ${res.exam.course} / ${branchPart}${secPart} / ${res.exam.batch} · Y${res.exam.yearOfStudy}/S${res.exam.semester}`,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load eligible students from SDMS.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, exam]);

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Publish examination"
      description={
        exam
          ? `Make “${exam.name}” visible to eligible students. They enroll and create fees themselves — no fee records are generated on publish.`
          : undefined
      }
      size="md"
    >
      <div className="space-y-4">
        {scopeLabel && (
          <p className="text-sm text-[var(--muted)]">{scopeLabel}</p>
        )}

        {loading ? (
          <p className="text-sm text-[var(--muted)]">
            Counting eligible students…
          </p>
        ) : loadError ? (
          <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {loadError}
            <p className="mt-2 text-xs opacity-80">
              You can still publish; students will appear once SDMS is reachable.
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <p>
              <span className="text-[var(--muted)]">Eligible students:</span>{' '}
              <strong>{eligibleCount ?? 0}</strong>
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              After publish, students in this scope can apply (choose subjects,
              consent) and then pay. Fee records are created on application, not
              now.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            type="button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void onPublish()}
            disabled={saving || loading}
          >
            {saving ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
