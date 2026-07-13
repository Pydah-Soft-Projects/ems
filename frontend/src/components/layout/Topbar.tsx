'use client';

import { usePathname } from 'next/navigation';
import { findNavItem } from '@/config/navigation';
import { Button } from '@/components/ui/Button';
import { clearAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const current = findNavItem(pathname);

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--border)] bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <div>
          <p className="text-xs font-medium text-[var(--muted)]">Super Admin</p>
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
            {current?.label ?? 'Dashboard'}
          </h2>
        </div>
      </div>

      <Button variant="secondary" onClick={handleLogout} className="!py-2 !px-3.5">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
        </svg>
        <span className="hidden sm:inline">Logout</span>
      </Button>
    </header>
  );
}
