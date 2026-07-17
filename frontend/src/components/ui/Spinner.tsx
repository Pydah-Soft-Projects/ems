export function Spinner({
  className = '',
  label = 'Loading',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-sm text-[var(--muted)] ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16">
      <Spinner />
      <p className="text-sm text-[var(--muted)]">{label}</p>
    </div>
  );
}
