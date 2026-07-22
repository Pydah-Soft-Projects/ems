export interface PrivilegeItem {
  key: string;
  label: string;
}

export interface PrivilegeGroup {
  id: string;
  label: string;
  privileges: PrivilegeItem[];
}

export interface PrivilegesCatalog {
  groups: PrivilegeGroup[];
  keys: string[];
}

export interface EmsRole {
  id: number;
  name: string;
  description: string | null;
  privileges: string[];
  isSystem: boolean;
  isSystemSuperAdmin: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmsUser {
  id: number;
  hrmsUserId: string;
  hrmsSource: 'user' | 'employee';
  employeeNumber: string | null;
  email: string;
  fullName: string | null;
  isActive: boolean;
  role: EmsRole | null;
  roleId: number;
  /** Effective privileges for this user (not inherited from role at runtime). */
  privileges: string[];
  createdAt?: string;
  updatedAt?: string;
  createdByEmail?: string | null;
  updatedByEmail?: string | null;
}

export interface EmsUserListResponse {
  items: EmsUser[];
  total: number;
  page: number;
  limit: number;
}

export interface HrmsUserOption {
  id: string;
  source: 'user' | 'employee';
  employeeNumber: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  gender: string | null;
  location: string | null;
  dateOfJoining: string | null;
  departmentId: string | null;
  divisionId: string | null;
  designationId: string | null;
  department: string | null;
  division: string | null;
  designation: string | null;
  isActive: boolean;
  isHrmsSuperAdmin: boolean;
  role: string | null;
  roles: string[];
  alreadyProvisioned: boolean;
  isBootstrap: boolean;
}

export interface HrmsUserSearchResponse {
  items: HrmsUserOption[];
  page: number;
  limit: number;
}

export interface EmsAuditLog {
  id: number;
  actorEmail: string | null;
  actorHrmsUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateEmsRoleInput {
  name: string;
  description?: string;
  privileges: string[];
  isActive?: boolean;
}

export interface UpdateEmsRoleInput {
  name?: string;
  description?: string | null;
  privileges?: string[];
  isActive?: boolean;
}

export interface CreateEmsUserInput {
  hrmsUserId: string;
  hrmsSource?: 'user' | 'employee';
  roleId: number;
  privileges?: string[];
  isActive?: boolean;
}

export interface UpdateEmsUserInput {
  roleId?: number;
  isActive?: boolean;
  fullName?: string;
  privileges?: string[];
}
