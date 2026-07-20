'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import {
  BILL_TYPE_LABELS,
  RemunerationBill,
  RemunerationBillStatus,
  RemunerationBillType,
} from '@/types/remuneration';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/Spinner';
import { SoftSearchField, StatusFilter, KpiTile } from '@/components/ui/SoftSearch';
import { Money, StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';

type StatusTab = 'all' | RemunerationBillStatus;
type TypeTab = 'all' | RemunerationBillType;

const statusTabs: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'passed', label: 'Passed' },
  { id: 'paid', label: 'Paid' },
];

const typeTabs: { id: TypeTab; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'qp_setting', label: 'QP Setting' },
  { id: 'lab_project', label: 'Lab / Project' },
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'observer', label: 'Observer' },
  { id: 'examiner', label: 'Examiner' },
];

export default function RemunerationPage() {
  const router = useRouter();
  const toast = useToast();
  const [bills, setBills] = useState<RemunerationBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [typeTab, setTypeTab] = useState<TypeTab>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setBills(
        await api.getRemunerationBills({
          search: search.trim() || undefined,
          status: statusTab === 'all' ? undefined : statusTab,
          billType: typeTab === 'all' ? undefined : typeTab,
        }),
      );
    } catch (err) {
      setBills([]);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load remuneration bills.',
      );
    } finally {
      setLoading(false);
    }
  }, [search, statusTab, typeTab]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const amount = bills.reduce(
      (sum, b) => sum + Number(b.grandTotalAmount || 0),
      0,
    );
    return {
      count: bills.length,
      amount,
      draft: bills.filter((b) => b.status === 'draft').length,
      submitted: bills.filter((b) => b.status === 'submitted').length,
    };
  }, [bills]);

  async function handleSimulate() {
    setSimulating(true);
    setError('');
    try {
      const result = await api.simulateRemuneration();
      toast.push(
        `Seeded ${result.bills.length} bills + ${result.professionals.length} professionals for “${result.exam.name}”.`,
        'success',
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Simulation failed. Publish an exam first.',
      );
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remuneration bills"
        description="Create remuneration bills for external paper setters, evaluators, lab examiners, and observers. Professionals are saved for auto-fill on the next bill."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={simulating}
              onClick={() => void handleSimulate()}
            >
              Simulate sample bills
            </Button>
            <Button onClick={() => router.push('/dashboard/remuneration/new')}>
              New bill
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Bills shown" value={String(summary.count)} />
        <KpiTile
          label="Total amount"
          value={`₹${summary.amount.toLocaleString('en-IN')}`}
        />
        <KpiTile label="Draft" value={String(summary.draft)} />
        <KpiTile label="Submitted" value={String(summary.submitted)} />
      </div>

      <Card>
        <CardHeader
          title="Bills"
          description="Filter by status / type, or search by professional, bill number, or exam."
          action={
            <Link
              href="/dashboard/professionals"
              className="text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              Manage professionals →
            </Link>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <StatusFilter
              items={statusTabs}
              value={statusTab}
              onChange={setStatusTab}
            />
            <SoftSearchField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, bill no, exam…"
            />
          </div>
          <StatusFilter
            items={typeTabs}
            value={typeTab}
            onChange={setTypeTab}
          />

          {loading ? (
            <LoadingBlock label="Loading bills…" />
          ) : bills.length === 0 ? (
            <EmptyState
              title="No remuneration bills yet"
              description="Create a bill for a published exam, or click “Simulate sample bills” to seed demo data against the current exam."
              action={
                <Button onClick={() => router.push('/dashboard/remuneration/new')}>
                  Create first bill
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-[var(--border)] text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Bill</th>
                    <th className="px-3 py-2.5 font-semibold">Professional</th>
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Exam / Branch</th>
                    <th className="px-3 py-2.5 font-semibold">Amount</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => (
                    <tr
                      key={bill.id}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-subtle)]"
                      onClick={() =>
                        router.push(`/dashboard/remuneration/${bill.id}`)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/dashboard/remuneration/${bill.id}`);
                        }
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900">
                          {bill.billNumber}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--muted)]">
                          {bill.billDate || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-900">
                          {bill.professionalName}
                        </div>
                        <div className="text-[0.6875rem] text-[var(--muted)]">
                          {bill.designation || bill.organization || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {BILL_TYPE_LABELS[bill.billType]}
                      </td>
                      <td className="px-3 py-3">
                        <div>{bill.examName || '—'}</div>
                        <div className="text-[0.6875rem] text-[var(--muted)]">
                          {[bill.branch, bill.course]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Money amount={bill.grandTotalAmount} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={bill.status} />
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
