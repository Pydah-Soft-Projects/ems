export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'primary' | 'warning' | 'danger' | 'accent';
}) {
  const styles = {
    default: 'bg-[var(--surface-muted)] text-[var(--sidebar-text)]',
    success: 'bg-[var(--success-soft)] text-emerald-700',
    primary: 'bg-[var(--primary-soft)] text-[var(--primary)]',
    warning: 'bg-[var(--warning-soft)] text-amber-800',
    danger: 'bg-[var(--danger-soft)] text-rose-700',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent-hover)]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
