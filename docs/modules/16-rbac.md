# Module: Role & Permission Management (RBAC)

## Overview (Workflow 14)

Role-Based Access Control for all EMS staff operations.

## Access model (current)

| Who | How they get EMS access |
|-----|-------------------------|
| `ravi@pydahsoft.in` | Bootstrap Super Admin — unrestricted after HRMS password check (no EMS user row required) |
| Other HRMS employees/users | Must be provisioned as an EMS user with exactly one EMS role |
| HRMS Super Admin alone | Does **not** grant EMS access |
| Students | Separate SDMS PIN login (unchanged) |

Passwords always live in HRMS. EMS never stores staff passwords.

The user picker searches both HRMS `employees` and `users` collections by
employee number, name, or email. When both records represent the same person,
the `users` identity is preferred and the duplicate employee record is hidden.

## Roles

| Role | Access |
|------|--------|
| Super Admin (system) | All privileges (`*`). Assignable only by an EMS Super Admin to an HRMS Super Admin account |
| Dynamic roles | Created in User management with a selected privilege set |

An EMS user stores their own effective privilege list. Selecting a role while
creating a user only pre-fills that role's privileges as a template; the saved
privileges live on the user and authorization uses those user-level privileges.
Editing a role later does not rewrite already-provisioned users. Non-Super Admin
operators cannot grant privileges they do not possess themselves.

## Privilege catalog

Keys live in `backend/src/auth/permissions.js`, grouped as:

- Dashboard
- Regulations
- Subjects & mappings
- Organization / students (SDMS)
- Examinations (read/write/submit/approve/publish/hall tickets/results/analytics)
- Fees & payments
- Remuneration / professionals
- Settings (payment gateway)
- User management (users/roles/super_admin/audit)

## APIs

| Method | Path | Privilege |
|--------|------|-----------|
| GET | `/api/user-management/privileges` | roles:read / users:write |
| GET/POST/PATCH/DELETE | `/api/user-management/roles` | roles:* |
| GET/POST/PATCH | `/api/user-management/users` | users:* |
| GET | `/api/user-management/hrms-users` | users:write |
| GET | `/api/user-management/audit-logs` | audit:read |

Staff login (`POST /api/auth/login`) returns `role`, `emsRoleName`, `privileges`, `isSuperAdmin`.
`/api/auth/me` re-resolves EMS access on every call so privilege changes apply immediately.

## Frontend

- `/dashboard/user-management` — roles, HRMS user picker, Super Admin assignment
- Sidebar / page guards filter by privileges
- Exam action buttons (edit/submit/approve/publish/release) gated by privilege

## Status

✅ **Implemented**
