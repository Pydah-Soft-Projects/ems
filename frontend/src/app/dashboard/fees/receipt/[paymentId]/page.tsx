'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Payment } from '@/types/fee';
import { FeeReceipt } from '@/components/fees/FeeReceipt';
import { Button } from '@/components/ui/Button';
import { getStoredUser } from '@/lib/auth';
import { printA5Receipt } from '@/lib/printA5Receipt';
import { buildReceiptVerificationUrl } from '@/lib/receiptVerification';

export default function FeeReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = use(params);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();

  useEffect(() => {
    api
      .getPayment(parseInt(paymentId, 10))
      .then(setPayment)
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : 'Failed to load receipt.',
        ),
      )
      .finally(() => setLoading(false));
  }, [paymentId]);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading receipt…</p>;
  }

  if (error || !payment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--danger)]">{error || 'Not found'}</p>
        <Link href="/dashboard/fees" className="text-sm text-[var(--primary)]">
          ← Back
        </Link>
      </div>
    );
  }

  const roll = payment.feeRecord?.studentRollNumber;
  const collegeName = payment.feeRecord?.exam?.college || undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={
              roll
                ? `/dashboard/fees/collect/${encodeURIComponent(roll)}`
                : '/dashboard/fees'
            }
            className="text-xs font-medium text-[var(--primary)]"
          >
            ← Back to collection
          </Link>
          {payment.feeRecord?.examId ? (
            <Link
              href={`/dashboard/exams/${payment.feeRecord.examId}?tab=hall-tickets`}
              className="mt-2 block text-xs font-medium text-[var(--primary)]"
            >
              ← Back to hall tickets
            </Link>
          ) : null}
          <h1 className="mt-1 text-xl font-bold text-slate-900">Fee receipt</h1>
          <p className="text-sm text-[var(--muted)]">
            Print = Student copy on top half of A4 (A5 landscape size) ·{' '}
            {payment.receiptNumber}
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            printA5Receipt(payment, {
              collegeName,
              signatoryName:
                user?.fullName || payment.collectedBy || undefined,
              verificationUrl: buildReceiptVerificationUrl(payment),
            })
          }
        >
          Print receipt
        </Button>
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--border)] bg-slate-100 p-4">
        <div className="mx-auto w-[210mm] max-w-full">
          <FeeReceipt
            payment={payment}
            signatoryName={user?.fullName || payment.collectedBy || undefined}
            collegeName={collegeName}
          />
        </div>
      </div>
    </div>
  );
}
