'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SoftSearchField, StatusFilter, KpiTile } from '@/components/ui/SoftSearch';
import { ApiError, api } from '@/lib/api';
import { FeeStatusBadge, money } from '@/components/fees/CollectPaymentModal';
import { ExamFeeRecord } from '@/types/fee';
import { SdmsStudent } from '@/types/sdms';

type StatusTab = 'all' | 'pending' | 'paid';

const statusTabs: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'paid', label: 'Paid' },
];

export default function FeesPage() {
  const router = useRouter();
  const [records, setRecords] = useState<ExamFeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [searchRoll, setSearchRoll] = useState('');
  const [studentResults, setStudentResults] = useState<SdmsStudent[] | null>(
    null,
  );
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [searchError, setSearchError] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRecords(await api.getFeeRecords());
    } catch (err) {
      setRecords([]);
      setError(
        err instanceof ApiError ? err.message : 'Failed to load fee records.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const visibleRecords = useMemo(
    () =>
      statusTab === 'all'
        ? records
        : records.filter((record) => record.status === statusTab),
    [records, statusTab],
  );

  const summary = useMemo(() => {
    const pending = records.filter((record) => record.status === 'pending');
    const paid = records.filter((record) => record.status === 'paid');
    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce(
        (total, record) => total + Number(record.totalAmount || 0),
        0,
      ),
      paidCount: paid.length,
      paidAmount: paid.reduce(
        (total, record) => total + Number(record.totalAmount || 0),
        0,
      ),
    };
  }, [records]);

  function openCollect(roll: string) {
    router.push(`/dashboard/fees/collect/${encodeURIComponent(roll)}`);
  }

  function studentRoll(student: SdmsStudent) {
    return (student.pinNo || student.admissionNumber || '').trim();
  }

  async function onQuickSearch(e: React.FormEvent) {
    e.preventDefault();
    const query = searchRoll.trim();
    if (!query) return;
    setSearchingStudents(true);
    setSearchError('');
    setStudentResults(null);
    try {
      const res = await api.getSdmsStudents({ search: query, limit: 25 });
      const items = res.items.filter((s) => studentRoll(s));
      // Exact PIN/admission match → open the desk directly
      const exact = items.find(
        (s) =>
          s.pinNo?.toLowerCase() === query.toLowerCase() ||
          s.admissionNumber?.toLowerCase() === query.toLowerCase(),
      );
      if (exact) {
        openCollect(studentRoll(exact));
        return;
      }
      if (items.length === 1) {
        openCollect(studentRoll(items[0]));
        return;
      }
      setStudentResults(items);
      if (items.length === 0) {
        setSearchError(
          'No students matched that name, PIN, or admission number.',
        );
      }
    } catch (err) {
      setSearchError(
        err instanceof ApiError ? err.message : 'Student search failed.',
      );
    } finally {
      setSearchingStudents(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Payments"
        description="Collect examination fees by student PIN and review payment activity."
      />

      <Card className="overflow-hidden">
        <CardBody className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
              Collection desk
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Find a student to collect fees
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Search by name, PIN, or admission number to open their fee desk.
            </p>
          </div>
          <form
            onSubmit={(e) => void onQuickSearch(e)}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <SoftSearchField
              className="flex-1"
              value={searchRoll}
              onChange={(e) => setSearchRoll(e.target.value)}
              placeholder="Name / PIN / admission — e.g. 236T1A0501 or Ganesh"
              aria-label="Student name, PIN, or admission number"
              autoComplete="off"
            />
            <Button
              type="submit"
              disabled={!searchRoll.trim()}
              loading={searchingStudents}
            >
              Search student
            </Button>
          </form>

          {searchError ? <Alert tone="warning">{searchError}</Alert> : null}

          {studentResults && studentResults.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-4 py-2.5 font-semibold">Student</th>
                    <th className="px-4 py-2.5 font-semibold">PIN / Adm. no.</th>
                    <th className="px-4 py-2.5 font-semibold">Programme</th>
                    <th className="px-4 py-2.5 font-semibold">Year / Sem</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {studentResults.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-t border-[var(--border)] transition hover:bg-[var(--primary-soft)]/50"
                      onClick={() => openCollect(studentRoll(s))}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {s.studentName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {s.pinNo || '—'}
                        <span className="block text-[var(--muted)]">
                          {s.admissionNumber || ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.course || '—'} / {s.branch || '—'}
                        <span className="block text-[var(--muted)]">
                          {s.college || ''} · {s.batch || ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        Y{s.currentYear} / S{s.currentSemester}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {s.studentStatus || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCollect(studentRoll(s));
                          }}
                        >
                          Open fee desk
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        <KpiTile
          label="Outstanding"
          value={money(summary.pendingAmount)}
          hint={`${summary.pendingCount} record${summary.pendingCount !== 1 ? 's' : ''}`}
          tone="warning"
        />
        <KpiTile
          label="Collected"
          value={money(summary.paidAmount)}
          hint={`${summary.paidCount} record${summary.paidCount !== 1 ? 's' : ''}`}
          tone="success"
        />
      </section>

      <Card>
        <CardHeader
          title="Payment ledger"
          description={
            loading
              ? 'Loading…'
              : `${visibleRecords.length} ${statusTab === 'all' ? '' : `${statusTab} `}record${visibleRecords.length !== 1 ? 's' : ''}`
          }
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusFilter
                items={statusTabs}
                value={statusTab}
                onChange={setStatusTab}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadRecords()}
                disabled={loading}
              >
                Refresh
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-4 !pt-0">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          {loading ? (
            <LoadingBlock label="Loading fee records…" />
          ) : visibleRecords.length === 0 ? (
            <EmptyState
              title={
                records.length === 0
                  ? 'No payment activity yet'
                  : `No ${statusTab} fee records`
              }
              description={
                records.length === 0
                  ? 'Fee records are created when students submit examination applications. Use the collection desk above when a student provides their PIN.'
                  : `There are currently no fee records with ${statusTab} status.`
              }
            />
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-6 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Examination</th>
                    <th className="px-4 py-3 font-semibold">Base</th>
                    <th className="px-4 py-3 font-semibold">Late</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="cursor-pointer border-t border-[var(--border)] transition hover:bg-[var(--primary-soft)]/50"
                      onClick={() => openCollect(record.studentRollNumber)}
                    >
                      <td className="px-6 py-4 align-top">
                        <p className="font-semibold text-slate-900">
                          {record.studentName}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--muted)]">
                          {record.studentRollNumber}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <p className="font-medium text-slate-900">
                          {record.exam?.name ?? `Exam #${record.examId}`}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {record.exam
                            ? `${record.exam.college ? `${record.exam.college} · ` : ''}${record.exam.course} / ${record.exam.branch}`
                            : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top tabular-nums">
                        {money(record.baseFee)}
                      </td>
                      <td className="px-4 py-4 align-top tabular-nums">
                        {money(record.lateFee)}
                      </td>
                      <td className="px-4 py-4 align-top font-semibold tabular-nums">
                        {money(record.totalAmount)}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <FeeStatusBadge status={record.status} />
                      </td>
                      <td className="px-6 py-4 align-top text-right">
                        <Button
                          type="button"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCollect(record.studentRollNumber);
                          }}
                        >
                          Collect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
