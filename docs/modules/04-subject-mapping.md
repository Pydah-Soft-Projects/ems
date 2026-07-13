# Module: Subject Mapping

## Overview (Workflow 4)

Associates regulation subjects with **college, programme, branch, batch, program year, and semester** from the regulation scope. One subject can be assigned to multiple branches with different year/semester values.

## Purpose

Link regulations → academic hierarchy → subjects so exam creation and fee generation target the correct student group without manual selection.

## Functional flow

1. Select regulation
2. Multi-select colleges, programmes, and batches from regulation scope
3. Add assignment rows: subject + branch + batch + year + semester
4. Same subject can repeat on different branches (e.g. CSE Y2 S2, ECE Y3 S1)
5. Save mappings
6. Mappings used during examination creation

## Data model (`subject_mapping_entries`)

| Field | Description |
|-------|-------------|
| `regulationId` | Academic regulation |
| `subjectId` | Linked subject |
| `collegeId`, `collegeName` | SDMS college from regulation scope |
| `courseId`, `courseName` | SDMS programme from regulation scope |
| `branchId`, `branchName` | SDMS branch |
| `batch` | Admission batch from regulation scope |
| `yearOfStudy` | Program year for this assignment |
| `semester` | Semester for this assignment |

**Unique constraint:** regulation + subject + college + course + branch + batch + year + semester

## Validation rules

- Regulation must exist
- College/course/batch must be in regulation scope
- Subject must belong to selected regulation
- Duplicate assignment not allowed

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/subject-mappings` | Create bulk assignments `{ regulationId, assignments[] }` |
| GET | `/subject-mappings` | List entries (filters: regulationId, course, branch, batch, semester) |
| GET | `/subject-mappings/:id` | Get one entry |
| PATCH | `/subject-mappings/:id` | Update one entry |
| DELETE | `/subject-mappings/:id` | Delete one entry |

## Backend

`backend/src/subjects/` — `SubjectMappingEntry` entity

## Frontend

`/dashboard/subjects` — **Subject mappings** tab: multi-scope selection + per-subject branch/year/semester rows
