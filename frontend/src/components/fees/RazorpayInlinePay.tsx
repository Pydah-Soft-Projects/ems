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

type RazorpayInlinePayProps = {
  open: boolean;
  record: ExamFeeRecord | null;
  paymentMethod?: PaymentMethod;
  prefillName?: string;
  prefillContact?: string;
  prefillEmail?: string;
  onClose: () => void;
  onSuccess: (paymentId: number) => void;
  /** panel = on-page (preferred). overlay = legacy full-screen status card. */
  variant?: 'panel' | 'overlay';
  /** When true with panel, auto-start checkout when open becomes true. */
  autoStart?: boolean;
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
  variant = 'panel',
  autoStart = true,
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

  useEffect(() => {
    if (
      autoStart &&
      open &&
      record &&
      phase === 'idle' &&
      !running &&
      !startedRef.current
    ) {
      startedRef.current = true;
      void startPay();
    }
  }, [autoStart, open, record, phase, running, startPay]);

  if (!open || !record) return null;

  const examTitle = record.exam?.name ?? `Exam #${record.examId}`;
  const isTerminal =
    phase === 'success' || phase === 'failed' || phase === 'cancelled';

  const body = (
    <div
      className={
        variant === 'overlay'
          ? 'w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-2xl'
          : 'overflow-hidden rounded-[var(--radius-lg)] border border-[var(--info-border)] bg-white shadow-[var(--shadow-sm)]'
      }
    >
      <div className="border-b border-[var(--border)] bg-[var(--primary-soft)] px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
          UPI Online Payment
        </p>
        <h2 id="rzp-inline-title" className="text-lg font-bold text-slate-900">
          Pay examination fee
        </h2>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="rounded-xl border border-[var(--border)] bg-slate-50 p-4 text-sm">
          <p className="font-semibold text-slate-900">{examTitle}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {record.studentName} · {record.studentRollNumber}
          </p>
          <div className="mt-3 flex items-baseline justify-between border-t border-[var(--border)] pt-3">
            <span className="text-sm font-medium text-slate-600">Total payable</span>
            <span className="text-2xl font-bold tabular-nums text-slate-900">
              {money(record.totalAmount)}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[var(--info-border)] bg-[var(--info-soft)] px-4 py-3">
          <StatusIcon phase={phase} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {phaseLabel(phase)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {detail ||
                (phase === 'awaiting_payment'
                  ? 'Complete payment in the UPI modal. Stay on this page.'
                  : 'UPI checkout opens on this page — no redirect away from EMS.')}
            </p>
          </div>
        </div>

        {phase === 'awaiting_payment' ? (
          <p className="text-center text-xs text-[var(--muted)]">
            Do not close this tab until payment finishes.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {phase === 'failed' || phase === 'cancelled' ? (
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
          ) : null}
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
  );

  if (variant === 'overlay') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rzp-inline-title"
      >
        {body}
      </div>
    );
  }

  return (
    <div
      className="mt-6"
      role="region"
      aria-label="UPI online payment checkout"
    >
      {body}
    </div>
  );
}

function StatusIcon({ phase }: { phase: InlinePayPhase }) {
  if (phase === 'success') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--success-soft)] text-emerald-600">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (phase === 'failed' || phase === 'cancelled') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)] text-rose-600">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
    </span>
  );
}
