'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { findNavItem } from '@/config/navigation';
import { Button } from '@/components/ui/Button';
import { SoftSearchField } from '@/components/ui/SoftSearch';
import { AuthUser } from '@/lib/auth';
import { LogoutConfirmModal } from '@/components/auth/LogoutConfirmModal';

interface TopbarProps {
  user: AuthUser;
  onMenuClick: () => void;
  onCollapseClick: () => void;
  collapsed: boolean;
  onLogout?: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Topbar({
  user,
  onMenuClick,
  onCollapseClick,
  collapsed,
  onLogout,
}: TopbarProps) {
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const current = findNavItem(pathname);

  function handleLogoutClick() {
    if (onLogout) {
      onLogout();
    } else {
      setIsModalOpen(true);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[var(--border)] bg-white/85 px-4 backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-full p-2 text-[var(--sidebar-text)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
        <button
          type="button"
          onClick={onCollapseClick}
          className="hidden rounded-full p-2 text-[var(--sidebar-text)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] lg:inline-flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <MenuIcon />
        </button>

        <div className="hidden min-w-0 md:block">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Staff portal
          </p>
          <h2 className="truncate text-sm font-semibold text-slate-900">
            {current?.label ?? 'Dashboard'}
          </h2>
        </div>

        <SoftSearchField
          className="ml-2 hidden max-w-md flex-1 lg:block"
          placeholder="Search modules, students, exams…"
          aria-label="Search portal"
          readOnly
          onFocus={(e) => e.currentTarget.blur()}
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-white py-1 pl-1 pr-3 shadow-[var(--shadow-sm)] sm:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] text-[0.6875rem] font-bold text-white">
            {getInitials(user.fullName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-900">
              {user.fullName.split(' ')[0]}
            </p>
            <p className="flex items-center gap-1 text-[11px] text-[var(--muted)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Super Admin
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogoutClick}>
          Logout
        </Button>
      </div>

      <LogoutConfirmModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        fallbackUrl="/login"
      />
    </header>
  );
}

function MenuIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
