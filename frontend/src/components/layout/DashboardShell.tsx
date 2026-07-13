'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, getStoredUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
      try {
        await api.me();
        setUser(stored);
      } catch {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [children]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          <p className="text-sm text-[var(--muted)]">Loading portal...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-[260px]">
        <Sidebar user={user} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 w-[260px] shadow-2xl">
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-[260px]">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
