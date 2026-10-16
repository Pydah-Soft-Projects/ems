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
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onLogout?: () => void;
}

export function Sidebar({
  user,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  onLogout,
}: SidebarProps) {
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
        className={`flex items-center border-b border-[var(--sidebar-border)] ${
          collapsed
            ? 'flex-col gap-2 px-2 py-3.5 justify-center'
            : 'justify-between px-3.5 py-3.5'
        }`}
      >
        <BrandLockup
          title="Examination Portal"
          subtitle="Management System"
          collapsed={collapsed}
          size="sm"
        />
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Open sidebar' : 'Close sidebar'}
            aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
            className="cursor-pointer inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-2xs transition hover:bg-slate-50 hover:text-slate-800 active:scale-95"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${
                collapsed ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
              />
            </svg>
          </button>
        ) : null}
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
            collapsed ? 'justify-center p-2' : 'gap-2.5 p-2.5'
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] text-sm font-bold text-white shadow-xs">
            {getInitials(user.fullName)}
          </div>
          {!collapsed ? (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 leading-tight">
                  {user.fullName}
                </p>
                <p className="truncate text-xs text-[var(--muted)] mt-0.5">
                  {user.emsRoleName || (user.isSuperAdmin ? 'Super Admin' : user.role)}
                </p>
                <p className="truncate text-[10px] text-[var(--muted)]">{user.username}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOutClick}
                title="Logout"
                aria-label="Logout"
                className="cursor-pointer inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-2xs transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 active:scale-95"
              >
                <svg
                  className="h-4 w-4"
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
            </>
          ) : null}
        </div>
        {collapsed ? (
          <button
            type="button"
            onClick={handleSignOutClick}
            title="Sign out"
            aria-label="Sign out"
            className="cursor-pointer mt-2 flex w-full justify-center rounded-[var(--radius)] border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
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
        ) : null}
      </div>

      <LogoutConfirmModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        fallbackUrl="/login"
      />
    </aside>
  );
}
