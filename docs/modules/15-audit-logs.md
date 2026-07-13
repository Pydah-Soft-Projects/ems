# Module: Audit & Activity Logs

## Overview (Workflow 13)

Tamper-resistant history of all critical system operations.

## Logged activities (from doc)

- Login / logout
- Regulation, subject, mapping CRUD
- Exam create / approve / publish
- Fee generation, payments
- Hall ticket generation
- Marks upload, result publication
- Role/permission changes

## Audit record fields

| Field | Description |
|-------|-------------|
| userId | Who performed action |
| userRole | Role at time of action |
| action | What was done |
| module | Affected module |
| timestamp | When |
| ipAddress | Client IP |
| previousValue / updatedValue | Change diff |

## Business rules

- Logs cannot be modified
- Financial activities always logged
- Searchable by authorized admins only

## Status

⏳ **Planned**

## Backend (planned)

`backend/src/audit/` — interceptor on all mutating endpoints
