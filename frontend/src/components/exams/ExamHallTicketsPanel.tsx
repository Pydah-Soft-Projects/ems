'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Exam, HallTicket } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { HallTicketDocument } from '@/components/exams/HallTicketDocument';

interface ExamHallTicketsPanelProps {
  exam: Exam;
}

export function ExamHallTicketsPanel({ exam }: ExamHallTicketsPanelProps) {
  const [tickets, setTickets] = useState<HallTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [printTicket, setPrintTicket] = useState<HallTicket | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .getExamHallTickets(exam.id)
      .then((res) => {
        if (!cancelled) setTickets(res.tickets);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load hall tickets.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exam.id]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.studentName.toLowerCase().includes(q) ||
        t.studentRollNumber.toLowerCase().includes(q) ||
        t.examType.toLowerCase().includes(q),
    );
  }, [tickets, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">Hall tickets (paid)</p>
          <p className="text-xs text-[var(--muted)]">
            Print and hand over for students who have paid. Subjects shown are
            only those on their paid application.
          </p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {tickets.length} paid applicant{tickets.length !== 1 ? 's' : ''}
          {exam.hallTicketsReleasedAt
            ? ' · student portal released'
            : ' · student portal not released yet'}
        </p>
      </div>

      {loading ? (
        <p className="text-[var(--muted)]">Loading hall tickets…</p>
      ) : error ? (
        <p className="text-[var(--danger)]">{error}</p>
      ) : tickets.length === 0 ? (
        <p className="text-[var(--muted)]">
          No paid applications yet. Hall tickets appear here after a student
          enrolls and pays.
        </p>
      ) : (
        <>
          <Input
            label="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name, PIN, regular/supply…"
          />
          <div className="max-h-64 overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Roll / PIN</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Papers</th>
                  <th className="px-3 py-2 text-right font-semibold">Print</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.applicationId}
                    className="border-t border-[var(--border)]"
                  >
                    <td className="px-3 py-2 font-medium tabular-nums">
                      {t.studentRollNumber}
                    </td>
                    <td className="px-3 py-2">{t.studentName}</td>
                    <td className="px-3 py-2 capitalize">
                      {t.examType.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {t.papers.length}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="!px-2.5 !py-1 text-xs"
                        onClick={() => setPrintTicket(t)}
                      >
                        Print
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={!!printTicket}
        onClose={() => setPrintTicket(null)}
        title="Print hall ticket"
        size="lg"
      >
        {printTicket && (
          <div className="space-y-4">
            <div className="flex justify-end print:hidden">
              <Button type="button" onClick={() => window.print()}>
                Print
              </Button>
            </div>
            <HallTicketDocument ticket={printTicket} />
          </div>
        )}
      </Modal>
    </div>
  );
}
