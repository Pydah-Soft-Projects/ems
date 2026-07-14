'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import { FeeStatusBadge, money } from '@/components/fees/CollectPaymentModal';
import { ExamFeeRecord } from '@/types/fee';

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
  const [filter, setFilter] = useState('');
  const [searchRoll, setSearchRoll] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getFeeRecords(
        statusTab === 'all' ? {} : { status: statusTab },
      );
      setRecords(data);
    } catch (err) {
      setRecords([]);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load fee records.',
      );
    } finally {
      setLoading(false);
    }
  }, [statusTab]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const examName = r.exam?.name?.toLowerCase() ?? '';
      const scope = [
        r.exam?.college,
        r.exam?.course,
        r.exam?.branch,
        r.exam?.batch,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.studentRollNumber.toLowerCase().includes(q) ||
        examName.includes(q) ||
        scope.includes(q)
      );
    });
  }, [records, filter]);

  function openCollect(roll: string) {
    router.push(`/dashboard/fees/collect/${encodeURIComponent(roll)}`);
  }

  function onQuickSearch(e: React.FormEvent) {
    e.preventDefault();
    const roll = searchRoll.trim();
    if (!roll) return;
    openCollect(roll);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Payments"
        description="Select a student to open the fee collection desk, or search by PIN / roll."
      />

      <Card>
        <CardBody>
          <form
            onSubmit={onQuickSearch}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Input
                label="Open collection by PIN / roll"
                value={searchRoll}
                onChange={(e) => setSearchRoll(e.target.value)}
                placeholder="Search Name, Adm No, PIN…"
              />
            </div>
            <Button type="submit" className="sm:mb-0.5">
              Open desk
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusTab(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              statusTab === tab.id
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Fee records"
          description={
            loading
              ? 'Loading…'
              : `${filtered.length} student fee record${filtered.length !== 1 ? 's' : ''}`
          }
          action={
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => void loadRecords()}
              disabled={loading}
            >
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <Input
            label="Filter list"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Roll, name, exam, college…"
          />

          {error && (
            <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading fee records…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No fee records yet. Publish an examination with eligible students
              to generate fees.
            </p>
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-y border-[var(--border)] bg-slate-50/80 text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th className="px-6 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Examination</th>
                    <th className="px-4 py-3 font-semibold">Base</th>
                    <th className="px-4 py-3 font-semibold">Late</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record) => (
                    <tr
                      key={record.id}
                      className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-blue-50/40"
                      onClick={() => openCollect(record.studentRollNumber)}
                    >
                      <td className="px-6 py-3.5 align-top">
                        <p className="font-medium text-slate-900">
                          {record.studentName}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--muted)]">
                          {record.studentRollNumber}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-slate-900">
                          {record.exam?.name ?? `Exam #${record.examId}`}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--muted)]">
                          {record.exam
                            ? `${record.exam.college ? `${record.exam.college} · ` : ''}${record.exam.course} / ${record.exam.branch}`
                            : '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top tabular-nums">
                        {money(record.baseFee)}
                      </td>
                      <td className="px-4 py-3.5 align-top tabular-nums">
                        {money(record.lateFee)}
                      </td>
                      <td className="px-4 py-3.5 align-top font-semibold tabular-nums">
                        {money(record.totalAmount)}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <FeeStatusBadge status={record.status} />
                      </td>
                      <td className="px-6 py-3.5 align-top text-right">
                        <Button
                          type="button"
                          className="!px-3 !py-1.5 text-xs"
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
