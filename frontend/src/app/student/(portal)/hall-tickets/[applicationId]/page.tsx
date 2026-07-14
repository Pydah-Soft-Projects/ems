'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { HallTicket } from '@/types/exam';
import { Button } from '@/components/ui/Button';
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

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading hall ticket…</p>;
  }

  if (!ticket) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--danger)]">{error || 'Not found'}</p>
        <Link href="/student" className="text-sm text-[var(--primary)]">
          ← Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/student"
          className="text-xs font-medium text-[var(--primary)] hover:underline"
        >
          ← My examinations
        </Link>
        <Button type="button" onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <HallTicketDocument ticket={ticket} />
    </div>
  );
}
