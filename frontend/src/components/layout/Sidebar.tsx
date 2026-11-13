'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ScrollText,
  Sliders,
  BookOpen,
  Building2,
  ClipboardList,
  GraduationCap,
  Calendar,
  RefreshCw,
  Award,
  Upload,
  FileCheck2,
  Copy,
  BarChart3,
  FileStack,
  Receipt,
  CreditCard,
  Layers,
  ArrowLeftRight,
  Briefcase,
  Settings,
  Clock,
  PieChart,
  Users,
  ChevronLeft,
  ChevronRight,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { AuthUser } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { findNavItem, navigation } from '@/config/navigation';
import { LogoutConfirmModal } from '@/components/auth/LogoutConfirmModal';

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  regulations: ScrollText,
  'regulation-internals': Sliders,
  subjects: BookOpen,
  organization: Building2,
  'internal-exams': ClipboardList,
  exams: GraduationCap,
  'exam-calendar': Calendar,
  revaluations: RefreshCw,
  'internal-marks': Award,
  'marks-upload': Upload,
  'total-marks': FileCheck2,
  results: Award,
  'student-results': Award,
  'duplicate-hall-tickets': Copy,
  'subject-reports': BarChart3,
  'application-reports': FileStack,
  remuneration: Receipt,
  fees: CreditCard,
  'fee-heads': Layers,
  reconcile: ArrowLeftRight,
  professionals: Briefcase,
  settings: Settings,
  'due-management': Clock,
  reports: PieChart,
  'payment-reports': PieChart,
  users: Users,
};

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
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

  useEffect(() => {
    const fontId = 'campo-plus-jakarta-font';
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

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
      className={`relative flex h-full shrink-0 flex-col border-r transition-all duration-200 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
      style={{
        backgroundColor: 'var(--sidebar)',
        color: 'var(--sidebar-text)',
        borderColor: 'var(--border)',
        fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Floating circular collapse button */}
      {onToggleCollapse ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden lg:flex items-center justify-center absolute -right-3 top-[106px] z-50 w-6 h-6 rounded-full shadow-md border transition-transform hover:scale-105 cursor-pointer focus:outline-none"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {collapsed ? (
            <ChevronRight size={14} className="stroke-[2.5]" />
          ) : (
            <ChevronLeft size={14} className="stroke-[2.5]" />
          )}
        </button>
      ) : null}

      {/* Top Header */}
      <div
        className={`relative flex shrink-0 flex-col items-center justify-center text-center pt-6 pb-4 border-b px-3 ${
          collapsed ? 'min-h-[91px] px-2' : ''
        }`}
        style={{ borderColor: 'var(--border)' }}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex flex-col items-center justify-center focus:outline-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              collapsed
                ? '/campo-logos/icon-192.png'
                : '/campo-logos/campo_logo_transparent_hq.png'
            }
            alt="Campo Examination Management"
            style={collapsed ? undefined : { maxWidth: '120px' }}
            className={`mx-auto object-contain transition-all duration-200 ${
              collapsed ? 'h-8 w-8 rounded-lg' : 'h-7'
            }`}
          />
          {!collapsed ? (
            <span
              className="mt-1.5 text-xs font-medium tracking-wide"
              style={{ color: 'var(--sidebar-muted)' }}
            >
              Examination Management
            </span>
          ) : null}
        </Link>
      </div>

      {/* Navigation Groups */}
      <nav className="sidebar-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4">
        {visibleGroups.map((group) => (
          <div key={group.title} className="mb-4 last:mb-0">
            {!collapsed ? (
              <p
                className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--sidebar-muted)' }}
              >
                {group.title}
              </p>
            ) : (
              <div
                className="my-2 mx-auto w-6 h-px"
                style={{ backgroundColor: 'var(--border)' }}
              />
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = activeItem?.href === item.href;
                const IconComponent = iconMap[item.icon] || LayoutDashboard;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={`group flex items-center gap-3 rounded-[10px] transition-colors ${
                        collapsed
                          ? 'mx-auto flex h-10 w-10 items-center justify-center'
                          : 'px-3.5 py-2.5 text-[13.5px]'
                      } ${
                        active
                          ? 'font-semibold shadow-sm'
                          : 'font-medium hover:bg-white/10'
                      }`}
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--primary)',
                              color: 'var(--sidebar-text)',
                            }
                          : {
                              color: 'var(--sidebar-text)',
                            }
                      }
                    >
                      <IconComponent
                        className={`h-[18px] w-[18px] shrink-0 transition-colors stroke-[1.85] ${
                          active
                            ? ''
                            : 'opacity-75 group-hover:opacity-100'
                        }`}
                        style={
                          active
                            ? { color: 'var(--sidebar-text)' }
                            : { color: 'var(--sidebar-muted)' }
                        }
                      />
                      {!collapsed ? (
                        <span className="truncate">{item.label}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User Profile Card */}
      <div
        className={`shrink-0 pt-2 pb-3 ${
          collapsed ? 'px-2' : 'px-3'
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-xs"
              style={{
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
              }}
              title={user.fullName}
            >
              {getInitials(user.fullName)}
            </div>
            <button
              type="button"
              onClick={handleSignOutClick}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-lg cursor-pointer transition hover:bg-white/10"
              style={{ color: 'var(--sidebar-muted)' }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--primary-light) 10%, var(--sidebar))',
              borderColor:
                'color-mix(in srgb, var(--border) 25%, transparent)',
            }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-xs"
              style={{
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
              }}
            >
              {getInitials(user.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-xs font-bold uppercase tracking-wide leading-tight"
                style={{ color: 'var(--sidebar-text)' }}
              >
                {user.fullName}
              </p>
              <p
                className="truncate text-[11px] font-medium mt-0.5"
                style={{ color: 'var(--sidebar-muted)' }}
              >
                {user.emsRoleName || (user.isSuperAdmin ? 'Superadmin' : user.role)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOutClick}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 cursor-pointer"
              style={{ color: 'var(--sidebar-muted)' }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 shrink-0" />
            </button>
          </div>
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
