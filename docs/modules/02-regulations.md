# Module: Regulation Management

## Overview

Regulation Management is the **foundation module** of EMS. Academic regulations define the framework under which subjects, mappings, and examinations are configured. Every subject belongs to exactly one regulation.

> Regulations are managed entirely by EMS — they are **not** sourced from SDMS.

## Purpose

- Maintain a centralized list of academic regulations (e.g. R16, R20, R24)
- Enable Examination Cell to configure the academic framework before subjects and exams
- Act as the parent entity for Subject Management and Examination Creation

## Functional flow

1. Examination Cell opens **Regulations** page
2. Administrator creates a new regulation with code, name, and metadata
3. System validates mandatory fields and unique regulation code
4. Regulation is saved with status **Active** (default) or **Inactive**
5. Regulation becomes available for:
   - Subject Management
   - Subject Mapping
   - Examination Creation

## Data model

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | number | auto | Primary key |
| `code` | string(50) | ✅ | Unique regulation code (e.g. `R20`) |
| `name` | string(200) | ✅ | Official regulation name |
| `description` | text | ❌ | Optional notes |
| `effectiveDate` | date | ❌ | Audit/reference date only; not used for academic logic |
| `status` | enum | ✅ | `active` \| `inactive` |
| `scopes[]` | relation | ✅ | SDMS college → course → batch mappings |
| `createdAt` | datetime | auto | Created timestamp |
| `updatedAt` | datetime | auto | Updated timestamp |

## Validation rules

| Rule | Error |
|------|-------|
| Regulation code is mandatory | 400 |
| Regulation name is mandatory | 400 |
| Regulation code must be unique | 400 |
| Cannot delete regulation if subjects exist under it | 400 |
| A batch (college + course + batch) may belong to only one **active** regulation | 400 |
| Regulation must exist before creating subjects/exams | 404 |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/regulations` | Create regulation |
| GET | `/regulations` | List all (newest first) |
| GET | `/regulations/claimed-batches` | Batches already assigned to other active regulations (`?excludeRegulationId=` when editing) |
| GET | `/regulations/:id` | Get by ID |
| PATCH | `/regulations/:id` | Update regulation |
| DELETE | `/regulations/:id` | Delete (blocked if subjects linked) |

### Create / Update payload

```json
{
  "code": "R20",
  "name": "Regulation 2020",
  "description": "B.Tech regulation effective from 2020",
  "effectiveDate": "2020-01-01",
  "status": "active",
  "scopes": [
    {
      "collegeId": 1,
      "collegeName": "Pydah College of Engineering",
      "courseId": 2,
      "courseName": "B.Tech",
      "batches": ["2024", "2025", "2026"]
    }
  ]
}
```

## Backend location

- `backend/src/regulations/`
- Entity: `regulations` table in `examination_portal` MySQL

## Frontend location

- `frontend/src/app/dashboard/regulations/`
- Components: `frontend/src/components/regulations/`

## UI requirements

- List table: code, name, effective year, scope summary, status, actions
- Create / Edit modal with SDMS college → multi-course → multi-batch picker
- Batches already used in another **active** regulation are disabled in the scope picker (shown with that regulation’s code)
- **View** page: scope tree + batch insight (students by year/sem, academic sessions, branches, sections)
- Delete with confirmation
- Status badge (active = green, inactive = gray)
- Empty state when no regulations exist

## Downstream dependencies

| Module | Depends on regulation |
|--------|----------------------|
| Subject Management | `regulationId` required |
| Subject Mapping | `regulationId` required |
| Examination Creation | `regulationId` required |

## Implementation checklist

- [x] Backend CRUD
- [x] Unique code validation
- [x] Delete guard (subjects linked)
- [x] Frontend list + create + edit + delete
- [x] SDMS scope mapping (colleges, courses, batches)
- [x] Regulation detail view with batch student insight
- [ ] Audit log on create/update/delete (future)
