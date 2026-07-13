'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthUser } from '@/lib/auth';
import { navigation } from '@/config/navigation';
import { NavIcon } from '@/components/icons/NavIcon';
import { Badge } from '@/components/ui/Badge';

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
  onNavigate?: () => void;
}

export function Sidebar({ user, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-[var(--sidebar)] text-white">
      {/* Brand */}
      <div className="border-b border-[var(--sidebar-border)] px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold shadow-lg shadow-blue-500/20">
            EMS
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Examination Portal</p>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((group) => (
          <div key={group.title} className="mb-5 last:mb-0">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                        active
                          ? 'bg-[var(--primary)] text-white shadow-md shadow-blue-500/25'
                          : 'text-slate-300 hover:bg-[var(--sidebar-hover)] hover:text-white'
                      }`}
                    >
                      <span className={active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}>
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="truncate">{item.label}</span>
                      {active && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-[var(--sidebar-border)] p-4">
        <div className="flex items-center gap-3 rounded-xl bg-[var(--sidebar-hover)] p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold">
            {getInitials(user.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-slate-400">{user.username}</p>
            <div className="mt-1.5">
              <Badge variant="success">Super Admin</Badge>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
