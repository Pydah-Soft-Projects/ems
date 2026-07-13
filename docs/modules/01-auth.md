# Module: Auth

## Purpose

Super Admin authentication for the Examination Portal using HRMS MongoDB users. Students and other roles will authenticate via SDMS later.

## Current implementation

- **Backend:** `backend/src/auth/`
- **Frontend:** `frontend/src/app/login/`
- **HRMS:** MongoDB `users` collection (read-only)

## Functional flow

1. User opens login page
2. Enters HRMS email + password
3. Backend finds user by `email` (password field `select: false`, loaded explicitly)
4. Validates `role` or `roles` contains `super_admin`
5. Validates `isActive` is not false
6. bcrypt password compare
7. Returns JWT + user profile
8. Frontend stores token (cookie + localStorage) and redirects to dashboard

## HRMS user fields used

| Field | Usage |
|-------|--------|
| `email` | Login identifier |
| `password` | bcrypt hash |
| `name` | Display name |
| `role` | Must be `super_admin` |
| `roles[]` | Alternative multi-role check |
| `isActive` | Account must be active |

## API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | `{ username: email, password }` |
| GET | `/auth/me` | Bearer JWT | Current user payload |

## Validation rules

- Only `super_admin` role may access EMS admin portal
- Invalid credentials → 401
- Non-super-admin → 401 with message

## Environment

```env
HRMS_MONGODB_URI=
HRMS_USERS_COLLECTION=users
HRMS_SUPER_ADMIN_ROLE=super_admin
JWT_SECRET=
```

## Future (per doc)

- Student login via SDMS credentials
- RBAC with dynamic roles (Examination Cell, Accounts, Faculty, etc.)
