export const TOKEN_KEY = 'ems_token';
export const USER_KEY = 'ems_user';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: 'super_admin' | 'staff' | 'student';
  email?: string | null;
  emsRoleId?: number | null;
  emsRoleName?: string | null;
  privileges?: string[];
  isSuperAdmin?: boolean;
  hrmsUserId?: string | null;
  hrmsSource?: 'user' | 'employee';
  emsUserId?: number | null;
  pinNo?: string;
  studentId?: number;
  admissionNumber?: string | null;
  mobile?: string | null;
  college?: string | null;
  course?: string | null;
  branch?: string | null;
  batch?: string | null;
  currentYear?: number;
  currentSemester?: number;
  studentStatus?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export function setAuth(token: string, user: AuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  const portalRole =
    user.role === 'student'
      ? 'student'
      : user.isSuperAdmin
        ? 'super_admin'
        : 'staff';
  document.cookie = `ems_token=${token}; path=/; max-age=86400; SameSite=Lax`;
  document.cookie = `ems_role=${portalRole}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = 'ems_token=; path=/; max-age=0';
  document.cookie = 'ems_role=; path=/; max-age=0';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
