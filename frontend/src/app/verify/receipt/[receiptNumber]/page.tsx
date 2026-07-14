'use client';

import { use, useEffect, useState } from 'react';
import { money } from '@/components/fees/money';

type VerifyResult = {
  valid: boolean;
  receiptNumber: string;
  amountPaid: number;
  paymentMode: string;
  paymentMethod: string;
  paidAt: string;
  studentName: string;
  studentRollNumber: string;
  examName: string | null;
  college: string | null;
  course: string | null;
  branch: string | null;
  batch: string | null;
  yearOfStudy: number | null;
  semester: number | null;
  collectedBy: string | null;
  status: string;
  tokenValidated?: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function VerifyReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ receiptNumber: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { receiptNumber: rawReceipt } = use(params);
  const { v } = use(searchParams);
  const receiptNumber = decodeURIComponent(rawReceipt);

  const [data, setData] = useState<VerifyResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const q = v ? `?v=${encodeURIComponent(v)}` : '';
        const res = await fetch(
          `${API_URL}/fees/verify/${encodeURIComponent(receiptNumber)}${q}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.message || 'Receipt could not be verified.');
        }
        setData(body as VerifyResult);
      } catch (err) {
        setData(null);
        setError(
          err instanceof Error ? err.message : 'Verification failed.',
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [receiptNumber, v]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary)] text-sm font-bold text-white">
            EMS
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Receipt verification
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Official examination fee receipt check
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Verifying…</p>
          ) : error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">Not verified</p>
              <p className="mt-1">{error}</p>
              <p className="mt-2 text-xs text-red-600/80">
                This link may be incomplete or the receipt number is invalid.
              </p>
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <p className="font-bold">✓ Genuine receipt</p>
                <p className="mt-0.5 text-emerald-700">
                  Payment recorded successfully in EMS.
                  {data.tokenValidated
                    ? ' QR security token validated.'
                    : ''}
                </p>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Info label="Receipt No." value={data.receiptNumber} mono />
                <Info
                  label="Amount paid"
                  value={money(data.amountPaid)}
                />
                <Info label="Student" value={data.studentName} />
                <Info label="PIN / Roll" value={data.studentRollNumber} mono />
                <Info
                  label="Examination"
                  value={data.examName ?? '—'}
                />
                <Info
                  label="Programme"
                  value={
                    data.course && data.branch
                      ? `${data.course} / ${data.branch}`
                      : '—'
                  }
                />
                <Info
                  label="Paid at"
                  value={new Date(data.paidAt).toLocaleString()}
                />
                <Info
                  label="Mode"
                  value={`${data.paymentMode} / ${data.paymentMethod.replace(/_/g, ' ')}`}
                />
                {data.collectedBy ? (
                  <Info label="Collected by" value={data.collectedBy} />
                ) : null}
                {data.college ? (
                  <Info label="College" value={data.college} />
                ) : null}
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-semibold text-slate-900 ${
          mono ? 'font-mono text-sm' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
