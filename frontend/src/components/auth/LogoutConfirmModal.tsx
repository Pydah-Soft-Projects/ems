'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { isSSOLogin, handleLogout, CRM_FRONTEND_URL } from '@/lib/auth';

export interface LogoutConfirmModalProps {
  open: boolean;
  onClose: () => void;
  fallbackUrl?: string;
  onConfirm?: () => void;
}

export function LogoutConfirmModal({
  open,
  onClose,
  fallbackUrl = '/login',
  onConfirm,
}: LogoutConfirmModalProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSSO, setIsSSO] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setIsSSO(isSSOLogin());
      setIsLoggingOut(false);
    }
  }, [open]);

  // Handle keyboard events (ESC to close)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoggingOut) {
        onClose();
      }
    },
    [isLoggingOut, onClose],
  );

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    // Focus modal container
    modalRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  async function handleConfirmLogout() {
    setIsLoggingOut(true);
    if (onConfirm) {
      try {
        await onConfirm();
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    // Perform redirect and clear auth
    handleLogout(router, fallbackUrl);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      aria-describedby="logout-modal-desc"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
        onClick={() => {
          if (!isLoggingOut) onClose();
        }}
      />

      {/* Modal Dialog Card */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 sm:p-7 text-left shadow-2xl ring-1 ring-slate-900/10 transition-all outline-none animate-in zoom-in-95 duration-200"
      >
        {/* Header Icon + Close */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-8 ring-red-50/50">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
          </div>

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={onClose}
            aria-label="Close confirmation dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Title and Descriptions */}
        <div className="mt-4">
          <h3
            id="logout-modal-title"
            className="text-lg font-bold text-slate-900 sm:text-xl"
          >
            Are you sure you want to log out?
          </h3>

          <p id="logout-modal-desc" className="mt-2 text-sm leading-relaxed text-slate-600">
            {isSSO
              ? 'You are currently logged in via CRM Single Sign-On (SSO). Logging out will terminate your session and return you to the CRM Portal.'
              : 'You will be signed out of the Examination Management System. You will need to enter your credentials again to log back in.'}
          </p>

          {/* SSO Info Callout Badge */}
          {isSSO ? (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                </span>
                <span className="font-semibold text-blue-950">SSO Redirect Target:</span>
                <span className="truncate text-blue-800 font-mono">
                  {CRM_FRONTEND_URL.replace(/^https?:\/\//, '')}
                </span>
              </div>
              <svg
                className="h-3.5 w-3.5 flex-shrink-0 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
            </div>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            id="cancel-logout-btn"
            disabled={isLoggingOut}
            onClick={onClose}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400/20 active:scale-[0.98] transition disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            id="confirm-logout-btn"
            disabled={isLoggingOut}
            onClick={handleConfirmLogout}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/20 hover:from-red-700 hover:to-rose-700 focus:outline-none focus:ring-2 focus:ring-red-500 active:scale-[0.98] transition disabled:opacity-60"
          >
            {isLoggingOut ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin text-white flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>{isSSO ? 'Redirecting to CRM…' : 'Logging out…'}</span>
              </>
            ) : isSSO ? (
              'Log Out & Return to CRM'
            ) : (
              'Log Out'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
