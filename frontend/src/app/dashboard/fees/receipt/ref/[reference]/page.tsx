'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Payment } from '@/types/fee';
import { FeeReceipt } from '@/components/fees/FeeReceipt';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Spinner';
import { getStoredUser } from '@/lib/auth';
import { printA5Receipt } from '@/lib/printA5Receipt';
import { buildReceiptVerificationUrl } from '@/lib/receiptVerification';

export default function FeeReceiptByReferencePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const user = getStoredUser();
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    let active = true;

    async function resolveReceipt() {
      setLoading(true);
      setError('');
      try {
        const paymentIdParam = searchParams.get('paymentId');
        const bizRef = searchParams.get('businessReference') || reference;

        // Extract feeRecordId from EMS-FEE-{id}-{timestamp}
        const match = bizRef.match(/EMS-FEE-(\d+)/);
        const feeRecordId = match ? parseInt(match[1], 10) : undefined;

        // Verify/finalize payment with backend
        const verification = await api.verifyRazorpayPayment({
          businessReference: bizRef,
          feeRecordId,
          razorpayOrderId: paymentIdParam || bizRef,
          razorpayPaymentId: paymentIdParam || bizRef,
          razorpaySignature: 'ppg_return',
        });

        if (active && verification?.payment) {
          setPayment(verification.payment);
          router.replace(`/dashboard/fees/receipt/${verification.payment.id}`);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof ApiError ? err.message : 'Failed to verify payment and load receipt.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void resolveReceipt();

    return () => {
      active = false;
    };
  }, [reference, searchParams, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <LoadingBlock label="Verifying payment and generating receipt…" />
        <p className="mt-2 text-xs text-[var(--muted)]">Please wait while we confirm your transaction…</p>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm font-medium text-[var(--danger)]">{error || 'Receipt not found'}</p>
        <Link href="/dashboard/fees" className="text-sm text-[var(--primary)] hover:underline">
          ← Back to Fee Collection Desk
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
              signatoryName: user?.fullName || payment.collectedBy || undefined,
              verificationUrl: buildReceiptVerificationUrl(payment),
            })
          }
        >
          Print receipt
        </Button>
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--border)] bg-slate-100 p-4">
        <div className="mx-auto w-[210mm] max-w-full">
          <FeeReceipt payment={payment} />
        </div>
      </div>
    </div>
  );
}

