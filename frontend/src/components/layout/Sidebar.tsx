'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { AuthUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { findNavItem, navigation } from '@/config/navigation';
import { NavIcon } from '@/components/icons/NavIcon';
import { BrandLockup } from '@/components/brand/BrandLogo';
import { LogoutConfirmModal } from '@/components/auth/LogoutConfirmModal';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface SidebarProps {
  user: AuthUser;
  collapsed?: boolean;
  onNavigate?: () => void;
  onLogout?: () => void;
}

export function Sidebar({ user, collapsed = false, onNavigate, onLogout }: SidebarProps) {
  const pathname = usePathname();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const activeItem = findNavItem(pathname);
  const visibleGroups = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => can(user, item.privilege)),
    }))
    .filter((group) => group.items.length > 0);

  function handleSignOutClick() {
    if (onLogout) {
      onLogout();
    } else {
      setIsModalOpen(true);
    }
  }

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-text)] transition-[width] duration-200 ${
        collapsed ? 'w-[84px]' : 'w-[260px]'
      }`}
    >
      <div
        className={`border-b border-[var(--sidebar-border)] ${collapsed ? 'px-3 py-4' : 'px-4 py-4'}`}
      >
        <BrandLockup
          title="Examination Portal"
          subtitle="Management System"
          collapsed={collapsed}
        />
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
        {visibleGroups.map((group) => (
          <div key={group.title} className="mb-4 last:mb-0">
            {!collapsed ? (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">
                {group.title}
              </p>
            ) : (
              <div className="mb-2 h-px bg-[var(--sidebar-border)]" />
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = activeItem?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={`group flex items-center rounded-[var(--radius)] text-xs font-semibold transition ${
                        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'
                      } ${
                        active
                          ? 'bg-[var(--sidebar-active-soft)] text-[var(--sidebar-active)] shadow-[var(--shadow-sm)]'
                          : 'hover:bg-[var(--sidebar-hover)] hover:text-[var(--primary)]'
                      }`}
                    >
                      <span className={active ? 'text-[var(--primary)]' : 'text-[var(--text-subtle)] group-hover:text-[var(--primary)]'}>
                        <NavIcon name={item.icon} />
                      </span>
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`border-t border-[var(--sidebar-border)] ${collapsed ? 'p-3' : 'p-4'}`}>
        <div
          className={`flex items-center rounded-[var(--radius)] bg-[var(--surface-subtle)] ${
            collapsed ? 'justify-center p-2' : 'gap-3 p-3'
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] text-sm font-bold text-white">
            {getInitials(user.fullName)}
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user.fullName}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {user.emsRoleName || (user.isSuperAdmin ? 'Super Admin' : user.role)}
              </p>
              <p className="truncate text-[10px] text-[var(--muted)]">{user.username}</p>
            </div>
          ) : null}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={handleSignOutClick}
            title="Sign out"
            aria-label="Sign out"
            className="mt-2 flex w-full justify-center rounded-[var(--radius)] p-2 text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSignOutClick}
            className="mt-2 w-full rounded-[var(--radius)] px-3 py-2 text-left text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
          >
            Sign out
          </button>
        )}
      </div>

      <LogoutConfirmModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        fallbackUrl="/login"
      />
    </aside>
  );
}
