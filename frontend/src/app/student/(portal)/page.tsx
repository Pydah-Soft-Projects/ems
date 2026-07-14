'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { ExamFeeRecord } from '@/types/fee';
import { HallTicket, StudentExamListItem } from '@/types/exam';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { money } from '@/components/fees/money';
import { calcUpiConvenienceFee } from '@/lib/upiConvenienceFee';

function typeLabel(t: string) {
  return t.replace(/_/g, ' ');
}

export default function StudentHomePage() {
  const router = useRouter();
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
          : 'Failed to load your examinations.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

      const available = useMemo(
    () => exams.filter((e) => !e.alreadyApplied && (e.openTypes?.length ?? 0) > 0),
    [exams],
  );

  const totalDue = useMemo(
    () =>
      records
        .filter((r) => r.status === 'pending')
        .reduce((s, r) => s + Number(r.totalAmount), 0),
    [records],
  );

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-6 text-white shadow-lg shadow-blue-500/20">
        <p className="text-sm text-blue-100">Welcome</p>
        <h1 className="text-2xl font-bold">{user?.fullName}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {user?.course && (
            <span className="rounded-full bg-white/15 px-2.5 py-0.5">
              {user.course}
            </span>
          )}
          {user?.branch && (
            <span className="rounded-full bg-white/15 px-2.5 py-0.5">
              {user.branch}
            </span>
          )}
          {user?.currentYear != null && (
            <span className="rounded-full bg-white/15 px-2.5 py-0.5">
              Y{user.currentYear} / S{user.currentSemester}
            </span>
          )}
        </div>
        <div className="mt-4 text-right">
          <p className="text-xs uppercase tracking-wide text-blue-100">
            Total due
          </p>
          <p className="text-3xl font-bold">{money(totalDue)}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Hall tickets</h2>
          <p className="text-sm text-[var(--muted)]">
            Available after admin release and fee payment — for subjects you
            paid for
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : hallTickets.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No hall tickets yet. They appear once fees are paid and the college
            releases them.
          </p>
        ) : (
          <div className="space-y-3">
            {hallTickets.map((t) => (
              <div
                key={t.applicationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-4"
              >
                <div>
                  <p className="font-semibold text-slate-900">{t.examName}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {typeLabel(t.examType)} · {t.papers.length} paper
                    {t.papers.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() =>
                    router.push(`/student/hall-tickets/${t.applicationId}`)
                  }
                >
                  View / print
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Available examinations
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Choose Regular or Supply (if both are published), select subjects,
            then pay
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No open examinations in your scope right now.
          </p>
        ) : (
          <div className="space-y-3">
            {available.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{e.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {(e.allowedTypes?.length
                        ? e.allowedTypes
                        : [e.type]
                      )
                        .map((t) => t.replace(/_/g, ' '))
                        .join(' / ')}{' '}
                      · {e.course} / {e.branch} · Y{e.yearOfStudy}/S
                      {e.semester} · {e.subjectCount} subjects
                    </p>
                    {e.applicationEndDate && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Apply by {e.applicationEndDate}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    onClick={() => router.push(`/student/exams/${e.id}/apply`)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            My applications
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Submitted applications and payment status
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No applications yet. Apply to an examination above.
          </p>
        ) : (
          <div className="space-y-3">
            {records.map((r) => {
              const upiTotal = calcUpiConvenienceFee(r.totalAmount, 'upi')
                .total;
              const successPay = r.payments?.find(
                (p) => p.status === 'success',
              );
              return (
                <div
                  key={r.id}
                  className="rounded-xl border border-[var(--border)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {r.exam?.name ?? `Exam #${r.examId}`}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {r.exam
                          ? `${(r.examType ?? r.exam.type)?.toString().replace(/_/g, ' ') ?? ''} · ${r.exam.course} / ${r.exam.branch} · Y${r.exam.yearOfStudy}/S${r.exam.semester}`
                          : '—'}
                      </p>
                      {r.feeBreakdown?.length > 0 && (
                        <p className="mt-2 text-sm text-slate-700">
                          Subjects:{' '}
                          {r.feeBreakdown
                            .map((b) => `${b.subjectCode} (${money(b.fee)})`)
                            .join(', ')}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        <span>Base {money(r.baseFee)}</span>
                        <span>Late {money(r.lateFee)}</span>
                        <span className="font-semibold">
                          Fee {money(r.totalAmount)}
                        </span>
                        {r.status === 'pending' && (
                          <span className="text-amber-800">
                            From {money(upiTotal)} with UPI (incl. 2.2%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge
                        variant={r.status === 'paid' ? 'success' : 'warning'}
                      >
                        {r.status === 'paid' ? 'Paid' : 'Payment due'}
                      </Badge>
                      {r.status === 'pending' ? (
                        <Button
                          type="button"
                          onClick={() => router.push(`/student/apply/${r.id}`)}
                        >
                          Pay now
                        </Button>
                      ) : (
                        successPay && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                              router.push(`/student/receipt/${successPay.id}`)
                            }
                          >
                            View receipt
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
