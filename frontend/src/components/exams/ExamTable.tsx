'use client';

import { Exam, ExamStatus } from '@/types/exam';
import { Regulation } from '@/types/regulation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface ExamTableProps {
  exams: Exam[];
  regulations: Regulation[];
  loading?: boolean;
  onEdit: (exam: Exam) => void;
  onView: (exam: Exam) => void;
  onSubmit: (exam: Exam) => void;
  onApprove: (exam: Exam) => void;
  onReject: (exam: Exam) => void;
  onPublish: (exam: Exam) => void;
  onReleaseHallTickets: (exam: Exam) => void;
}

function regulationCode(regs: Regulation[], id: number) {
  return regs.find((r) => r.id === id)?.code ?? `#${id}`;
}

function statusVariant(status: ExamStatus) {
  switch (status) {
    case 'published':
      return 'success' as const;
    case 'approved':
      return 'success' as const;
    case 'pending_approval':
      return 'warning' as const;
    case 'rejected':
      return 'danger' as const;
    default:
      return 'default' as const;
  }
}

function statusLabel(status: ExamStatus) {
  return status.replace(/_/g, ' ');
}

export function ExamTable({
  exams,
  regulations,
  loading,
  onEdit,
  onView,
  onSubmit,
  onApprove,
  onReject,
  onPublish,
  onReleaseHallTickets,
}: ExamTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-900">No examinations found</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create an examination with academic scope, subjects, fees, and dates.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/80">
            <th className="px-5 py-3.5 font-semibold text-slate-600">Name</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">
              Regulation
            </th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Scope</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Type</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Subjects</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Status</th>
            <th className="px-5 py-3.5 text-right font-semibold text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {exams.map((exam) => (
            <tr key={exam.id} className="transition hover:bg-slate-50/50">
              <td className="px-5 py-4">
                <p className="font-semibold text-slate-900">{exam.name}</p>
                {exam.rejectionRemarks && (
                  <p className="mt-0.5 text-xs text-red-600">
                    Rejected: {exam.rejectionRemarks}
                  </p>
                )}
              </td>
              <td className="px-5 py-4 text-slate-600">
                {regulationCode(regulations, exam.regulationId)}
              </td>
              <td className="px-5 py-4 text-slate-600">
                <p>
                  {exam.college ? `${exam.college} · ` : ''}
                  {exam.course}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {exam.scopes?.length
                    ? [
                        ...new Set(exam.scopes.map((s) => s.branch)),
                      ].join(', ')
                    : exam.branch}
                  {exam.scopes?.some((s) => s.section)
                    ? ` · sec: ${exam.scopes
                        .filter((s) => s.section)
                        .map((s) => s.section)
                        .join(', ')}`
                    : ''}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {exam.batch} · Y{exam.yearOfStudy} / S{exam.semester}
                </p>
              </td>
              <td className="px-5 py-4">
                <Badge variant="default">
                  {(exam.allowedTypes?.length
                    ? exam.allowedTypes
                    : [exam.type]
                  )
                    .map((t) => t.replace(/_/g, ' '))
                    .join(' + ')}
                </Badge>
              </td>
              <td className="px-5 py-4 text-slate-600">
                {exam.examSubjects?.length ?? 0}
              </td>
              <td className="px-5 py-4">
                <Badge variant={statusVariant(exam.status)}>
                  {statusLabel(exam.status)}
                </Badge>
              </td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    variant="ghost"
                    className="!px-2.5 !py-1.5 text-xs"
                    onClick={() => onView(exam)}
                  >
                    View
                  </Button>
                  {(exam.status === 'draft' || exam.status === 'rejected') && (
                    <>
                      <Button
                        variant="ghost"
                        className="!px-2.5 !py-1.5 text-xs"
                        onClick={() => onEdit(exam)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2.5 !py-1.5 text-xs"
                        onClick={() => onSubmit(exam)}
                      >
                        Submit
                      </Button>
                    </>
                  )}
                  {exam.status === 'pending_approval' && (
                    <>
                      <Button
                        variant="ghost"
                        className="!px-2.5 !py-1.5 text-xs !text-[var(--success)]"
                        onClick={() => onApprove(exam)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2.5 !py-1.5 text-xs !text-red-600"
                        onClick={() => onReject(exam)}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {exam.status === 'approved' && (
                    <Button
                      variant="ghost"
                      className="!px-2.5 !py-1.5 text-xs !text-[var(--success)]"
                      onClick={() => onPublish(exam)}
                    >
                      Publish
                    </Button>
                  )}
                  {exam.status === 'published' && (
                    <Button
                      variant="ghost"
                      className="!px-2.5 !py-1.5 text-xs !text-[var(--accent)]"
                      onClick={() => onReleaseHallTickets(exam)}
                      disabled={!!exam.hallTicketsReleasedAt}
                      title={
                        exam.hallTicketsReleasedAt
                          ? 'Hall tickets already released — late payers still get them'
                          : 'Release hall tickets to paid candidates'
                      }
                    >
                      {exam.hallTicketsReleasedAt
                        ? 'Hall tickets on'
                        : 'Release hall tickets'}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
