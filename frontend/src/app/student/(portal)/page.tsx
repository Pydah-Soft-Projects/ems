'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { ExamFeeRecord } from '@/types/fee';
import { HallTicket, StudentExamListItem } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { money } from '@/components/fees/money';
import {
  ApplicationCard,
  AvailableExamCard,
} from '@/components/student/ExamCard';

export default function StudentHomePage() {
  const user = getStoredUser();
  const [exams, setExams] = useState<StudentExamListItem[]>([]);
  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [hallTickets, setHallTickets] = useState<HallTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [examList, fees, tickets] = await Promise.all([
        api.getStudentExams(),
        api.getStudentFees(),
        api.getStudentHallTickets().catch(() => [] as HallTicket[]),
      ]);
      setExams(examList);
      setRecords(fees);
      setHallTickets(tickets);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load your dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep exam visible when any enrollment type remains open
  const available = useMemo(
    () => exams.filter((e) => (e.openTypes?.length ?? 0) > 0),
    [exams],
  );

  const pending = useMemo(
    () => records.filter((r) => r.status === 'pending'),
    [records],
  );

  const totalDue = useMemo(
    () => pending.reduce((s, r) => s + Number(r.totalAmount), 0),
    [pending],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-white p-4 sm:p-6 shadow-[var(--shadow-md)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
              Welcome
            </p>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 break-words">
              {user?.fullName}
            </h1>
            <div className="mt-2.5 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
              {user?.course ? (
                <span className="rounded-full bg-[var(--primary-soft)] px-2 sm:px-2.5 py-0.5 sm:py-1 text-[0.6875rem] sm:text-xs font-medium text-[var(--primary)]">
                  {user.course}
                </span>
              ) : null}
              {user?.branch ? (
                <span className="rounded-full bg-[var(--accent-soft)] px-2 sm:px-2.5 py-0.5 sm:py-1 text-[0.6875rem] sm:text-xs font-medium text-[var(--accent-hover)]">
                  {user.branch}
                </span>
              ) : null}
              {user?.currentYear != null ? (
                <span className="rounded-full bg-[var(--surface-muted)] px-2 sm:px-2.5 py-0.5 sm:py-1 text-[0.6875rem] sm:text-xs font-medium text-[var(--muted)]">
                  Y{user.currentYear} / S{user.currentSemester}
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 sm:mt-3 text-[0.6875rem] sm:text-sm text-[var(--muted)] break-words">
              {available.length} open exam{available.length !== 1 ? 's' : ''} ·{' '}
              {pending.length} payment{pending.length !== 1 ? 's' : ''} due ·{' '}
              {hallTickets.length} hall ticket
              {hallTickets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="w-full sm:w-auto rounded-[var(--radius-lg)] bg-[var(--accent-soft)] px-4 sm:px-5 py-3 sm:py-4 sm:text-right">
            <p className="text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wider text-[var(--accent-hover)]">
              Total due
            </p>
            <p className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
              {money(totalDue)}
            </p>
          </div>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <section className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <AttentionCard
          title="Open exams"
          value={String(available.length)}
          href="/student/exams"
          tone="info"
        />
        <AttentionCard
          title="Payments due"
          value={String(pending.length)}
          href="/student/applications"
          tone="warning"
        />
        <AttentionCard
          title="Documents"
          value={String(hallTickets.length)}
          href="/student/documents"
          tone="success"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Needs your attention
          </h2>
          <Link
            href="/student/exams"
            className="text-sm font-semibold text-[var(--primary)]"
          >
            All exams
          </Link>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : available.length === 0 && pending.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            description="No open enrollments or pending payments right now."
          />
        ) : (
          <div className="space-y-3">
            {pending.slice(0, 3).map((r) => (
              <ApplicationCard key={`p-${r.id}`} record={r} />
            ))}
            {available.slice(0, 3).map((e) => (
              <AvailableExamCard key={`e-${e.id}`} exam={e} />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Hall tickets</h2>
            <p className="text-sm text-[var(--muted)]">
              Available after release and payment
            </p>
          </div>
          <Link
            href="/student/documents"
            className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Documents
          </Link>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : hallTickets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hall tickets yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {hallTickets.slice(0, 3).map((t) => (
              <li key={t.applicationId}>
                <Link
                  href={`/student/hall-tickets/${t.applicationId}`}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  {t.examName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AttentionCard({
  title,
  value,
  href,
  tone,
}: {
  title: string;
  value: string;
  href: string;
  tone: 'info' | 'warning' | 'success';
}) {
  const tones = {
    info: 'border-[var(--primary)]/10 bg-[var(--primary-soft)]',
    warning: 'border-[var(--accent-border)] bg-[var(--accent-soft)]',
    success: 'border-[var(--success-border)] bg-[var(--success-soft)]',
  };
  return (
    <Link
      href={href}
      className={`rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)] ${tones[tone]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Link>
  );
}
