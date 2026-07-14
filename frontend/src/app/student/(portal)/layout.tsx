'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthUser, clearAuth, getStoredUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

export default function StudentPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function boot() {
      const stored = getStoredUser();
      if (!stored || stored.role !== 'student') {
        router.replace('/student/login');
        return;
      }
      try {
        await api.me();
        setUser(stored);
      } catch {
        clearAuth();
        router.replace('/student/login');
      } finally {
        setLoading(false);
      }
    }
    void boot();
  }, [router]);

  function logout() {
    clearAuth();
    router.replace('/student/login');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/student" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white">
              EMS
            </span>
            <div>
              <p className="text-sm font-bold text-slate-900">Student Portal</p>
              <p className="text-xs text-[var(--muted)]">{user.fullName}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              PIN {user.pinNo || user.username}
            </span>
            <Button type="button" variant="secondary" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
