import { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border)] ${className}`}>
      <div className="py-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}
