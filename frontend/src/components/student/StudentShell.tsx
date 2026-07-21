'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthUser } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import {
  isStudentNavActive,
  studentNavigation,
} from '@/config/studentNavigation';
import { StudentNavIcon } from './StudentNavIcon';
import { BrandLogo } from '@/components/brand/BrandLogo';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function StudentShell({
  user,
  onLogout,
  children,
}: {
  user: AuthUser;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[var(--background)] pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-white/85 backdrop-blur-xl print:hidden">
        <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/student" className="flex items-center gap-3">
            <BrandLogo size="md" />
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-bold text-slate-900">Student Portal</p>
              <p className="truncate text-xs text-[var(--muted)]">
                {user.fullName}
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Student">
            {studentNavigation.map((item) => {
              const active = isStudentNavActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? 'text-[var(--primary)]'
                      : 'text-[var(--muted)] hover:text-slate-800'
                  }`}
                >
                  <StudentNavIcon name={item.icon} className="h-4 w-4" />
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--primary)]" />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-white py-1 pl-1 pr-3 shadow-[var(--shadow-sm)] sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] text-[10px] font-bold text-white">
                {getInitials(user.fullName)}
              </div>
              <span className="text-xs font-medium text-[var(--muted)]">
                PIN {user.pinNo || user.username}
              </span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-5 sm:px-6 sm:py-6">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-white/95 px-2 py-2 backdrop-blur-xl lg:hidden print:hidden"
        aria-label="Student mobile"
      >
        <ul className="mx-auto grid w-full max-w-none grid-cols-6 gap-1 px-2">
          {studentNavigation.map((item) => {
            const active = isStudentNavActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-semibold transition ${
                    active
                      ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                      : 'text-slate-500'
                  }`}
                >
                  <StudentNavIcon name={item.icon} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
