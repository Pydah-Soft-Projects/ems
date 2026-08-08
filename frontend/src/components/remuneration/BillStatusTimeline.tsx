'use client';

import {
  BILL_STATUS_ACTIONS,
  BILL_STATUS_FLOW,
  BILL_STATUS_LABELS,
  RemunerationBill,
  RemunerationBillStatus,
  RemunerationStatusEvent,
} from '@/types/remuneration';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatIST } from '@/lib/formatIST';

function formatWhen(iso: string) {
  try {
    return formatIST(iso);
  } catch {
    return iso;
  }
}

function actionTitle(event: RemunerationStatusEvent) {
  if (event.action === 'created') return 'Bill created';
  if (event.action === 'updated') return 'Details updated';
  if (event.action === 'status_changed') {
    const to = BILL_STATUS_LABELS[event.status] || event.status;
    if (event.fromStatus) {
      const from = BILL_STATUS_LABELS[event.fromStatus] || event.fromStatus;
      return `${from} → ${to}`;
    }
    return `Status set to ${to}`;
  }
  return event.note || event.action;
}

export function BillStatusActions({
  status,
  busy,
  onChange,
}: {
  status: RemunerationBillStatus;
  busy?: boolean;
  onChange: (next: RemunerationBillStatus) => void;
}) {
  if (status === 'paid') {
    return (
      <p className="text-xs text-[var(--muted)]">
        This bill is paid and locked. Status cannot be changed.
      </p>
    );
  }

  const next = BILL_STATUS_ACTIONS.find((a) => a.from === status);
  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap gap-1.5">
        {BILL_STATUS_FLOW.map((step) => {
          const currentIdx = BILL_STATUS_FLOW.indexOf(status);
          const stepIdx = BILL_STATUS_FLOW.indexOf(step);
          const done = stepIdx < currentIdx;
          const active = step === status;
          return (
            <li
              key={step}
              className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                active
                  ? 'bg-[var(--primary)] text-white'
                  : done
                    ? 'bg-[var(--success-soft)] text-[var(--success)]'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {BILL_STATUS_LABELS[step]}
            </li>
          );
        })}
      </ol>
      {next ? (
        <Button
          loading={busy}
          onClick={() => onChange(next.to)}
          className="w-full sm:w-auto"
        >
          {next.label}
        </Button>
      ) : null}
    </div>
  );
}

export function BillStatusTimeline({
  bill,
}: {
  bill: Pick<RemunerationBill, 'statusHistory' | 'createdAt' | 'status'>;
}) {
  const events: RemunerationStatusEvent[] = Array.isArray(bill.statusHistory)
    ? [...bill.statusHistory].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
      )
    : [
        {
          action: 'created',
          status: bill.status,
          by: 'Unknown',
          at: bill.createdAt,
          note: 'Bill created',
        },
      ];

  return (
    <ol className="relative space-y-0 border-l border-[var(--border)] pl-4">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="relative pb-5 last:pb-0">
          <span
            className={`absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${
              index === events.length - 1
                ? 'bg-[var(--primary)]'
                : 'bg-[var(--success)]'
            }`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-slate-900">
              {actionTitle(event)}
            </p>
            <StatusBadge status={event.status} />
          </div>
          <p className="mt-0.5 text-[0.6875rem] text-[var(--muted)]">
            by <span className="font-medium text-slate-700">{event.by}</span>
            {event.byUsername ? ` (@${event.byUsername})` : ''}
            {' · '}
            {formatWhen(event.at)}
          </p>
          {event.note && event.action !== 'status_changed' ? (
            <p className="mt-1 text-[0.6875rem] text-slate-600">{event.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
