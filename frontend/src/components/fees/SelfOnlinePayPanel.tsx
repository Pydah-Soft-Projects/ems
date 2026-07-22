'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExamFeeRecord } from '@/types/fee';
import { SelfOnlineOrder } from '@/types/self-online';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { money } from '@/components/fees/money';
import { ApiError, api } from '@/lib/api';

type SelfOnlinePayProps = {
  open: boolean;
  record: ExamFeeRecord | null;
  onClose: () => void;
  onClaimed: (paymentId: number) => void;
  /** panel = inline (student). overlay = desk modal. */
  variant?: 'panel' | 'overlay';
};

export function SelfOnlinePayPanel({
  open,
  record,
  onClose,
  onClaimed,
  variant = 'panel',
}: SelfOnlinePayProps) {
  const [order, setOrder] = useState<SelfOnlineOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [utr, setUtr] = useState('');
  const [ack, setAck] = useState<{
    title: string;
    message: string;
    receiptNumber: string;
    orderRef: string;
    amount: number;
  } | null>(null);

  const loadOrder = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    setError('');
    setAck(null);
    try {
      const data = await api.createSelfOnlineOrder(record.id);
      setOrder(data);
      if (data.status === 'awaiting_verification') {
        setAck({
          title: 'Awaiting verification',
          message:
            'You already marked this payment. Accounts will confirm against the merchant statement.',
          receiptNumber: data.receiptNumber,
          orderRef: data.orderRef,
          amount: data.amount,
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to create Self Online payment order.',
      );
    } finally {
      setLoading(false);
    }
  }, [record]);

  useEffect(() => {
    if (open && record) {
      void loadOrder();
    }
    if (!open) {
      setOrder(null);
      setAck(null);
      setUtr('');
      setError('');
    }
  }, [open, record, loadOrder]);

  async function onClaim() {
    if (!order) return;
    setClaiming(true);
    setError('');
    try {
      const result = await api.claimSelfOnlinePayment(
        order.paymentId,
        utr.trim() || undefined,
      );
      setAck({
        title: result.acknowledgement.title,
        message: result.acknowledgement.message,
        receiptNumber: result.acknowledgement.receiptNumber,
        orderRef: result.acknowledgement.orderRef,
        amount: result.acknowledgement.amount,
      });
      onClaimed(order.paymentId);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to confirm payment claim.',
      );
    } finally {
      setClaiming(false);
    }
  }

  if (!open || !record) return null;

  const body = (
    <div
      className={
        variant === 'overlay'
          ? 'w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl'
          : 'overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]'
      }
      role="region"
      aria-label="Self Online UPI payment"
    >
      <div className="border-b border-[var(--border)] bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Self Online · College UPI
        </p>
        <h2 className="text-lg font-bold text-slate-900">Pay via UPI QR</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          No gateway fee. Official receipt after Accounts verifies the merchant
          statement.
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Generating QR…</p>
        ) : null}

        {error ? (
          <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {ack ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">{ack.title}</p>
            <p className="text-xs text-amber-900">{ack.message}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs text-slate-800">
              <div>
                <dt className="text-[var(--muted)]">Order ID</dt>
                <dd className="font-mono font-semibold">{ack.orderRef}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Amount</dt>
                <dd className="font-semibold tabular-nums">{money(ack.amount)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[var(--muted)]">Temp acknowledgement</dt>
                <dd className="font-mono">{ack.receiptNumber}</dd>
              </div>
            </dl>
            <Button type="button" variant="secondary" onClick={onClose} fullWidth>
              Close
            </Button>
          </div>
        ) : null}

        {order && !ack ? (
          <>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.qrDataUrl}
                alt={`UPI QR for ${order.orderRef}`}
                className="h-52 w-52 rounded-lg border border-[var(--border)] bg-white p-2"
              />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {money(order.amount)}
                </p>
                <p>
                  <span className="text-[var(--muted)]">Merchant</span>
                  <br />
                  <span className="font-medium">{order.merchantName}</span>
                </p>
                <p>
                  <span className="text-[var(--muted)]">UPI ID</span>
                  <br />
                  <span className="font-mono text-sm">{order.merchantUpiId}</span>
                </p>
                <p>
                  <span className="text-[var(--muted)]">Transaction ID</span>
                  <br />
                  <span className="font-mono font-semibold">{order.orderRef}</span>
                </p>
                <a
                  href={order.upiUrl}
                  className="inline-flex text-sm font-medium text-[var(--primary)] hover:underline"
                >
                  Open in UPI app
                </a>
              </div>
            </div>

            <ul className="list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
              {order.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <Input
              label="UTR / UPI reference (optional)"
              value={utr}
              onChange={(e) => setUtr(e.target.value)}
              placeholder="Enter after paying — helps faster verification"
              autoComplete="off"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void onClaim()}
                disabled={claiming}
                fullWidth
              >
                {claiming ? 'Saving…' : 'I have paid'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} fullWidth>
                Cancel
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        {body}
      </div>
    );
  }

  return <div className="mt-4">{body}</div>;
}
