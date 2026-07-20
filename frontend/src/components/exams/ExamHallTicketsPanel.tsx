'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Exam, HallTicket } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { HallTicketDocument } from '@/components/exams/HallTicketDocument';
import { printA5HallTicket } from '@/lib/printA5HallTicket';

interface ExamHallTicketsPanelProps {
  exam: Exam;
}

export function ExamHallTicketsPanel({ exam }: ExamHallTicketsPanelProps) {
  const [tickets, setTickets] = useState<HallTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [previewTicket, setPreviewTicket] = useState<HallTicket | null>(null);

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

  function handlePrint(ticket: HallTicket) {
    printA5HallTicket(ticket, {
      collegeName: ticket.college || exam.college || undefined,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-medium text-slate-800">Hall tickets (paid)</p>
          <p className="text-xs text-[var(--muted)]">
            Print opens the A5 layout (top half of A4), same as fee receipts —
            not the browser page print.
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
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Roll / PIN</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Papers</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
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
                      <div className="inline-flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!px-2.5 !py-1 text-xs"
                          onClick={() => setPreviewTicket(t)}
                        >
                          Preview
                        </Button>
                        <Button
                          type="button"
                          className="!px-2.5 !py-1 text-xs"
                          onClick={() => handlePrint(t)}
                        >
                          Print
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={!!previewTicket}
        onClose={() => setPreviewTicket(null)}
        title="Hall ticket preview"
        size="lg"
      >
        {previewTicket && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted)]">
                Print = Student copy on top half of A4 (A5 landscape size) ·
                same padding as fee receipt
              </p>
              <Button type="button" onClick={() => handlePrint(previewTicket)}>
                Print
              </Button>
            </div>
            <div className="overflow-auto rounded-xl border border-[var(--border)] bg-slate-100 p-4">
              <div className="mx-auto w-[210mm] max-w-full">
                <HallTicketDocument ticket={previewTicket} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
