'use client';

import { useRouter } from 'next/navigation';
import { StudentExamListItem } from '@/types/exam';
import { ExamFeeRecord } from '@/types/fee';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { money } from '@/components/fees/money';
import { calcUpiConvenienceFee } from '@/lib/upiConvenienceFee';

export function AvailableExamCard({ exam }: { exam: StudentExamListItem }) {
  const router = useRouter();
  const open = exam.openTypes?.length ?? 0;
  const applied = exam.applications?.length ?? 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{exam.name}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {(exam.allowedTypes?.length ? exam.allowedTypes : [exam.type])
              .map((t) => t.replace(/_/g, ' '))
              .join(' / ')}{' '}
            · {exam.course} / {exam.branch} · Y{exam.yearOfStudy}/S{exam.semester} ·{' '}
            {exam.subjectCount} subjects
          </p>
          {exam.applicationEndDate ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              Apply by {exam.applicationEndDate}
            </p>
          ) : null}
          {applied > 0 && open > 0 ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              You already applied for {applied} type
              {applied !== 1 ? 's' : ''}. {open} type{open !== 1 ? 's' : ''} still
              open.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={() => router.push(`/student/exams/${exam.id}/apply`)}
        >
          {applied > 0 ? 'Continue / apply' : 'Apply'}
        </Button>
      </div>
    </div>
  );
}

export function ApplicationCard({ record }: { record: ExamFeeRecord }) {
  const router = useRouter();
  const upiTotal = calcUpiConvenienceFee(record.totalAmount, 'upi').total;
  const successPay = record.payments?.find((p) => p.status === 'success');

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {record.exam?.name ?? `Exam #${record.examId}`}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {record.exam
              ? `${(record.examType ?? record.exam.type)?.toString().replace(/_/g, ' ') ?? ''} · ${record.exam.course} / ${record.exam.branch}`
              : '—'}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <span>Fee {money(record.totalAmount)}</span>
            {record.status === 'pending' ? (
              <span className="text-amber-800">
                From {money(upiTotal)} with UPI (incl. 2.2%)
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={record.status === 'paid' ? 'success' : 'warning'}>
            {record.status === 'paid' ? 'Paid' : 'Payment due'}
          </Badge>
          {record.status === 'pending' ? (
            <Button
              type="button"
              onClick={() => router.push(`/student/applications/${record.id}`)}
            >
              Review & pay
            </Button>
          ) : successPay ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/student/receipt/${successPay.id}`)}
            >
              View receipt
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
