'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, clearAuth, getStoredUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { StudentShell } from '@/components/student/StudentShell';
import { LoadingBlock } from '@/components/ui/Spinner';
import { LogoutConfirmModal } from '@/components/auth/LogoutConfirmModal';

export default function StudentPortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingBlock label="Loading student portal…" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      <StudentShell user={user} onLogout={() => setIsLogoutModalOpen(true)}>
        {children}
      </StudentShell>
      <LogoutConfirmModal
        open={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        fallbackUrl="/student/login"
      />
    </>
  );
}
