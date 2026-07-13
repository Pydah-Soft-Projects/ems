# Module: SDMS Integration

## Overview

EMS integrates with the existing **Student Data Management System (SDMS)** on the same RDS cluster. Academic master data is read from `student_database`; examination operations stay in `examination_portal`.

## SDMS provides (read-only)

| Data | API prefix | Source table(s) |
|------|------------|-----------------|
| Colleges | `/sdms/colleges` | `colleges` |
| Courses / programs | `/sdms/colleges/:id/courses` | `courses` |
| Branches | `/sdms/courses/:id/branches` | `course_branches` |
| Academic years | `/sdms/academic-years` | `academic_years` |
| Branch ↔ session links | `/sdms/branches/:id/academic-years` | `branch_academic_years` |
| Batches | `/sdms/batches` | `students`, `semesters` (distinct `batch`) |
| Sections | `/sdms/branches/:id/sections` | `course_branches.metadata`, `student_sections` |
| Semesters (calendar) | `/sdms/semesters` | `semesters` |
| Student sections | `/sdms/student-sections` | `student_sections` |
| Students | `/sdms/students` | `students` |

Full schema: see `docs/database/STUDENT_DATABASE.md` (from SDMS architecture doc).

## Database setup

| Connection | Database | Purpose |
|------------|----------|---------|
| Exam Portal MySQL | `examination_portal` | EMS primary data (read/write) |
| Student MySQL | `student_database` | SDMS master data (**read-only**) |
| HRMS MongoDB | HRMS `users` | Super Admin auth only |

## Environment

```env
STUDENT_DB_HOST=student-database....rds.amazonaws.com
STUDENT_DB_NAME=student_database
STUDENT_DB_USER=admin
STUDENT_DB_PASSWORD=
STUDENT_DB_SSL=true
```

Same cluster as `EXAM_PORTAL_DB_*` — only the database name differs.

## Implementation status

- [x] Student DB connection (read-only, `synchronize: false`)
- [x] SDMS schema entities + service
- [x] REST API under `/api/sdms/*`
- [x] Subject mapping dropdowns (college → course → branch → batch)
- [x] Organization browse UI (`/dashboard/organization`)
- [ ] Auto fee generation from eligible students query
- [ ] Student portal auth via SDMS

## Backend

`backend/src/sdms/` — entities, `sdms.service.ts`, `sdms.routes.ts`

## Frontend

- `/dashboard/organization` — hierarchy + student list (read-only)
- Subject mapping form — SDMS cascading dropdowns

## Design notes

1. Organizational hierarchy uses FKs: College → Course → Branch.
2. Students link to config by **name strings** (`college`, `course`, `branch`), not FKs.
3. **No `batches` table** — batch is a VARCHAR (admission year, e.g. `2026`).
4. Sections live in `course_branches.metadata` + `student_sections`.
