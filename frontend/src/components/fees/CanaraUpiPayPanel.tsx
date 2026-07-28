'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExamFeeRecord } from '@/types/fee';
import { CanaraUpiOrder } from '@/types/canara-upi';
import { Button } from '@/components/ui/Button';
import { money } from '@/components/fees/money';
import { ApiError, api } from '@/lib/api';

type CanaraUpiPayProps = {
  open: boolean;
  record: ExamFeeRecord | null;
  onClose: () => void;
  onPaid: (paymentId: number) => void;
  variant?: 'panel' | 'overlay';
};

const POLL_MS = 3000;
const SYNC_EVERY_N = 2; // every ~6s call bank status sync

export function CanaraUpiPayPanel({
  open,
  record,
  onClose,
  onPaid,
  variant = 'panel',
}: CanaraUpiPayProps) {
  const [order, setOrder] = useState<CanaraUpiOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<
    'idle' | 'waiting' | 'success' | 'failed'
  >('idle');
  const [receiptNumber, setReceiptNumber] = useState('');
  const pollCount = useRef(0);
  const paidNotified = useRef(false);

  const finishSuccess = useCallback(
    (paymentId: number, receipt?: string) => {
      setPhase('success');
      if (receipt) setReceiptNumber(receipt);
      if (!paidNotified.current) {
        paidNotified.current = true;
        onPaid(paymentId);
      }
    },
    [onPaid],
  );

  const loadOrder = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    setError('');
    setPhase('idle');
    paidNotified.current = false;
    pollCount.current = 0;
    try {
      const data = await api.createCanaraUpiOrder(record.id);
      setOrder(data);
      if (data.status === 'success') {
        finishSuccess(data.paymentId, data.receiptNumber);
      } else {
        setPhase('waiting');
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to create Canara Bank UPI QR.',
      );
      setPhase('failed');
    } finally {
      setLoading(false);
    }
  }, [record, finishSuccess]);

  useEffect(() => {
    if (open && record) {
      void loadOrder();
    }
    if (!open) {
      setOrder(null);
      setError('');
      setPhase('idle');
      setReceiptNumber('');
      paidNotified.current = false;
    }
  }, [open, record, loadOrder]);

  useEffect(() => {
    if (!open || !order || phase !== 'waiting') return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled || !order) return;
      pollCount.current += 1;
      try {
        if (pollCount.current % SYNC_EVERY_N === 0) {
          const sync = await api.syncCanaraUpiPayment(order.paymentId);
          if (sync.status === 'success') {
            const st = await api.getPaymentStatus(order.paymentId);
            finishSuccess(order.paymentId, st.receiptNumber);
            return;
          }
          if (sync.status === 'failed') {
            setPhase('failed');
            setError('Payment failed at the bank. Generate a new QR to retry.');
            return;
          }
        } else {
          const st = await api.getPaymentStatus(order.paymentId);
          if (st.status === 'success') {
            finishSuccess(order.paymentId, st.receiptNumber);
            return;
          }
          if (st.status === 'failed') {
            setPhase('failed');
            setError('Payment failed. Generate a new QR to retry.');
            return;
          }
        }
      } catch {
        // keep waiting — network blips should not kill the session
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, order, phase, finishSuccess]);

  async function onManualSync() {
    if (!order) return;
    setError('');
    try {
      const sync = await api.syncCanaraUpiPayment(order.paymentId);
      if (sync.status === 'success') {
        const st = await api.getPaymentStatus(order.paymentId);
        finishSuccess(order.paymentId, st.receiptNumber);
      } else if (sync.status === 'failed') {
        setPhase('failed');
        setError('Payment failed at the bank.');
      } else {
        setError('Bank has not confirmed yet — keep this page open.');
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not refresh status.',
      );
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
      aria-label="Canara Bank UPI payment"
    >
      <div className="border-b border-[var(--border)] bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Canara Bank · Dynamic UPI
        </p>
        <h2 className="text-lg font-bold text-slate-900">Pay via bank QR</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Exact fee amount. Confirmed live by Canara Bank (no statement wait).
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Generating bank QR…</p>
        ) : null}

        {error && phase !== 'success' ? (
          <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {phase === 'success' ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-950">
              Payment successful
            </p>
            <p className="text-xs text-emerald-900">
              Canara Bank confirmed this UPI payment. Your fee is marked paid.
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs text-slate-800">
              <div>
                <dt className="text-[var(--muted)]">Amount</dt>
                <dd className="font-semibold tabular-nums">
                  {money(order?.amount ?? record.totalAmount)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Txn ref</dt>
                <dd className="font-mono font-semibold">
                  {order?.extTransactionId}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[var(--muted)]">Receipt</dt>
                <dd className="font-mono">
                  {receiptNumber || order?.receiptNumber}
                </dd>
              </div>
            </dl>
            <Button type="button" onClick={onClose} fullWidth>
              Done
            </Button>
          </div>
        ) : null}

        {order && phase === 'waiting' ? (
          <>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={order.qrDataUrl}
                alt={`Canara UPI QR ${order.extTransactionId}`}
                className="h-52 w-52 rounded-lg border border-[var(--border)] bg-white p-2"
              />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {money(order.amount)}
                </p>
                <p>
                  <span className="text-[var(--muted)]">Merchant</span>
                  <br />
                  <span className="font-medium">
                    {order.merchantName || 'College'}
                  </span>
                </p>
                <p>
                  <span className="text-[var(--muted)]">UPI ID</span>
                  <br />
                  <span className="font-mono text-sm">
                    {order.merchantUpiId}
                  </span>
                </p>
                <p>
                  <span className="text-[var(--muted)]">Transaction ID</span>
                  <br />
                  <span className="font-mono font-semibold">
                    {order.extTransactionId}
                  </span>
                </p>
                {order.upiUrl ? (
                  <a
                    href={order.upiUrl}
                    className="inline-flex text-sm font-medium text-[var(--primary)] hover:underline"
                  >
                    Open in UPI app
                  </a>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs text-sky-950">
              Waiting for Canara Bank confirmation… This updates automatically.
            </div>

            <ul className="list-inside list-disc space-y-1 text-xs text-[var(--muted)]">
              {(order.instructions || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onManualSync()}
                fullWidth
              >
                Refresh status
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} fullWidth>
                Close
              </Button>
            </div>
          </>
        ) : null}

        {phase === 'failed' && !loading ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => void loadOrder()} fullWidth>
              Generate new QR
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} fullWidth>
              Close
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        {body}
      </div>
    );
  }

  return body;
}
