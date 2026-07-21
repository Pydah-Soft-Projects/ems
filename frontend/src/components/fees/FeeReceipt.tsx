'use client';

import { Payment } from '@/types/fee';
import { DocumentHeader } from '@/components/documents/DocumentHeader';
import { money, moneyPlain } from './money';
import { buildReceiptVerificationUrl } from '@/lib/receiptVerification';

interface FeeReceiptProps {
  payment: Payment;
  signatoryName?: string;
  collegeName?: string;
  collegePlace?: string;
}

/** On-screen preview only. Printing uses printA5Receipt() standalone HTML. */
export function FeeReceipt({
  payment,
  signatoryName,
  collegeName = 'Examination Management System',
  collegePlace = '',
}: FeeReceiptProps) {
  const fr = payment.feeRecord;
  const exam = fr?.exam;
  const paidAt = new Date(payment.paidAt);
  const dateStr = paidAt.toLocaleDateString('en-IN');
  const timeStr = paidAt.toLocaleString('en-IN');
  const verifyUrl = buildReceiptVerificationUrl(payment);

  const amountPaid = Number(payment.amountPaid);
  const examDetail = exam
    ? `Y${exam.yearOfStudy} / Sem ${exam.semester}${
        fr?.feeBreakdown?.length
          ? ` · ${fr.feeBreakdown.map((b) => b.subjectCode).join(', ')}`
          : ''
      }`
    : 'Exam fee payment';

  // Show exam fee and late fee as separate rows when the fee record has a
  // late fee and the parts add up to the amount paid; otherwise fall back to
  // the single combined row.
  const baseFee = Number(fr?.baseFee ?? 0);
  const lateFee = Number(fr?.lateFee ?? 0);
  const splitRows =
    lateFee > 0 && Math.abs(baseFee + lateFee - amountPaid) < 0.01;

  const particulars = splitRows
    ? [
        {
          title: exam?.name ?? 'Examination fee',
          detail: examDetail,
          amount: baseFee,
        },
        {
          title: 'Late Fee',
          detail: exam?.name
            ? `Late application fee — ${exam.name}`
            : 'Late application fee',
          amount: lateFee,
        },
      ]
    : [
        {
          title: exam?.name ?? 'Examination fee',
          detail: examDetail,
          amount: amountPaid,
        },
      ];

  const total = particulars.reduce((s, p) => s + p.amount, 0);
  const signer = signatoryName || payment.collectedBy || 'Authorized';

  return (
    <div className="fee-receipt mx-auto bg-white text-black shadow-sm">
      <div className="border border-slate-800 p-4">
        <DocumentHeader
          collegeName={collegeName}
          collegePlace={collegePlace}
          documentTitle="Fee receipt"
          subtitle="Student copy"
          rightSlot={
            <p className="font-mono text-[11px] font-bold text-slate-800">
              {payment.receiptNumber}
            </p>
          }
        />

        <div className="mt-3 grid grid-cols-3 gap-2 rounded border border-dashed border-slate-400 p-2 text-[10px]">
          <div className="space-y-1 border-r border-dashed border-slate-300 pr-2">
            <p className="text-slate-500">Receipt No.</p>
            <p className="font-mono text-[11px] font-bold">
              {payment.receiptNumber}
            </p>
            <p className="text-slate-500">Date</p>
            <p className="font-bold">{dateStr}</p>
          </div>
          <div className="space-y-1 border-r border-dashed border-slate-300 px-2">
            <p className="text-slate-500">Student Name</p>
            <p className="font-bold">{fr?.studentName ?? '—'}</p>
            <p className="text-slate-500">PIN / Roll No.</p>
            <p className="font-mono font-bold">
              {fr?.studentRollNumber ?? '—'}
            </p>
          </div>
          <div className="space-y-1 pl-2">
            <p className="text-slate-500">Course / Branch</p>
            <p className="font-bold">
              {exam ? `${exam.course} — ${exam.branch}` : '—'}
            </p>
            <p className="text-slate-500">Batch / Year</p>
            <p className="font-bold">
              {exam
                ? `${exam.batch} · Y${exam.yearOfStudy}/S${exam.semester}`
                : '—'}
            </p>
          </div>
        </div>

        <table className="mt-3 w-full border-collapse border border-slate-800 text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                S.No
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-left">
                Particulars / Fee Description
              </th>
              <th className="border border-slate-800 px-2 py-1.5 text-right">
                Amount (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {particulars.map((row, idx) => (
              <tr key={idx}>
                <td className="border border-slate-800 px-2 py-2">{idx + 1}</td>
                <td className="border border-slate-800 px-2 py-2">
                  <p className="font-semibold">{row.title}</p>
                  <p className="text-[10px] text-slate-600">{row.detail}</p>
                </td>
                <td className="border border-slate-800 px-2 py-2 text-right tabular-nums">
                  {moneyPlain(row.amount)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold">
              <td
                colSpan={2}
                className="border border-slate-800 px-2 py-2 text-right"
              >
                TOTAL AMOUNT PAID
              </td>
              <td className="border border-slate-800 px-2 py-2 text-right tabular-nums">
                {money(total)}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-1 text-right text-[10px] text-slate-600">
          Total outstanding due ₹0
        </p>

        <div className="mt-3 grid grid-cols-[90px_1fr_120px] gap-2 border-t border-slate-300 pt-3 text-[9px]">
          <div className="flex flex-col items-center rounded border border-slate-300 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent(verifyUrl)}`}
              alt="Verify receipt"
              width={72}
              height={72}
            />
            <p className="mt-1 font-semibold uppercase">Scan to verify</p>
          </div>
          <div className="flex flex-col justify-center gap-1.5 px-2">
            <p>
              <strong>Payment Mode</strong>{' '}
              <span className="capitalize">
                {payment.paymentMethod.replace(/_/g, ' ')}
              </span>
            </p>
            <p>
              <strong>Generated On</strong> {timeStr}
            </p>
            <p>
              <strong>Verified</strong> Officially verified
            </p>
            {payment.collectedBy ? (
              <p>
                <strong>Collected by</strong> {payment.collectedBy}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-center justify-end pb-1 text-center">
            <div className="mb-6 w-full border-b border-slate-800" />
            <p className="text-[9px] font-bold uppercase">{signer}</p>
            <p className="text-[8px] text-slate-600">Authorized Signatory</p>
          </div>
        </div>

        <p className="mt-3 text-center text-[9px] italic text-slate-500">
          Note: Please preserve this receipt for future reference.
        </p>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-[8px] text-slate-500">
          <span>Examination fee receipt</span>
          <span>POWERED BY EMS</span>
        </div>
      </div>
    </div>
  );
}
