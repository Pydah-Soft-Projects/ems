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
      className={`overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3 px-3 sm:px-5 pb-2.5 sm:pb-4 pt-3 sm:pt-5 border-b border-[var(--border)]/60">
      <div className="min-w-0 flex-1">
        <h3 className="text-xs sm:text-sm font-semibold tracking-tight text-slate-900 break-words">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 sm:mt-1 text-[0.6875rem] sm:text-xs leading-relaxed text-[var(--muted)] break-words">
            {description}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 flex flex-wrap gap-1.5 sm:justify-end">{action}</div>
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
  return <div className={`px-3 sm:px-5 py-3 sm:py-5 ${className}`}>{children}</div>;
}
