import { ReactNode } from 'react';
import { NavIcon } from '@/components/icons/NavIcon';
import { NavItem } from '@/config/navigation';
import { EmptyState } from './EmptyState';

export { EmptyState };

export function PageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {breadcrumbs ? <div className="mb-2">{breadcrumbs}</div> : null}
        <h1 className="text-[1.5rem] font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  loading,
  accent = 'primary',
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: NavItem['icon'];
  loading?: boolean;
  accent?: 'primary' | 'accent' | 'success' | 'warning' | 'info';
}) {
  const accents = {
    primary: 'bg-[var(--primary-soft)] text-[var(--primary)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    success: 'bg-[var(--success-soft)] text-[var(--success)]',
    warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
    info: 'bg-[var(--info-soft)] text-[var(--info)]',
  };

  return (
    <div className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between">
        <div className={`rounded-[var(--radius)] p-2.5 ${accents[accent]}`}>
          <NavIcon name={icon} />
        </div>
      </div>
      <p className="mt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-[1.75rem] font-bold tracking-tight text-slate-900">
        {loading ? (
          <span className="inline-block h-9 w-12 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
        ) : (
          value
        )}
      </p>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{hint}</p>
    </div>
  );
}
