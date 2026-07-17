import { ReactNode } from 'react';

type Tone = 'danger' | 'success' | 'warning' | 'info' | 'neutral';

const tones: Record<Tone, string> = {
  danger:
    'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]',
  success:
    'border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]',
  warning:
    'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]',
  info: 'border-[var(--info-border)] bg-[var(--info-soft)] text-[var(--info)]',
  neutral: 'border-[var(--border)] bg-[var(--surface-subtle)] text-slate-700',
};

export function Alert({
  tone = 'neutral',
  children,
  title,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`rounded-[var(--radius)] border px-3.5 py-2.5 text-sm ${tones[tone]} ${className}`}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
