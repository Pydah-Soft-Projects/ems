import { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { LoadingBlock } from './Spinner';

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  if (loading) return <LoadingBlock />;
  if (!rows.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="-mx-3 sm:mx-0 overflow-x-auto rounded-[var(--radius-lg)] sm:rounded-[var(--radius-lg)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <table className="min-w-full text-left text-xs sm:text-sm border-collapse">
        <thead className="bg-[var(--surface-subtle)] text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-3 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition hover:bg-slate-50/80">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 sm:px-4 py-2 sm:py-2.5 align-middle text-slate-700 whitespace-nowrap break-words ${col.className || ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
