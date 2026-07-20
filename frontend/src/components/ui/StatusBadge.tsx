import { Badge } from './Badge';

const statusMap: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'primary' }
> = {
  draft: { label: 'Draft', variant: 'default' },
  pending_approval: { label: 'Pending approval', variant: 'warning' },
  published: { label: 'Published', variant: 'success' },
  closed: { label: 'Closed', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  pending: { label: 'Pending', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  unpaid: { label: 'Unpaid', variant: 'danger' },
  void: { label: 'Void', variant: 'default' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  submitted: { label: 'Submitted', variant: 'primary' },
  passed: { label: 'Passed', variant: 'success' },
};

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const mapped = statusMap[key] || {
    label: status,
    variant: 'default' as const,
  };
  return <Badge variant={mapped.variant}>{mapped.label}</Badge>;
}

export function Money({
  amount,
  className = '',
}: {
  amount: number | string | null | undefined;
  className?: string;
}) {
  const value = Number(amount || 0);
  return (
    <span className={`font-semibold tabular-nums ${className}`}>
      ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
