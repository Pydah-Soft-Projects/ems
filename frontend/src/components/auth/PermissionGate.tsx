'use client';

import { ReactNode } from 'react';
import { AuthUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export function PermissionGate({
  user,
  privilege,
  children,
  fallback = null,
}: {
  user: AuthUser | null | undefined;
  privilege?: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!can(user, privilege)) return <>{fallback}</>;
  return <>{children}</>;
}
