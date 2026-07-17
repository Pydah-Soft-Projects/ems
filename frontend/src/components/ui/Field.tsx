import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="mt-1.5 text-xs text-[var(--muted)]">{hint}</p> : null}
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

const controlClass =
  'w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-subtle)] px-3.5 py-2 text-xs text-slate-900 outline-none transition placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus:bg-white focus:ring-2 focus:ring-[var(--ring)] disabled:bg-[var(--surface-muted)] disabled:text-slate-500';

export function Input({
  label,
  error,
  hint,
  id,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <FieldShell label={label} htmlFor={inputId} error={error} hint={hint}>
      <input
        id={inputId}
        className={`${controlClass} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  error,
  hint,
  id,
  className = '',
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const selectId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <FieldShell label={label} htmlFor={selectId} error={error} hint={hint}>
      <select
        id={selectId}
        className={`${controlClass} ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  id,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const areaId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <FieldShell label={label} htmlFor={areaId} error={error} hint={hint}>
      <textarea
        id={areaId}
        className={`${controlClass} min-h-[100px] ${error ? 'border-red-400' : ''} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Checkbox({
  label,
  id,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const checkId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <label htmlFor={checkId} className={`inline-flex items-start gap-2 text-sm text-slate-700 ${className}`}>
      <input
        id={checkId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--ring)]"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
