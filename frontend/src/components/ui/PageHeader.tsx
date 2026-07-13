import { ReactNode } from 'react';
import { NavIcon } from '@/components/icons/NavIcon';
import { NavItem } from '@/config/navigation';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        )}
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
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: NavItem['icon'];
  loading?: boolean;
}) {
  return (
    <div className="group rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="rounded-xl bg-[var(--primary-soft)] p-2.5 text-[var(--primary)]">
          <NavIcon name={icon} />
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
        {loading ? (
          <span className="inline-block h-9 w-12 animate-pulse rounded bg-slate-200" />
        ) : (
          value
        )}
      </p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-slate-50/50 px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-[var(--primary-soft)] p-4 text-[var(--primary)]">
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--muted)]">{description}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">
        Coming in next phase
      </p>
    </div>
  );
}
