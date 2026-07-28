'use client';

import { useMemo, useState } from 'react';
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

function scopeKey(m: SubjectMappingEntry) {
  return [
    m.regulationId,
    m.collegeId,
    m.courseId,
    m.branchId,
    m.batch,
    m.yearOfStudy,
    m.semester,
    m.sectionKey ?? '*',
  ].join('|');
}

function sectionLabel(m: SubjectMappingEntry) {
  return m.sectionMode === 'selected' && m.sections?.length
    ? m.sections.join(', ')
    : 'All';
}

export function MappingTable({
  mappings,
  regulations,
  loading,
  onEdit,
  onDelete,
}: MappingTableProps) {
  const [view, setView] = useState<'grouped' | 'flat'>('grouped');

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; sample: SubjectMappingEntry; entries: SubjectMappingEntry[] }
    >();
    for (const m of mappings) {
      const key = scopeKey(m);
      if (!map.has(key)) {
        map.set(key, { key, sample: m, entries: [] });
      }
      map.get(key)!.entries.push(m);
    }
    return Array.from(map.values());
  }, [mappings]);

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
          Map an academic scope (college → branch → year/sem → sections) to
          subjects, or assign subjects into scopes. Both store the same rows.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-3 sm:mx-0">
      <div className="flex items-center justify-end gap-2 border-b border-[var(--border)] px-3 sm:px-5 py-2.5 sm:py-3">
        <span className="text-[0.6875rem] sm:text-xs text-[var(--muted)]">View</span>
        <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
          <button
            type="button"
            onClick={() => setView('grouped')}
            className={`rounded px-2 sm:px-2.5 py-1 text-[0.6875rem] sm:text-xs font-medium ${
              view === 'grouped'
                ? 'bg-[var(--primary)] text-white'
                : 'text-slate-600'
            }`}
          >
            By scope
          </button>
          <button
            type="button"
            onClick={() => setView('flat')}
            className={`rounded px-2 sm:px-2.5 py-1 text-[0.6875rem] sm:text-xs font-medium ${
              view === 'flat'
                ? 'bg-[var(--primary)] text-white'
                : 'text-slate-600'
            }`}
          >
            Flat rows
          </button>
        </div>
      </div>

      {view === 'grouped' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80">
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Regulation
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Academic scope
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Year / Sem
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Sections
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Subjects
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {groups.map((group) => {
                const m = group.sample;
                return (
                  <tr key={group.key} className="transition hover:bg-slate-50/50">
                    <td className="px-3 sm:px-5 py-3 sm:py-4 font-medium text-slate-800">
                      {regulationLabel(regulations, m.regulationId)}
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600">
                      <p className="font-medium text-slate-800 break-words">
                        {m.collegeName}
                      </p>
                      <p className="text-[0.6875rem] sm:text-xs text-[var(--muted)] break-words">
                        {m.courseName} → {m.branchName} → {m.batch}
                      </p>
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 tabular-nums">
                      Y{m.yearOfStudy} / S{m.semester}
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 break-words">
                      {sectionLabel(m)}
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4">
                      <p className="font-medium text-slate-800">
                        {group.entries.length} subject
                        {group.entries.length !== 1 ? 's' : ''}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[0.6875rem] sm:text-xs text-[var(--muted)] break-words">
                        {group.entries
                          .map((e) => e.subject?.code ?? `#${e.subjectId}`)
                          .join(', ')}
                      </p>
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="ghost"
                          className="!px-3 !py-1.5 text-xs"
                          onClick={() => onEdit(m)}
                        >
                          Edit scope
                        </Button>
                        <Button
                          variant="ghost"
                          className="!px-3 !py-1.5 text-xs !text-red-600 hover:!bg-red-50"
                          onClick={() => onDelete(m)}
                        >
                          Delete one
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/80">
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Regulation
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Subject
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  College
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Programme
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Branch
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Batch
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Year</th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">Sem</th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Sections
                </th>
                <th className="px-3 sm:px-5 py-2.5 sm:py-3.5 text-right font-semibold text-slate-600 text-[0.6875rem] sm:text-xs uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {mappings.map((mapping) => (
                <tr
                  key={mapping.id}
                  className="transition hover:bg-slate-50/50"
                >
                  <td className="px-3 sm:px-5 py-3 sm:py-4 font-medium text-slate-800">
                    {regulationLabel(regulations, mapping.regulationId)}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4">
                    <p className="font-semibold text-slate-900 break-words">
                      {mapping.subject?.code ?? '—'}
                    </p>
                    <p className="text-[0.6875rem] sm:text-xs text-[var(--muted)] break-words">
                      {mapping.subject?.name ?? ''}
                    </p>
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 break-words">
                    {mapping.collegeName}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 break-words">
                    {mapping.courseName}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 break-words">
                    {mapping.branchName}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 tabular-nums">{mapping.batch}</td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 tabular-nums">
                    {mapping.yearOfStudy}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 tabular-nums">
                    {mapping.semester}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4 text-slate-600 break-words">
                    {sectionLabel(mapping)}
                  </td>
                  <td className="px-3 sm:px-5 py-3 sm:py-4">
                    <div className="flex flex-wrap justify-end gap-2">
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
      )}
    </div>
  );
}
