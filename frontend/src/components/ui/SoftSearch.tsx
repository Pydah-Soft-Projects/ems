'use client';

import { InputHTMLAttributes } from 'react';

export function SoftSearchField({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`relative block ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[var(--text-subtle)]">
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
          />
        </svg>
      </span>
      <input
        className="h-10 w-full rounded-full border border-transparent bg-[var(--surface-muted)] py-2 pl-10 pr-4 text-xs text-slate-900 outline-none transition placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--ring)]"
        {...props}
      />
    </label>
  );
}

export function StatusFilter<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--border)] bg-white p-1 shadow-[var(--shadow-sm)]"
      role="group"
      aria-label="Status filter"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={`rounded-full px-2.5 sm:px-3 py-1.5 text-[0.625rem] sm:text-[0.6875rem] font-semibold transition ${
              active
                ? 'bg-[var(--primary)] text-white shadow-[var(--shadow-sm)]'
                : 'text-[var(--muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]'
            }`}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="ml-1.5 opacity-80">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  hint,
  tone = 'primary',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
}) {
  const tones = {
    primary: 'border-[var(--primary)]/10 bg-[var(--primary-soft)]',
    accent: 'border-[var(--accent-border)] bg-[var(--accent-soft)]',
    success: 'border-[var(--success-border)] bg-[var(--success-soft)]',
    warning: 'border-[var(--warning-border)] bg-[var(--warning-soft)]',
  };
  const labels = {
    primary: 'text-[var(--primary)]',
    accent: 'text-[var(--accent-hover)]',
    success: 'text-[var(--success)]',
    warning: 'text-amber-800',
  };

  return (
    <div
      className={`rounded-[var(--radius-lg)] border p-3 sm:p-4 shadow-[var(--shadow-sm)] ${tones[tone]}`}
    >
      <p className={`text-[0.625rem] sm:text-[0.6875rem] font-semibold uppercase tracking-wider ${labels[tone]}`}>
        {label}
      </p>
      <div className="mt-1.5 sm:mt-2 flex flex-col sm:flex-row sm:items-end justify-between gap-1 sm:gap-3">
        <p className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 break-words">{value}</p>
        {hint ? (
          <p className="text-[0.6875rem] sm:text-xs font-medium text-[var(--muted)] break-words">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
