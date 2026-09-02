'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Exam, HallTicket } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { HallTicketDocument } from '@/components/exams/HallTicketDocument';
import { printA5HallTicket } from '@/lib/printA5HallTicket';
import { isDuplicateHallTicketFeeRecord } from '@/lib/upiConvenienceFee';

interface ExamHallTicketsPanelProps {
  exam: Exam;
}

export function ExamHallTicketsPanel({ exam }: ExamHallTicketsPanelProps) {
  const router = useRouter();
  const [tickets, setTickets] = useState<HallTicket[]>([]);
  const [duplicateFeeRows, setDuplicateFeeRows] = useState<
    Array<{
      id: number;
      studentRollNumber: string;
      studentName: string;
      status: 'pending' | 'paid';
      amount: number;
      ticket: HallTicket | null;
      history: Array<{
        id: number;
        status: 'pending' | 'paid';
        totalAmount: number;
        createdAt: string;
      }>;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'original' | 'duplicate'>('original');
  const [duplicateFilter, setDuplicateFilter] = useState('');
  const [previewTicket, setPreviewTicket] = useState<HallTicket | null>(null);
  const [duplicateHistory, setDuplicateHistory] = useState<
    Array<{
      id: number;
      status: 'pending' | 'paid';
      totalAmount: number;
      createdAt: string;
    }>
  >([]);
  const [duplicateHistoryStudent, setDuplicateHistoryStudent] = useState<string | null>(null);
  const [settingsDuplicateFee, setSettingsDuplicateFee] = useState<number>(250);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [ticketsToPrint, setTicketsToPrint] = useState<HallTicket[]>([]);
  const [selectedCopies, setSelectedCopies] = useState<{
    original: boolean;
    duplicate: boolean;
  }>({
    original: true,
    duplicate: false,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.getExamHallTickets(exam.id),
      api.getFeeRecords({ examId: exam.id }),
      api.getPaymentSettings().catch(() => ({ duplicateHallTicketFee: 250 })),
    ])
      .then(([hallTickets, feeRecords, settings]) => {
        if (cancelled) return;
        const liveDuplicateFee = Number(settings?.duplicateHallTicketFee ?? 250) || 250;
        setSettingsDuplicateFee(liveDuplicateFee);
        const ticketMap = new Map(
          hallTickets.tickets.map((ticket) => [
            ticket.studentRollNumber.trim().toLowerCase(),
            ticket,
          ]),
        );
        const duplicateRecordsByRoll = new Map<string, typeof feeRecords>();
        for (const record of feeRecords.filter((entry) =>
          isDuplicateHallTicketFeeRecord(entry.feeBreakdown),
        )) {
          const key = String(record.studentRollNumber ?? '').trim().toLowerCase();
          if (!key) continue;
          const list = duplicateRecordsByRoll.get(key) ?? [];
          list.push(record);
          duplicateRecordsByRoll.set(key, list);
        }

        const rows = hallTickets.tickets.map((ticket) => {
          const rollKey = ticket.studentRollNumber.trim().toLowerCase();
          const duplicateRecords = duplicateRecordsByRoll.get(rollKey) ?? [];
          const latestDuplicateRecord = duplicateRecords.length > 0
            ? [...duplicateRecords].sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              )[0]
            : null;
          const status: 'pending' | 'paid' =
            latestDuplicateRecord?.status === 'paid' ? 'paid' : 'pending';
          const currentDuplicateFee = Number(
            exam.duplicateHallTicketFee ?? liveDuplicateFee ?? 250,
          ) || Number(liveDuplicateFee ?? 250) || 250;
          return {
            id: latestDuplicateRecord?.id ?? ticket.applicationId,
            studentRollNumber: ticket.studentRollNumber,
            studentName: ticket.studentName,
            status,
            amount: currentDuplicateFee,
            ticket: ticket,
            history: duplicateRecords.map((record) => {
              const recordStatus: 'pending' | 'paid' =
                record.status === 'paid' ? 'paid' : 'pending';
              return {
                id: record.id,
                status: recordStatus,
                totalAmount: Number(record.totalAmount) || 0,
                createdAt: record.createdAt,
              };
            }),
          };
        });
        setTickets(hallTickets.tickets);
        setDuplicateFeeRows(rows);
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

  const duplicateFiltered = useMemo(() => {
    const q = duplicateFilter.trim().toLowerCase();
    return duplicateFeeRows.filter((row) => {
      if (!q) return true;
      return (
        row.studentName.toLowerCase().includes(q) ||
        row.studentRollNumber.toLowerCase().includes(q)
      );
    });
  }, [duplicateFilter, duplicateFeeRows]);

  const liveDuplicateFee = Number(
    exam.duplicateHallTicketFee ?? settingsDuplicateFee ?? 250,
  ) || Number(settingsDuplicateFee ?? 250) || 250;

  const isAllSelected =
    filtered.length > 0 &&
    filtered.every((t) => selectedIds.has(t.applicationId));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAllSelected) {
      filtered.forEach((t) => next.delete(t.applicationId));
    } else {
      filtered.forEach((t) => next.add(t.applicationId));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  function handlePrint(ticket: HallTicket, mode: 'original' | 'duplicate' = 'original') {
    setTicketsToPrint([ticket]);
    setSelectedCopies({
      original: mode === 'original',
      duplicate: mode === 'duplicate',
    });
    setPrintModalOpen(true);
  }

  function handleBulkPrintTrigger() {
    const selected = tickets.filter((t) => selectedIds.has(t.applicationId));
    if (selected.length === 0) return;
    setTicketsToPrint(selected);
    setSelectedCopies({
      original: activeTab === 'original',
      duplicate: activeTab === 'duplicate',
    });
    setPrintModalOpen(true);
  }

  function handleExecutePrint() {
    const copies: ('original' | 'duplicate')[] = [];
    if (selectedCopies.original) copies.push('original');
    if (selectedCopies.duplicate) copies.push('duplicate');

    if (copies.length === 0) return;

    printA5HallTicket(ticketsToPrint, {
      collegeName: ticketsToPrint[0].college || exam.college || undefined,
      copies,
    });
    setPrintModalOpen(false);
  }

  async function handleDuplicatePayment(
    studentRollNumber: string,
    studentName: string,
  ) {
    try {
      await api.createDuplicateHallTicketFeeRecord(
        exam.id,
        studentRollNumber,
        studentName,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        return;
      }
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      setError('Unable to prepare the duplicate fee record.');
      return;
    }
    const target = `/dashboard/fees/collect/${encodeURIComponent(studentRollNumber)}?examId=${exam.id}`;
    if (typeof window !== 'undefined') {
      window.location.href = target;
      return;
    }
    router.push(target);
  }

  function openDuplicateHistory(studentRollNumber: string, studentName: string) {
    const history = duplicateFeeRows.find(
      (row) => row.studentRollNumber === studentRollNumber && row.studentName === studentName,
    )?.history ?? [];
    setDuplicateHistoryStudent(studentRollNumber);
    setDuplicateHistory(history);
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
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-xs text-[var(--muted)]">
            {tickets.length} paid applicant{tickets.length !== 1 ? 's' : ''}
            {exam.hallTicketsReleasedAt
              ? ' · student portal released'
              : ' · student portal not released yet'}
          </p>
          {selectedIds.size > 0 && activeTab === 'original' && (
            <Button
              type="button"
              className="text-xs !py-1 !px-3 font-semibold"
              onClick={handleBulkPrintTrigger}
            >
              Bulk Print ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      <Tabs
        activeId={activeTab}
        items={[
          { id: 'original', label: 'Original', count: tickets.length },
          {
            id: 'duplicate',
            label: 'Duplicate',
            count: tickets.length,
          },
        ]}
        onChange={(id) => setActiveTab(id as 'original' | 'duplicate')}
      />

      {loading ? (
        <p className="text-[var(--muted)]">Loading hall tickets…</p>
      ) : error ? (
        <p className="text-[var(--danger)]">{error}</p>
      ) : tickets.length === 0 ? (
        <p className="text-[var(--muted)]">
          No paid applications yet. Hall tickets appear here after a student
          enrolls and pays.
        </p>
      ) : activeTab === 'original' ? (
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
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
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
                    className="border-t border-[var(--border)] hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.applicationId)}
                        onChange={() => toggleSelect(t.applicationId)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
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
      ) : (
        <>
          <div className="rounded-xl border border-[var(--border)] bg-amber-50/60 p-3 text-xs text-amber-900">
            Duplicate hall ticket fee: ₹
            {liveDuplicateFee}. Use the payment page to complete the payment before issuing a duplicate copy.
          </div>
          <Input
            label="Search students"
            value={duplicateFilter}
            onChange={(e) => setDuplicateFilter(e.target.value)}
            placeholder="Name or PIN"
          />
          <div className="max-h-72 overflow-auto rounded-[var(--radius)] border border-[var(--border)]">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Roll / PIN</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Fee</th>
                  <th className="px-3 py-2 font-semibold">History</th>
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {duplicateFiltered.map((row) => (
                  <tr
                    key={`duplicate-${row.id}`}
                    className="border-t border-[var(--border)] hover:bg-slate-50/50"
                  >
                    <td className="px-3 py-2 font-medium tabular-nums">{row.studentRollNumber}</td>
                    <td className="px-3 py-2">{row.studentName}</td>
                    <td className="px-3 py-2 capitalize">Duplicate</td>
                    <td className="px-3 py-2 font-medium text-slate-800">₹{Number(row.amount) || liveDuplicateFee}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="!px-2.5 !py-1 text-xs"
                        onClick={() => openDuplicateHistory(row.studentRollNumber, row.studentName)}
                      >
                        History ({row.history.length})
                      </Button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1">
                        {row.status === 'paid' && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="!px-2.5 !py-1 text-xs"
                            onClick={() => {
                              if (row.ticket) {
                                handlePrint(row.ticket, 'duplicate');
                              }
                            }}
                          >
                            Print
                          </Button>
                        )}
                        <Button
                          type="button"
                          className="!px-2.5 !py-1 text-xs"
                          onClick={() =>
                            void handleDuplicatePayment(
                              row.studentRollNumber,
                              row.studentName,
                            )
                          }
                        >
                          {row.status === 'paid' ? 'Pay duplicate fee' : 'Pay duplicate fee'}
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
        open={Boolean(duplicateHistoryStudent)}
        onClose={() => {
          setDuplicateHistoryStudent(null);
          setDuplicateHistory([]);
        }}
        title={duplicateHistoryStudent ? `Duplicate hall ticket history — ${duplicateHistoryStudent}` : 'Duplicate hall ticket history'}
        size="md"
      >
        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-[var(--border)] bg-slate-50 p-3 text-xs text-slate-600">
            Total duplicate requests: <span className="font-semibold text-slate-900">{duplicateHistory.length}</span>
          </div>
          {duplicateHistory.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No duplicate hall ticket fee history found for this student.</p>
          ) : (
            <div className="space-y-3">
              {duplicateHistory
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-[var(--border)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          ₹{Number(entry.totalAmount) || 0}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {new Date(entry.createdAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                          entry.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
          {duplicateHistoryStudent && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() =>
                  void handleDuplicatePayment(
                    duplicateHistoryStudent,
                    duplicateFeeRows.find((row) => row.studentRollNumber === duplicateHistoryStudent)?.studentName ?? '',
                  )
                }
              >
                Pay duplicate hall ticket again
              </Button>
            </div>
          )}
        </div>
      </Modal>

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

      <Modal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        title="Select Copies to Print"
        size="md"
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            Select the copies you want to print for {ticketsToPrint.length === 1 ? 'this hall ticket' : `${ticketsToPrint.length} hall tickets`}:
          </p>
          <div className="grid gap-3 md:grid-cols-1">
            {activeTab === 'original' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCopies.original}
                    onChange={(e) =>
                      setSelectedCopies((prev) => ({
                        ...prev,
                        original: e.target.checked,
                        duplicate: false,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 text-sm">Original</span>
                    <p className="text-xs text-slate-500">Prints the student copy (marked ORIGINAL)</p>
                  </div>
                </label>
              </div>
            )}

            {activeTab === 'duplicate' && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCopies.duplicate}
                    onChange={(e) =>
                      setSelectedCopies((prev) => ({
                        ...prev,
                        duplicate: e.target.checked,
                        original: false,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 text-sm">Duplicate</span>
                    <p className="text-xs text-slate-500">Prints the duplicate copy (marked DUPLICATE)</p>
                  </div>
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPrintModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!selectedCopies.original && !selectedCopies.duplicate}
              onClick={handleExecutePrint}
            >
              Print
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
