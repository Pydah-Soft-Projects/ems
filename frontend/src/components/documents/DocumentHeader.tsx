import { ReactNode } from 'react';

export function DocumentBrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-11 w-11 text-xs';
  return (
    <div
      className={`flex ${box} items-center justify-center rounded-2xl bg-[var(--primary)] font-bold text-white shadow-[var(--shadow-sm)]`}
    >
      EMS
    </div>
  );
}

export function DocumentHeader({
  collegeName = 'Examination Management System',
  collegePlace,
  documentTitle,
  subtitle,
  rightSlot,
}: {
  collegeName?: string;
  collegePlace?: string;
  documentTitle: string;
  subtitle?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
      <div className="flex items-center gap-2">
        <DocumentBrandMark />
        <div className="text-[10px] leading-tight text-slate-600">
          <p className="font-bold text-slate-900">EMS PORTAL</p>
          <p>Examinations</p>
        </div>
      </div>
      <div className="flex-1 text-center">
        <h1 className="text-sm font-bold uppercase tracking-wide text-slate-900">
          {collegeName}
        </h1>
        {collegePlace ? (
          <p className="text-[10px] uppercase text-slate-600">{collegePlace}</p>
        ) : null}
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-[var(--primary)]">
          {documentTitle}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="min-w-[72px] text-right text-[10px] text-slate-600">
        {rightSlot}
      </div>
    </div>
  );
}

export function DocumentMetaGrid({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            {item.label}
          </dt>
          <dd className="mt-0.5 font-semibold text-slate-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
