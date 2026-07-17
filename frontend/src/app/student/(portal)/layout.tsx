'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, clearAuth, getStoredUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { StudentShell } from '@/components/student/StudentShell';
import { LoadingBlock } from '@/components/ui/Spinner';

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
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Loading student portal…" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <StudentShell user={user} onLogout={logout}>
      {children}
    </StudentShell>
  );
}
