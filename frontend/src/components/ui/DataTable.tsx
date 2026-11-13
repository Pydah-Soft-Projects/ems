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
  footer,
  monochrome = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  footer?: ReactNode;
  monochrome?: boolean;
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
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className={`${monochrome ? 'bg-[var(--surface)] text-[var(--text-primary)]' : 'bg-[var(--background)] text-[var(--text-secondary)]'} text-xs font-semibold uppercase tracking-wide`}>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={rowKey(row)} className={monochrome ? '' : 'hover:bg-[var(--primary-light)]/40'}>
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-3 ${monochrome ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'} ${col.className || ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}
