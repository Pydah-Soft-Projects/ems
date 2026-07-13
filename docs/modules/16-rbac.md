# Module: Role & Permission Management (RBAC)

## Overview (Workflow 14)

Role-Based Access Control for all EMS operations.

## Roles (from doc)

| Role | Access |
|------|--------|
| Super Administrator | Full system access |
| Sub Admin | Configurable (dynamic) |
| Examination Cell | Regulations, subjects, exams |
| Accounts | Fee collection, reports |
| Faculty | Marks entry (future) |
| Student | Dashboard, pay fees, hall ticket, results |

> Note: All roles except Super Admin and Student are **dynamically created** by administrator.

## Permission categories

Dashboard, Regulations, Subjects, Subject Mapping, Examinations, Fee Management, Payment Collection, Hall Tickets, Marks, Results, Reports, Notifications, User Management, Audit Logs, System Settings

## Current implementation

- **Super Admin only** — HRMS MongoDB auth
- No RBAC enforcement yet (all routes require Super Admin JWT)

## Status

⏳ **Planned** — after core modules UI complete

## Backend (planned)

`backend/src/rbac/` — roles, permissions, guards

## Frontend (planned)

`/dashboard/settings/roles`
