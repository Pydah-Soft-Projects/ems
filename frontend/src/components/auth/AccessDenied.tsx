'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export function AccessDenied({
  title = 'Access denied',
  description = 'You do not have permission to view this page. Contact an EMS Super Admin if you need access.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-8 text-center shadow-[var(--shadow-sm)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--danger)]">
        Forbidden
      </p>
      <h1 className="mt-2 text-xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
      <div className="mt-5">
        <Link href="/dashboard">
          <Button type="button" variant="secondary">
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
