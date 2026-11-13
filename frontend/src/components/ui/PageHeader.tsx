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
        <h1 className="text-[1.5rem] font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
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
  accent?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'info';
}) {
  const accents = {
    primary: 'bg-[var(--primary-light)] text-[var(--primary)]',
    secondary: 'bg-[var(--primary-light)] text-[var(--secondary)]',
    accent: 'bg-[var(--primary-light)] text-[var(--accent)]',
    success: 'bg-[var(--success-light)] text-[var(--success)]',
    warning: 'bg-[var(--warning-light)] text-[var(--warning)]',
    info: 'bg-[var(--info-light)] text-[var(--info)]',
  };

  return (
    <div className="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between">
        <div className={`rounded-[var(--radius)] p-2.5 ${accents[accent]}`}>
          <NavIcon name={icon} />
        </div>
      </div>
      <p className="mt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="mt-1 text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)]">
        {loading ? (
          <span className="inline-block h-9 w-12 animate-pulse rounded-xl bg-[var(--border)]" />
        ) : (
          value
        )}
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}
