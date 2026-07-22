export type PrivilegeKey = string;

export function can(
  user: { privileges?: string[]; isSuperAdmin?: boolean } | null | undefined,
  privilege?: PrivilegeKey | PrivilegeKey[],
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (!privilege) return true;
  const needed = Array.isArray(privilege) ? privilege : [privilege];
  if (needed.length === 0) return true;
  const have = user.privileges ?? [];
  if (have.includes('*')) return true;
  return needed.some((p) => have.includes(p));
}

export function canAll(
  user: { privileges?: string[]; isSuperAdmin?: boolean } | null | undefined,
  privileges: PrivilegeKey[],
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const have = user.privileges ?? [];
  if (have.includes('*')) return true;
  return privileges.every((p) => have.includes(p));
}
