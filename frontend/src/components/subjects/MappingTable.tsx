'use client';

import { SubjectMappingEntry } from '@/types/subject';
import { Regulation } from '@/types/regulation';
import { Button } from '@/components/ui/Button';

interface MappingTableProps {
  mappings: SubjectMappingEntry[];
  regulations: Regulation[];
  loading?: boolean;
  onEdit: (mapping: SubjectMappingEntry) => void;
  onDelete: (mapping: SubjectMappingEntry) => void;
}

function regulationLabel(regulations: Regulation[], regulationId: number) {
  const reg = regulations.find((r) => r.id === regulationId);
  return reg ? reg.code : `#${regulationId}`;
}

export function MappingTable({
  mappings,
  regulations,
  loading,
  onEdit,
  onDelete,
}: MappingTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm font-medium text-slate-900">No mappings found</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Assign subjects to branches, batches, years, and semesters from the
          regulation scope.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/80">
            <th className="px-5 py-3.5 font-semibold text-slate-600">Regulation</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Subject</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">College</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Programme</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Branch</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Batch</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Year</th>
            <th className="px-5 py-3.5 font-semibold text-slate-600">Sem</th>
            <th className="px-5 py-3.5 text-right font-semibold text-slate-600">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {mappings.map((mapping) => (
            <tr key={mapping.id} className="transition hover:bg-slate-50/50">
              <td className="px-5 py-4 font-medium text-slate-800">
                {regulationLabel(regulations, mapping.regulationId)}
              </td>
              <td className="px-5 py-4">
                <p className="font-semibold text-slate-900">
                  {mapping.subject?.code ?? '—'}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {mapping.subject?.name ?? ''}
                </p>
              </td>
              <td className="px-5 py-4 text-slate-600">{mapping.collegeName}</td>
              <td className="px-5 py-4 text-slate-600">{mapping.courseName}</td>
              <td className="px-5 py-4 text-slate-600">{mapping.branchName}</td>
              <td className="px-5 py-4 text-slate-600">{mapping.batch}</td>
              <td className="px-5 py-4 text-slate-600">{mapping.yearOfStudy}</td>
              <td className="px-5 py-4 text-slate-600">{mapping.semester}</td>
              <td className="px-5 py-4">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => onEdit(mapping)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs !text-red-600 hover:!bg-red-50"
                    onClick={() => onDelete(mapping)}
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
