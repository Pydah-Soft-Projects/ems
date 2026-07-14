'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import {
  ExamFeeRecord,
  OfflinePaymentInput,
  PaymentMethod,
  PaymentResult,
} from '@/types/fee';
import { getStoredUser } from '@/lib/auth';

function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

const OFFLINE_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

interface CollectPaymentModalProps {
  open: boolean;
  record: ExamFeeRecord | null;
  onClose: () => void;
  onSubmit: (data: OfflinePaymentInput) => Promise<PaymentResult>;
}

export function CollectPaymentModal({
  open,
  record,
  onClose,
  onSubmit,
}: CollectPaymentModalProps) {
  const user = getStoredUser();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const collectedBy = user?.fullName || user?.username || '';
  const [bankName, setBankName] = useState('');
  const [transactionNumber, setTransactionNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PaymentResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod('cash');
    setBankName('');
    setTransactionNumber('');
    setRemarks('');
    setError('');
    setReceipt(null);
  }, [open, record?.id]);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!record) return;
    if (!collectedBy.trim()) {
      setError('Collector name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await onSubmit({
        feeRecordId: record.id,
        paymentMethod,
        collectedBy: collectedBy.trim(),
        bankName: bankName.trim() || undefined,
        transactionNumber: transactionNumber.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });
      setReceipt(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setSaving(false);
    }
  }

  if (!record) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={receipt ? 'Payment successful' : 'Collect fee'}
      description={
        receipt
          ? 'Transaction recorded. Share the receipt number with the student.'
          : `${record.studentName} · ${record.studentRollNumber}`
      }
      size="lg"
    >
      {receipt ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Receipt <strong>{receipt.payment.receiptNumber}</strong> — paid{' '}
            {money(receipt.payment.amountPaid)}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Mode</dt>
              <dd className="font-medium capitalize">
                {receipt.payment.paymentMode} / {receipt.payment.paymentMethod}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Collected by</dt>
              <dd className="font-medium">
                {receipt.payment.collectedBy}
                {receipt.payment.collectorUsername
                  ? ` (${receipt.payment.collectorUsername})`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Exam</dt>
              <dd className="font-medium">
                {receipt.feeRecord.exam?.name ??
                  `Exam #${receipt.feeRecord.examId}`}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Paid at</dt>
              <dd className="font-medium">
                {new Date(receipt.payment.paidAt).toLocaleString()}
              </dd>
            </div>
          </dl>
          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-slate-50 px-4 py-3 text-sm">
            <p className="font-medium text-slate-900">
              {record.exam?.name ?? `Exam #${record.examId}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[var(--muted)]">
              <span>Base {money(record.baseFee)}</span>
              <span>Late {money(record.lateFee)}</span>
              <span className="font-semibold text-slate-900">
                Total {money(record.totalAmount)}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Payment method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethod)
              }
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              required
            >
              {OFFLINE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Collected by"
            value={collectedBy}
            readOnly
            tabIndex={-1}
            className="cursor-default bg-slate-50"
          />
          <p className="-mt-3 text-[11px] text-[var(--muted)]">
            Locked to your signed-in account
          </p>

          {paymentMethod === 'bank_transfer' && (
            <>
              <Input
                label="Bank name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Optional"
              />
              <Input
                label="Transaction / UTR number"
                value={transactionNumber}
                onChange={(e) => setTransactionNumber(e.target.value)}
                placeholder="Optional"
              />
            </>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Optional notes"
            />
          </div>

          {error && (
            <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? 'Recording...'
                : `Collect ${money(record.totalAmount)}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function FeeStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'paid' ? 'success' : 'warning'}>
      {status}
    </Badge>
  );
}

export { money };
