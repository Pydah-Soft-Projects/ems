'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ExamFeeRecord } from '@/types/fee';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ApplicationCard } from '@/components/student/ExamCard';

export default function StudentApplicationsPage() {
  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRecords(await api.getStudentFees());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load applications.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () => records.filter((r) => r.status === 'pending'),
    [records],
  );
  const paid = useMemo(
    () => records.filter((r) => r.status === 'paid'),
    [records],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Track enrollment status and continue payment when fees are due."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingBlock />
      ) : records.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Apply to an open examination from the Exams page."
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Payment due ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No pending payments.</p>
            ) : (
              pending.map((r) => <ApplicationCard key={r.id} record={r} />)
            )}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Paid ({paid.length})
            </h2>
            {paid.map((r) => (
              <ApplicationCard key={r.id} record={r} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
