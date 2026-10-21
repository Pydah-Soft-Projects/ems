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
  collegeId?: number | null;
  courseId?: number | null;
  branchId?: number | null;
  collegeName?: string | null;
  courseName?: string | null;
  branchName?: string | null;
  collegeIds?: number[];
  courseIds?: number[];
  branchIds?: number[];
  collegeNames?: string[];
  courseNames?: string[];
  branchNames?: string[];
}

export const LOGIN_METHOD_KEY = 'ems_login_method';

export const CRM_FRONTEND_URL =
  process.env.NEXT_PUBLIC_CRM_FRONTEND_URL ||
  process.env.VITE_CRM_FRONTEND_URL ||
  'https://crm.pydah.edu.in';

export const CRM_BACKEND_URL =
  process.env.NEXT_PUBLIC_CRM_BACKEND_URL ||
  process.env.VITE_CRM_BACKEND_URL ||
  'https://crm.pydah.edu.in';

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export function isSSOLogin(): boolean {
  if (typeof window === 'undefined') return false;
  const fromStorage = localStorage.getItem(LOGIN_METHOD_KEY) === 'sso';
  if (fromStorage) return true;
  if (typeof document !== 'undefined') {
    return document.cookie.split('; ').some((c) => c.trim().startsWith('ems_is_sso=1'));
  }
  return false;
}

export function getLogoutRedirectUrl(fallbackUrl: string = '/login'): string {
  if (isSSOLogin()) {
    return CRM_FRONTEND_URL;
  }
  return fallbackUrl;
}

export function setAuth(token: string, user: AuthUser, isSSO?: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  // Store standard keys for seamless cross-portal compatibility and Portal Switcher auto-detection
  localStorage.setItem('token', token);
  localStorage.setItem('accessToken', token);
  localStorage.setItem('user', JSON.stringify(user));

  const shouldBeSso = isSSO !== undefined ? isSSO : isSSOLogin();
  if (shouldBeSso) {
    localStorage.setItem(LOGIN_METHOD_KEY, 'sso');
    document.cookie = 'ems_is_sso=1; path=/; max-age=86400; SameSite=Lax';
  } else {
    localStorage.removeItem(LOGIN_METHOD_KEY);
    document.cookie = 'ems_is_sso=; path=/; max-age=0; SameSite=Lax';
  }
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
  localStorage.removeItem(LOGIN_METHOD_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  sessionStorage.clear();
  document.cookie = 'ems_token=; path=/; max-age=0';
  document.cookie = 'ems_role=; path=/; max-age=0';
  document.cookie = 'ems_is_sso=; path=/; max-age=0';
}

/**
 * Ensures that if an incoming SSO token is present in the URL query,
 * any previous session is cleared to prevent session collisions.
 */
export function clearIncomingSSOCollision() {
  if (typeof window === 'undefined') return;
  const urlParams = new URLSearchParams(window.location.search);
  const ssoToken = urlParams.get('token');
  if (ssoToken) {
    clearAuth();
  }
}

export function handleLogout(
  router?: { replace: (url: string) => void },
  fallbackUrl: string = '/login',
) {
  if (typeof window === 'undefined') return;
  const isSso = isSSOLogin();
  clearAuth();

  if (isSso) {
    window.location.href = CRM_FRONTEND_URL;
    return;
  }

  if (router) {
    router.replace(fallbackUrl);
  } else {
    window.location.href = fallbackUrl;
  }
}

export const logout = handleLogout;

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
