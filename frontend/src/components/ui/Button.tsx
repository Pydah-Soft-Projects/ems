import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'accent';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--primary-hover)] hover:shadow-[var(--shadow-md)]',
  secondary:
    'border border-[var(--border)] bg-white text-slate-700 shadow-[var(--shadow-sm)] hover:bg-[var(--surface-subtle)]',
  ghost: 'text-[var(--sidebar-text)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]',
  danger: 'bg-[var(--danger)] text-white hover:bg-rose-700',
  success: 'bg-[var(--success)] text-white hover:bg-[var(--accent-hover)]',
  warning: 'bg-[var(--warning)] text-white hover:bg-amber-600',
  accent: 'bg-[var(--accent)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)]',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[0.6875rem] rounded-full',
  md: 'px-4 py-2 text-xs rounded-full',
  lg: 'px-5 py-2.5 text-xs rounded-full',
  icon: 'h-9 w-9 rounded-full p-0',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
