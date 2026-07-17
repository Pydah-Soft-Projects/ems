'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ExamFeeRecord } from '@/types/fee';
import { HallTicket } from '@/types/exam';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { LoadingBlock } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardBody } from '@/components/ui/Card';

export default function StudentDocumentsPage() {
  const [tab, setTab] = useState<'receipts' | 'hall-tickets'>('receipts');
  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [tickets, setTickets] = useState<HallTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fees, hall] = await Promise.all([
        api.getStudentFees(),
        api.getStudentHallTickets().catch(() => [] as HallTicket[]),
      ]);
      setRecords(fees);
      setTickets(hall);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load documents.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const receipts = records
    .flatMap((r) =>
      (r.payments || [])
        .filter((p) => p.status === 'success')
        .map((p) => ({
          paymentId: p.id,
          examName: r.exam?.name ?? `Exam #${r.examId}`,
          receiptNumber: p.receiptNumber,
          amount: p.amountPaid,
        })),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Receipts and hall tickets with print-ready previews."
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Tabs
        activeId={tab}
        onChange={(id) => setTab(id as 'receipts' | 'hall-tickets')}
        items={[
          { id: 'receipts', label: 'Receipts', count: receipts.length },
          {
            id: 'hall-tickets',
            label: 'Hall tickets',
            count: tickets.length,
          },
        ]}
      />
      {loading ? (
        <LoadingBlock />
      ) : tab === 'receipts' ? (
        receipts.length === 0 ? (
          <EmptyState
            title="No receipts yet"
            description="Receipts appear after a successful fee payment."
          />
        ) : (
          <div className="space-y-3">
            {receipts.map((r) => (
              <Card key={r.paymentId}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.examName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {r.receiptNumber}
                    </p>
                  </div>
                  <Link
                    href={`/student/receipt/${r.paymentId}`}
                    className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View / print
                  </Link>
                </CardBody>
              </Card>
            ))}
          </div>
        )
      ) : tickets.length === 0 ? (
        <EmptyState
          title="No hall tickets"
          description="Tickets appear after fees are paid and the college releases them."
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.applicationId}>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{t.examName}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {t.examType.replace(/_/g, ' ')} · {t.papers.length} papers
                  </p>
                </div>
                <Link
                  href={`/student/hall-tickets/${t.applicationId}`}
                  className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View / print
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
