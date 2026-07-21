'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import {
  BILL_STATUS_LABELS,
  BILL_TYPE_LABELS,
  RemunerationBill,
  RemunerationBillStatus,
} from '@/types/remuneration';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LoadingBlock } from '@/components/ui/Spinner';
import { Money, StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import {
  BillStatusActions,
  BillStatusTimeline,
} from '@/components/remuneration/BillStatusTimeline';

export default function RemunerationBillDetailPage() {
  const params = useParams<{ billId: string }>();
  const billId = Number(params.billId);
  const router = useRouter();
  const toast = useToast();

  const [bill, setBill] = useState<RemunerationBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    setError('');
    try {
      setBill(await api.getRemunerationBill(billId));
    } catch (err) {
      setBill(null);
      setError(
        err instanceof ApiError ? err.message : 'Failed to load bill.',
      );
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: RemunerationBillStatus) {
    if (!bill) return;
    setStatusBusy(true);
    try {
      const updated = await api.updateRemunerationBillStatus(bill.id, status);
      setBill(updated);
      toast.push(`Marked as ${BILL_STATUS_LABELS[status]}.`, 'success');
    } catch (err) {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to update status.',
        'danger',
      );
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleDelete() {
    if (!bill) return;
    setDeleting(true);
    try {
      await api.deleteRemunerationBill(bill.id);
      toast.push('Bill deleted.', 'success');
      router.push('/dashboard/remuneration');
    } catch (err) {
      toast.push(
        err instanceof ApiError ? err.message : 'Failed to delete bill.',
        'danger',
      );
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading bill…" />;
  }

  if (!bill) {
    return (
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button
          variant="secondary"
          onClick={() => router.push('/dashboard/remuneration')}
        >
          Back to remunerations
        </Button>
      </div>
    );
  }

  const isPaid = bill.status === 'paid';
  const subjects = bill.subjects || [];
  const lines = bill.lineItems || [];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#13294f] via-[#0d1b3d] to-[#081228] p-6 text-white shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={bill.status} />
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {BILL_TYPE_LABELS[bill.billType]}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {bill.billNumber}
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              {bill.professionalName}
              {bill.designation ? ` · ${bill.designation}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-300">
              {[bill.examName, bill.branch, bill.course]
                .filter(Boolean)
                .join(' · ') || 'No exam linked'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push('/dashboard/remuneration')}
            >
              Back
            </Button>
            {!isPaid ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    router.push(`/dashboard/remuneration/${bill.id}/edit`)
                  }
                >
                  Edit
                </Button>
                <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              Grand total
            </p>
            <p className="mt-1 text-xl font-bold">
              <Money amount={bill.grandTotalAmount} className="text-white" />
            </p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              Amount in words
            </p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {bill.amountInWords || '—'}
            </p>
          </div>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {isPaid ? (
        <Alert tone="info">
          This bill is marked paid — editing and deleting are disabled.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Bill details" />
          <CardBody className="space-y-5 text-xs">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[0.6875rem] uppercase text-[var(--muted)]">
                  Professional
                </dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {bill.professionalName}
                </dd>
                <dd className="text-[var(--muted)]">
                  {[bill.designation, bill.organization]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] uppercase text-[var(--muted)]">
                  Contact
                </dt>
                <dd className="mt-0.5">
                  {[bill.contactNumber, bill.email].filter(Boolean).join(' · ') ||
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] uppercase text-[var(--muted)]">
                  Examination
                </dt>
                <dd className="mt-0.5 font-semibold">{bill.examName || '—'}</dd>
                <dd className="text-[var(--muted)]">
                  {[
                    bill.regulationCode,
                    bill.course,
                    bill.branch,
                    bill.yearOfStudy != null ? `Y${bill.yearOfStudy}` : null,
                    bill.semester != null ? `S${bill.semester}` : null,
                    bill.academicYear,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt className="text-[0.6875rem] uppercase text-[var(--muted)]">
                  Bank
                </dt>
                <dd className="mt-0.5">
                  {bill.accountHolderName || '—'}
                  {bill.accountNumber ? ` · A/c ${bill.accountNumber}` : ''}
                </dd>
                <dd className="text-[var(--muted)]">
                  {[bill.bankName, bill.ifscCode, bill.bankAddress]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            </dl>

            {subjects.length > 0 ? (
              <div>
                <p className="mb-2 text-[0.6875rem] uppercase text-[var(--muted)]">
                  Subjects / papers
                </p>
                <ul className="flex flex-wrap gap-2">
                  {subjects.map((s, i) => (
                    <li
                      key={`${s.subjectId}-${i}`}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1 font-medium"
                    >
                      {s.name}
                      {s.code ? (
                        <span className="ml-1 text-[var(--muted)]">
                          ({s.code})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(bill.durationFrom || bill.durationTo || bill.numberOfDays) && (
              <p className="text-[var(--muted)]">
                Duration:{' '}
                {[bill.durationFrom, bill.durationTo]
                  .filter(Boolean)
                  .join(' → ')}
                {bill.numberOfDays != null
                  ? ` · ${bill.numberOfDays} day(s)`
                  : ''}
              </p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Update status"
              description="Advance the bill one step at a time."
            />
            <CardBody>
              <BillStatusActions
                status={bill.status}
                busy={statusBusy}
                onChange={(next) => void changeStatus(next)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Timeline"
              description="Who changed status, and when."
            />
            <CardBody>
              <BillStatusTimeline bill={bill} />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Remuneration lines" />
        <CardBody className="overflow-x-auto p-0">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[0.6875rem] uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Sl.</th>
                <th className="px-4 py-2.5 font-semibold">Remuneration for</th>
                <th className="px-4 py-2.5 font-semibold">Qty</th>
                <th className="px-4 py-2.5 font-semibold">Unit price</th>
                <th className="px-4 py-2.5 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((row, i) => (
                <tr
                  key={`${row.remunerationFor}-${i}`}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-2.5">{i + 1}</td>
                  <td className="px-4 py-2.5">{row.remunerationFor}</td>
                  <td className="px-4 py-2.5 tabular-nums">{row.quantity}</td>
                  <td className="px-4 py-2.5">
                    <Money amount={row.unitPrice} />
                  </td>
                  <td className="px-4 py-2.5 font-semibold">
                    <Money
                      amount={
                        row.amount ??
                        Number(row.quantity) * Number(row.unitPrice)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[var(--surface-subtle)] font-semibold">
                <td className="px-4 py-3" colSpan={2}>
                  Grand total
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {bill.grandTotalQuantity}
                </td>
                <td />
                <td className="px-4 py-3">
                  <Money amount={bill.grandTotalAmount} />
                </td>
              </tr>
            </tfoot>
          </table>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this bill?"
        description="This cannot be undone. Paid bills cannot be deleted."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
