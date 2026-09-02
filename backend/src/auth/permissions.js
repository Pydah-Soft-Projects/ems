'use strict';

/**
 * Fixed privilege catalog for EMS RBAC.
 * Keys are stored on roles; Super Admin implicitly has every privilege.
 */

const PRIVILEGE_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    privileges: [
      { key: 'dashboard:view', label: 'View dashboard' },
    ],
  },
  {
    id: 'regulations',
    label: 'Regulations',
    privileges: [
      { key: 'regulations:read', label: 'View regulations' },
      { key: 'regulations:write', label: 'Create / edit regulations' },
      { key: 'regulations:delete', label: 'Delete regulations' },
    ],
  },
  {
    id: 'subjects',
    label: 'Subjects & mappings',
    privileges: [
      { key: 'subjects:read', label: 'View subjects' },
      { key: 'subjects:write', label: 'Create / edit subjects' },
      { key: 'subjects:delete', label: 'Delete subjects' },
      { key: 'mappings:read', label: 'View subject mappings' },
      { key: 'mappings:write', label: 'Create / edit subject mappings' },
      { key: 'mappings:delete', label: 'Delete subject mappings' },
    ],
  },
  {
    id: 'organization',
    label: 'Organization (SDMS)',
    privileges: [
      { key: 'organization:read', label: 'View colleges / courses / branches' },
      { key: 'students:read', label: 'View students' },
    ],
  },
  {
    id: 'exams',
    label: 'Examinations',
    privileges: [
      { key: 'exams:read', label: 'View examinations' },
      { key: 'exams:write', label: 'Create / edit examinations' },
      { key: 'exams:submit', label: 'Submit examinations for approval' },
      { key: 'exams:approve', label: 'Approve / reject examinations' },
      { key: 'exams:publish', label: 'Publish examinations' },
      { key: 'exams:hall_tickets', label: 'Release / view hall tickets' },
      { key: 'exams:results', label: 'Upload / view examination results' },
      { key: 'exams:analytics', label: 'View examination analytics' },
    ],
  },
  {
    id: 'duplicate_hall_tickets',
    label: 'Duplicate hall tickets',
    privileges: [
      {
        key: 'exams:duplicate_hall_tickets:raise',
        label: 'Raise duplicate hall ticket request & collect fee',
      },
      {
        key: 'exams:duplicate_hall_tickets:print',
        label: 'Print paid duplicate hall tickets',
      },
    ],
  },
  {
    id: 'fees',
    label: 'Fees & payments',
    privileges: [
      { key: 'fees:read', label: 'View fee records & payments' },
      { key: 'fees:collect', label: 'Collect offline payments' },
      { key: 'fees:apply', label: 'Apply for exams on behalf of students' },
      {
        key: 'fees:reconcile',
        label: 'Upload merchant statements & verify Self Online payments',
      },
      {
        key: 'fees:due_override',
        label: 'Override overdue fee dues for exam apply / hall tickets',
      },
    ],
  },
  {
    id: 'remuneration',
    label: 'Remuneration',
    privileges: [
      { key: 'remuneration:read', label: 'View remuneration bills' },
      { key: 'remuneration:write', label: 'Create / edit remuneration bills' },
      { key: 'remuneration:delete', label: 'Delete remuneration bills' },
      { key: 'professionals:read', label: 'View professionals directory' },
      { key: 'professionals:write', label: 'Manage professionals directory' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    privileges: [
      { key: 'settings:payments', label: 'Manage payment gateway settings' },
    ],
  },
  {
    id: 'users',
    label: 'User management',
    privileges: [
      { key: 'users:read', label: 'View EMS users' },
      { key: 'users:write', label: 'Create / update EMS users' },
      { key: 'roles:read', label: 'View EMS roles' },
      { key: 'roles:write', label: 'Create / update EMS roles' },
      { key: 'users:super_admin', label: 'Assign EMS Super Admin role' },
      { key: 'audit:read', label: 'View user-management audit log' },
    ],
  },
];

const ALL_PRIVILEGE_KEYS = PRIVILEGE_GROUPS.flatMap((g) =>
  g.privileges.map((p) => p.key),
);

const PRIVILEGE_SET = new Set(ALL_PRIVILEGE_KEYS);

const SYSTEM_SUPER_ADMIN_ROLE_NAME = 'Super Admin';
const BOOTSTRAP_SUPER_ADMIN_EMAIL = 'ravi@pydahsoft.in';

function isKnownPrivilege(key) {
  return PRIVILEGE_SET.has(key);
}

function normalizePrivilegeList(raw) {
  if (!Array.isArray(raw)) return [];
  const unique = [];
  const seen = new Set();
  for (const item of raw) {
    const key = String(item ?? '').trim();
    if (!key || !isKnownPrivilege(key) || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return unique;
}

function hasPrivilege(privileges, key) {
  if (!key) return true;
  if (!Array.isArray(privileges)) return false;
  if (privileges.includes('*')) return true;
  return privileges.includes(key);
}

function hasAnyPrivilege(privileges, keys) {
  if (!keys?.length) return true;
  return keys.some((key) => hasPrivilege(privileges, key));
}

module.exports = {
  PRIVILEGE_GROUPS,
  ALL_PRIVILEGE_KEYS,
  SYSTEM_SUPER_ADMIN_ROLE_NAME,
  BOOTSTRAP_SUPER_ADMIN_EMAIL,
  isKnownPrivilege,
  normalizePrivilegeList,
  hasPrivilege,
  hasAnyPrivilege,
};
