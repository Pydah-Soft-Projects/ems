'use client';

import { Regulation } from '@/types/regulation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

interface RegulationTableProps {
  regulations: Regulation[];
  loading?: boolean;
  onView: (regulation: Regulation) => void;
  onEdit: (regulation: Regulation) => void;
  onDelete: (regulation: Regulation) => void;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function RegulationTable({
  regulations,
  loading,
  onView,
  onEdit,
  onDelete,
}: RegulationTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (regulations.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-900">No regulations yet</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create your first academic regulation to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/80">
            <th className="px-5 py-3.5 font-semibold text-slate-600">Code</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Name</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Effective date</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Scope</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Status</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Created</th>
            <th className="px-5 py-3.5 text-right font-semibold text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {regulations.map((reg) => (
            <tr key={reg.id} className="transition hover:bg-slate-50/50">
              <td className="px-5 py-4 font-semibold text-slate-900">{reg.code}</td>
              <td className="px-5 py-4">
                <p className="font-medium text-slate-800">{reg.name}</p>
                {reg.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]">
                    {reg.description}
                  </p>
                )}
              </td>
              <td className="px-5 py-4 text-slate-600">
                {reg.effectiveDate ? formatDate(reg.effectiveDate) : '—'}
              </td>
              <td className="px-5 py-4 text-slate-600">
                {reg.scopes?.length
                  ? `${new Set(reg.scopes.map((s) => s.collegeId)).size} colleges · ${reg.scopes.length} batches`
                  : '—'}
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={reg.status} />
              </td>
              <td className="px-5 py-4 text-slate-600">
                {formatDate(reg.createdAt)}
              </td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => onView(reg)}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => onEdit(reg)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs !text-red-600 hover:!bg-red-50"
                    onClick={() => onDelete(reg)}
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
