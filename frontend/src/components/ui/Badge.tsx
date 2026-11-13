export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'primary' | 'secondary' | 'warning' | 'danger' | 'accent';
}) {
  const styles = {
    default: 'bg-[var(--border)] text-[var(--text-secondary)]',
    success: 'bg-[var(--success-light)] text-[var(--success)]',
    primary: 'bg-[var(--primary-light)] text-[var(--primary)]',
    secondary: 'bg-[var(--primary-light)] text-[var(--secondary)]',
    warning: 'bg-[var(--warning-light)] text-[var(--warning)]',
    danger: 'bg-[var(--danger-light)] text-[var(--danger)]',
    accent: 'bg-[var(--primary-light)] text-[var(--accent)]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
