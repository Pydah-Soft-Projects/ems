export function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'primary';
}) {
  const styles = {
    default: 'bg-slate-100 text-slate-600',
    success: 'bg-emerald-50 text-emerald-700',
    primary: 'bg-[var(--primary-soft)] text-[var(--primary)]',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  );
}
