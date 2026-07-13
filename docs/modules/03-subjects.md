# Module: Subject Management

## Overview (Workflow 3)

Subjects are created **under a regulation**. Each regulation may have different subject codes, credits, and semester structures.

## Purpose

Centralized repository of examination subjects, correctly tied to their regulation. Foundation for mapping, exams, fees, hall tickets, marks, and results.

## Functional flow

1. Select an existing **regulation**
2. Open Subject Management
3. Enter subject details (code, name, type, marks)
4. Validate mandatory fields + unique code per regulation
5. Save subject
6. Open **Subject mappings** to link subjects to colleges, programmes, branches, and batches from the regulation scope

## Data model

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `regulationId` | number | ✅ | Parent regulation |
| `code` | string(50) | ✅ | Unique within regulation |
| `name` | string(200) | ✅ | Subject title |
| `type` | enum | ✅ | `theory` \| `practical` \| `laboratory` |
| `credits` | decimal | ❌ | Subject credits |
| `internalMarks` | int | ❌ | Internal assessment max |
| `externalMarks` | int | ❌ | External exam max |
| `totalMarks` | int | ❌ | Max marks (auto: internal + external) |
| `status` | enum | ✅ | `active` \| `inactive` |

College, programme, branch, batch, and semester are **not** stored on the subject — they are defined in **Subject mappings**.

## Validation rules

- Subject code unique **within regulation**
- Subject name mandatory
- Regulation is mandatory
- Credits cannot be negative
- Cannot delete if used in an examination

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/subjects` | Create |
| GET | `/subjects?regulationId=` | List (optional filter) |
| GET | `/subjects/:id` | Get one |
| PATCH | `/subjects/:id` | Update |
| DELETE | `/subjects/:id` | Delete |

## Backend

`backend/src/subjects/`

## Frontend

`/dashboard/subjects` — **Subjects** tab: regulation + subject details only. **Subject mappings** tab: college, programme, branch, and batch from regulation scope.

## Downstream

Subject Mapping, Examination Creation, Fee config, Hall tickets, Marks, Results
