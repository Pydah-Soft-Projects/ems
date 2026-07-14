'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExamFeeRecord, PaymentMethod } from '@/types/fee';
import { Button } from '@/components/ui/Button';
import { money } from '@/components/fees/money';
import {
  InlinePayPhase,
  phaseLabel,
  runInlineRazorpayPayment,
} from '@/lib/runInlineRazorpayPayment';
import { calcUpiConvenienceFee } from '@/lib/upiConvenienceFee';

type RazorpayInlinePayProps = {
  open: boolean;
  record: ExamFeeRecord | null;
  paymentMethod?: PaymentMethod;
  prefillName?: string;
  prefillContact?: string;
  prefillEmail?: string;
  onClose: () => void;
  onSuccess: (paymentId: number) => void;
};

export function RazorpayInlinePay({
  open,
  record,
  paymentMethod = 'upi',
  prefillName,
  prefillContact,
  prefillEmail,
  onClose,
  onSuccess,
}: RazorpayInlinePayProps) {
  const [phase, setPhase] = useState<InlinePayPhase>('idle');
  const [detail, setDetail] = useState('');
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  const reset = useCallback(() => {
    setPhase('idle');
    setDetail('');
    setRunning(false);
    startedRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const startPay = useCallback(async () => {
    if (!record || running) return;
    setRunning(true);
    setDetail('');
    try {
      const result = await runInlineRazorpayPayment(record.id, {
        paymentMethod,
        prefillName,
        prefillContact,
        prefillEmail,
        onPhase: (p, msg) => {
          setPhase(p);
          if (msg) setDetail(msg);
        },
      });
      onSuccess(result.paymentId);
    } catch {
      /* phase already set */
    } finally {
      setRunning(false);
    }
  }, [
    record,
    running,
    paymentMethod,
    prefillName,
    prefillContact,
    prefillEmail,
    onSuccess,
  ]);

  // Auto-open Razorpay popup when our dialog appears (once per open)
  useEffect(() => {
    if (open && record && phase === 'idle' && !running && !startedRef.current) {
      startedRef.current = true;
      void startPay();
    }
  }, [open, record, phase, running, startPay]);

  if (!open || !record) return null;

  const examTitle = record.exam?.name ?? `Exam #${record.examId}`;
  const split = calcUpiConvenienceFee(record.totalAmount, paymentMethod);
  const isTerminal =
    phase === 'success' ||
    phase === 'failed' ||
    phase === 'cancelled';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rzp-inline-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl">
        <div className="border-b border-[var(--border)] bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 text-white">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-100">
            Secure online payment
          </p>
          <h2 id="rzp-inline-title" className="text-lg font-bold">
            Pay examination fee
          </h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-900">{examTitle}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {record.studentName} · {record.studentRollNumber}
            </p>
            {split.applies ? (
              <div className="mt-3 space-y-1 text-sm tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-600">Exam fee</span>
                  <span>{money(split.base)}</span>
                </div>
                <div className="flex justify-between text-amber-800">
                  <span>Convenience fee (2.2%)</span>
                  <span>{money(split.convenienceFee)}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-slate-900">
                  <span>Total payable</span>
                  <span>{money(split.total)}</span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                {money(record.totalAmount)}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <StatusIcon phase={phase} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {phaseLabel(phase)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {detail ||
                  (phase === 'awaiting_payment'
                    ? 'A Razorpay popup is open on this page. Complete UPI / card / netbanking there.'
                    : 'Everything happens on this page — no redirect.')}
              </p>
            </div>
          </div>

          {phase === 'awaiting_payment' && (
            <p className="text-center text-xs text-[var(--muted)]">
              Do not close this tab until payment finishes.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {(phase === 'failed' || phase === 'cancelled') && (
              <Button
                type="button"
                onClick={() => {
                  startedRef.current = false;
                  setPhase('idle');
                  void startPay();
                }}
                fullWidth
              >
                Try again
              </Button>
            )}
            {!running || isTerminal ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                fullWidth={phase !== 'failed' && phase !== 'cancelled'}
              >
                {phase === 'success' ? 'Close' : 'Cancel'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ phase }: { phase: InlinePayPhase }) {
  if (phase === 'success') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        ✓
      </span>
    );
  }
  if (phase === 'failed' || phase === 'cancelled') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
        !
      </span>
    );
  }
  if (phase !== 'idle') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
      ₹
    </span>
  );
}
