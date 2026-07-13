'use client';

import { ReactNode, useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === 'xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-xl' : 'max-w-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        className={`relative w-full ${width} rounded-2xl border border-[var(--border)] bg-white shadow-2xl`}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
