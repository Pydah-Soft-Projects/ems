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
  const hasOverdue = Boolean(
    exam.dueClearance?.hasOverdue ?? exam.dueClearance?.blocked,
  );
  const restrictionEnabled = exam.dueClearance?.restrictionEnabled !== false;
  const canApply =
    exam.canApply !== false &&
    !application &&
    (!restrictionEnabled || !hasOverdue);

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
          {application ? (
            <p className="mt-2 text-xs font-medium text-amber-800">
              You have already applied as{' '}
              {application.examType.replace(/_/g, ' ')}. Another type requires
              a separate examination.
            </p>
          ) : null}
          {hasOverdue && !application ? (
            <p className="mt-2 text-xs font-medium text-[var(--danger)]">
              {exam.dueClearance?.message ||
                `Outstanding dues ${money(exam.dueClearance?.totalDue ?? 0)}.${
                  restrictionEnabled
                    ? ' Clear dues before applying.'
                    : ' (Apply restriction is currently off.)'
                }`}
            </p>
          ) : null}
        </div>
        {application ? (
          <div className="flex flex-col items-end gap-2">
            <Badge variant={application.feeStatus === 'paid' ? 'success' : 'warning'}>
              {application.feeStatus === 'paid' ? 'Applied' : 'Payment due'}
            </Badge>
            {application.feeStatus === 'paid' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  router.push(`/student/hall-tickets/${application.id}`)
                }
              >
                See hall ticket
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  router.push(`/student/applications/${application.feeRecordId}`)
                }
              >
                Review & pay
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-2">
            {hasOverdue && restrictionEnabled ? (
              <Badge variant="danger">Dues pending</Badge>
            ) : hasOverdue ? (
              <Badge variant="warning">Dues (not blocking)</Badge>
            ) : null}
            <Button
              type="button"
              variant={canApply ? 'primary' : 'secondary'}
              onClick={() => router.push(`/student/exams/${exam.id}/apply`)}
            >
              {canApply ? 'Apply' : 'View details'}
            </Button>
          </div>
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
