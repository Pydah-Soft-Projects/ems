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

export default function StudentReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = use(params);
  const user = getStoredUser();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getStudentPayment(parseInt(paymentId, 10))
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
        <Link href="/student" className="text-sm text-[var(--primary)]">
          ← Back
        </Link>
      </div>
    );
  }

  const collegeName = payment.feeRecord?.exam?.college || undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/student"
            className="text-xs font-medium text-[var(--primary)]"
          >
            ← My fees
          </Link>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Fee receipt</h1>
          <p className="text-sm text-[var(--muted)]">
            Print = Student copy on A4 top half · {payment.receiptNumber}
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            printA5Receipt(payment, {
              collegeName,
              signatoryName: user?.fullName,
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
            signatoryName={user?.fullName}
            collegeName={collegeName}
          />
        </div>
      </div>
    </div>
  );
}
