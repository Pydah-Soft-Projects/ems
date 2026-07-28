'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

export type TabItem = {
  id: string;
  label: string;
  href?: string;
  count?: number;
};

export function Tabs({
  items,
  activeId,
  onChange,
}: {
  items: TabItem[];
  activeId: string;
  onChange?: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--border)] bg-white p-1 shadow-[var(--shadow-sm)]"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const className = `inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3.5 py-1.5 text-[0.6875rem] sm:text-xs font-semibold transition ${
          active
            ? 'bg-[var(--primary)] text-white shadow-[var(--shadow-sm)]'
            : 'text-[var(--muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]'
        }`;
        const content = (
          <>
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? 'bg-white/20 text-white' : 'bg-[var(--surface-muted)] text-slate-600'
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </>
        );
        if (item.href) {
          return (
            <Link
              key={item.id}
              href={item.href}
              className={className}
              role="tab"
              aria-selected={active}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={className}
            onClick={() => onChange?.(item.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  active,
  children,
  className = '',
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  );
}
