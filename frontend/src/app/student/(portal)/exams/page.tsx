'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { StudentExamListItem } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AvailableExamCard } from '@/components/student/ExamCard';

export default function StudentExamsPage() {
  const [exams, setExams] = useState<StudentExamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setExams(await api.getStudentExams());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load examinations.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useMemo(
    () => exams.filter((e) => (e.openTypes?.length ?? 0) > 0),
    [exams],
  );
  const closed = useMemo(
    () => exams.filter((e) => (e.openTypes?.length ?? 0) === 0),
    [exams],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Examinations"
        description="Apply for open enrollment types. If you already applied for Regular, Supply can still appear here when published."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Open for application ({open.length})
            </h2>
            {open.length === 0 ? (
              <EmptyState
                title="No open examinations"
                description="When your college publishes an exam in your scope, it will appear here."
              />
            ) : (
              open.map((e) => <AvailableExamCard key={e.id} exam={e} />)
            )}
          </section>
          {closed.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                No open types ({closed.length})
              </h2>
              {closed.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-dashed border-[var(--border)] bg-white p-4 text-sm text-[var(--muted)]"
                >
                  <p className="font-semibold text-slate-800">{e.name}</p>
                  <p className="mt-1">
                    All published enrollment types for this exam are already
                    applied or closed.
                  </p>
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
