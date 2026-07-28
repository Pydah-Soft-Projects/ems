'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthUser, getStoredUser, setAuth, getToken, clearAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { findNavItem } from '@/config/navigation';
import { api } from '@/lib/api';
import { Sidebar } from './Sidebar';
import { AccessDenied } from '@/components/auth/AccessDenied';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const stored = getStoredUser();
      if (!stored) {
        router.replace('/login');
        return;
      }
      if (stored.role === 'student') {
        router.replace('/student');
        return;
      }
      try {
        const me = await api.me();
        const token = getToken();
        if (token) setAuth(token, me);
        setUser(me);
      } catch {
        clearAuth();
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }
    void loadUser();
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [children]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--muted)]">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const navItem = findNavItem(pathname);
  const allowed = !navItem || can(user, navItem.privilege);

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-[260px]">
        <Sidebar user={user} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 w-[260px] shadow-[var(--shadow-lg)]">
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-[260px]">
        <main className="flex-1 px-3 py-3 sm:px-5 sm:py-5 lg:px-6 lg:py-6 xl:px-8 2xl:px-10">
          <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px]">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--sidebar-text)] shadow-[var(--shadow-sm)] sm:mb-4 lg:hidden"
              aria-label="Open menu"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
            <div className="w-full">
              {allowed ? children : <AccessDenied />}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
