'use client';

import { Subject } from '@/types/subject';
import { Regulation } from '@/types/regulation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface SubjectTableProps {
  subjects: Subject[];
  regulations: Regulation[];
  loading?: boolean;
  onEdit: (subject: Subject) => void;
  onDelete: (subject: Subject) => void;
}

function regulationLabel(regulations: Regulation[], regulationId: number) {
  const reg = regulations.find((r) => r.id === regulationId);
  return reg ? `${reg.code}` : `#${regulationId}`;
}

function formatCredits(value: number | string) {
  const num = Number(value);
  return Number.isNaN(num) ? '—' : num.toString();
}

export function SubjectTable({
  subjects,
  regulations,
  loading,
  onEdit,
  onDelete,
}: SubjectTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-900">No subjects found</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create subjects under a regulation or adjust your filter.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-3 sm:mx-0 overflow-x-auto">
      <table className="w-full min-w-[800px] text-left text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/80">
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Code</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Name</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Regulation</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Type</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Credits</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Marks</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Status</th>
            <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {subjects.map((subject) => (
            <tr key={subject.id} className="transition hover:bg-slate-50/50">
              <td className="px-3 sm:px-5 py-3 sm:py-4 font-semibold text-slate-900 break-words">{subject.code}</td>
              <td className="px-3 sm:px-5 py-3 sm:py-4 font-medium text-slate-800 break-words">{subject.name}</td>
              <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600">
                {regulationLabel(regulations, subject.regulationId)}
              </td>
              <td className="px-3 sm:px-5 py-3 sm:py-4">
                <Badge variant="default">{subject.type}</Badge>
              </td>
              <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 tabular-nums">
                {formatCredits(subject.credits)}
              </td>
              <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 tabular-nums">
                {subject.internalMarks}/{subject.externalMarks} ({subject.totalMarks})
              </td>
              <td className="px-3 sm:px-5 py-3 sm:py-4">
                <StatusBadge status={subject.status} />
              </td>
              <td className="px-3 sm:px-5 py-3 sm:py-4">
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => onEdit(subject)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs !text-red-600 hover:!bg-red-50"
                    onClick={() => onDelete(subject)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
