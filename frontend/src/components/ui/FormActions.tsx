import { ReactNode } from 'react';

export function FormActions({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageToolbar({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      {children}
    </div>
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li
            key={step}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
              active
                ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                : done
                  ? 'bg-[var(--success-soft)] text-[var(--success)]'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[10px]">
              {index + 1}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
  );
}
