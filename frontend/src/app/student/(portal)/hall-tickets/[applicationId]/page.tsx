'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { HallTicket } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { HallTicketDocument } from '@/components/exams/HallTicketDocument';

export default function StudentHallTicketPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId: idParam } = use(params);
  const applicationId = parseInt(idParam, 10);
  const [ticket, setTicket] = useState<HallTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTicket(await api.getStudentHallTicket(applicationId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load hall ticket.',
      );
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingBlock label="Loading hall ticket…" />;

  if (!ticket) {
    return (
      <div className="space-y-3">
        <Alert tone="danger">{error || 'Not found'}</Alert>
        <Link href="/student/documents" className="text-sm text-[var(--primary)]">
          ← Documents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden no-print">
        <div>
          <Link
            href="/student/documents"
            className="text-xs font-medium text-[var(--primary)] hover:underline"
          >
            ← Documents
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Hall ticket</h1>
          <p className="text-sm text-[var(--muted)]">{ticket.examName}</p>
        </div>
        <Button type="button" onClick={() => window.print()}>
          Print / download
        </Button>
      </div>
      <HallTicketDocument ticket={ticket} />
    </div>
  );
}
