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
  const application = exam.applications?.[0] ?? null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3.5 sm:p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 break-words">{exam.name}</p>
          <p className="mt-0.5 text-[0.6875rem] sm:text-xs text-[var(--muted)] break-words">
            {(exam.allowedTypes?.length ? exam.allowedTypes : [exam.type])
              .map((t) => t.replace(/_/g, ' '))
              .join(' / ')}{' '}
            · {exam.course} / {exam.branch} · Y{exam.yearOfStudy}/S{exam.semester} ·{' '}
            {exam.subjectCount} subjects
          </p>
          {exam.applicationEndDate ? (
            <p className="mt-1 text-[0.6875rem] sm:text-xs text-[var(--muted)] break-words">
              Apply by {exam.applicationEndDate}
            </p>
          ) : null}
          {application ? (
            <p className="mt-2 text-[0.6875rem] sm:text-xs font-medium text-amber-800 break-words">
              You have already applied as{' '}
              {application.examType.replace(/_/g, ' ')}. Another type requires
              a separate examination.
            </p>
          ) : null}
        </div>
        {application ? (
          <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
            <div className="flex justify-between sm:justify-end items-center">
              <Badge variant={application.feeStatus === 'paid' ? 'success' : 'warning'}>
                {application.feeStatus === 'paid' ? 'Applied' : 'Payment due'}
              </Badge>
            </div>
            {application.feeStatus === 'paid' ? (
              <Button
                type="button"
                variant="secondary"
                fullWidth
                className="sm:w-auto"
                onClick={() =>
                  router.push(`/student/hall-tickets/${application.id}`)
                }
              >
                See hall ticket
              </Button>
            ) : (
              <Button
                type="button"
                fullWidth
                className="sm:w-auto"
                onClick={() =>
                  router.push(`/student/applications/${application.feeRecordId}`)
                }
              >
                Review & pay
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="button"
            fullWidth
            className="sm:w-auto"
            onClick={() => router.push(`/student/exams/${exam.id}/apply`)}
          >
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

export function ApplicationCard({ record }: { record: ExamFeeRecord }) {
  const router = useRouter();
  const upiTotal = calcUpiConvenienceFee(record.totalAmount, 'upi').total;
  const successPay = record.payments?.find((p) => p.status === 'success');

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3.5 sm:p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 break-words">
            {record.exam?.name ?? `Exam #${record.examId}`}
          </p>
          <p className="mt-0.5 text-[0.6875rem] sm:text-xs text-[var(--muted)] break-words">
            {record.exam
              ? `${(record.examType ?? record.exam.type)?.toString().replace(/_/g, ' ') ?? ''} · ${record.exam.course} / ${record.exam.branch}`
              : '—'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 sm:gap-3 text-[0.75rem] sm:text-sm">
            <span>Fee {money(record.totalAmount)}</span>
            {record.status === 'pending' ? (
              <span className="text-amber-800">
                From {money(upiTotal)} with UPI (incl. 2.2%)
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
          <div className="flex justify-between sm:justify-end items-center">
            <Badge variant={record.status === 'paid' ? 'success' : 'warning'}>
              {record.status === 'paid' ? 'Paid' : 'Payment due'}
            </Badge>
          </div>
          {record.status === 'pending' ? (
            <Button
              type="button"
              fullWidth
              className="sm:w-auto"
              onClick={() => router.push(`/student/applications/${record.id}`)}
            >
              Review & pay
            </Button>
          ) : successPay ? (
            <Button
              type="button"
              variant="secondary"
              fullWidth
              className="sm:w-auto"
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
