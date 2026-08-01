'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExamFeeRecord } from '@/types/fee';
import { CanaraOrder } from '@/types/canara';
import { Button } from '@/components/ui/Button';
import { money } from '@/components/fees/money';
import { ApiError, api } from '@/lib/api';

type CanaraPayProps = {
  open: boolean;
  record: ExamFeeRecord | null;
  onClose: () => void;
  onPaid: (paymentId: number) => void;
  variant?: 'panel' | 'overlay';
};

export function CanaraDynamicQrPanel({
  open,
  record,
  onClose,
  onPaid,
  variant = 'panel',
}: CanaraPayProps) {
  const [order, setOrder] = useState<CanaraOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [testRecorded, setTestRecorded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const markPaid = useCallback(
    (paymentId: number) => {
      setPaid(true);
      stopPoll();
      onPaid(paymentId);
    },
    [onPaid, stopPoll],
  );

  const checkStatus = useCallback(
    async (paymentId: number, silent = false) => {
      if (!silent) setChecking(true);
      try {
        const result = await api.checkCanaraPaymentStatus(paymentId);
        if (result.paid && result.settled !== false) {
          markPaid(paymentId);
          setOrder((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'success',
                  temporary: false,
                  receiptNumber: result.payment.receiptNumber,
                }
              : prev,
          );
        } else if (result.bankReceived && result.testMode) {
          setTestRecorded(true);
          stopPoll();
        }
        return result;
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to check payment status.',
          );
        }
        return null;
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [markPaid, stopPoll],
  );

  const loadOrder = useCallback(async () => {
    if (!record || paid) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.createCanaraOrder(record.id);
      setOrder(data);
      if (data.status === 'success') {
        markPaid(data.paymentId);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to create Canara Dynamic QR order.',
      );
    } finally {
      setLoading(false);
    }
  }, [record, paid, markPaid]);

  useEffect(() => {
    if (open && record && !paid) {
      void loadOrder();
    }
    if (!open) {
      stopPoll();
      setOrder(null);
      setPaid(false);
      setTestRecorded(false);
      setError('');
    }
    return () => stopPoll();
  }, [open, record, loadOrder, paid, stopPoll]);

  useEffect(() => {
    if (!open || !order || paid || testRecorded || order.status === 'success')
      return;
    stopPoll();
    const ms = order.pollIntervalMs || 5000;
    pollRef.current = setInterval(() => {
      void checkStatus(order.paymentId, true);
    }, ms);
    return () => stopPoll();
  }, [open, order, paid, testRecorded, checkStatus, stopPoll]);

  if (!open || !record) return null;

  const testMode = Boolean(order?.testMode || order?.mockMode);

  const body = (
    <div
      className={
        variant === 'overlay'
          ? 'w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl'
          : 'overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]'
      }
      role="region"
      aria-label="Canara Dynamic QR payment"
    >
      <div className="border-b border-[var(--border)] bg-slate-50 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
          Canara Bank · Dynamic QR
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-900">
          {paid
            ? 'Payment successful'
            : testRecorded
              ? 'Bank payment recorded (test)'
              : 'Scan to pay'}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {record.studentName} · {record.studentRollNumber}
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        {error ? (
          <div className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-600">Generating Dynamic QR…</p>
        ) : null}

        {order && !paid && !testRecorded ? (
          <>
            <div className="flex flex-col items-center gap-3">
              {order.qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={order.qrDataUrl}
                  alt="UPI Dynamic QR"
                  className="h-56 w-56 rounded-lg border border-slate-200 bg-white p-2"
                />
              ) : null}
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {money(order.amount)}
              </p>
              <p className="text-xs text-slate-500">
                Ref: {order.extTransactionId}
              </p>
              {testMode ? (
                <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Test mode — real bank QR; fee dues will NOT be marked paid
                </p>
              ) : (
                <p className="text-center text-xs text-slate-600">
                  Waiting for bank confirmation… keep this screen open
                </p>
              )}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
              {order.instructions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={checking}
                onClick={() => void checkStatus(order.paymentId)}
              >
                {checking ? 'Checking…' : 'Check status'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : null}

        {testRecorded && order ? (
          <div className="space-y-3">
            <div className="rounded-[var(--radius)] bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Bank reported success, but <strong>test mode</strong> is on — fee
              dues were <strong>not</strong> updated. Turn off test mode in
              Settings when you want live settlement.
            </div>
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : null}

        {paid && order ? (
          <div className="space-y-3">
            <div className="rounded-[var(--radius)] bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Payment received. Receipt{' '}
              <span className="font-semibold">{order.receiptNumber}</span>
            </div>
            <Button type="button" onClick={onClose}>
              Done
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
