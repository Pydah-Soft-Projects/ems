# Module: Examination Creation

## Overview (Workflow 5)

Core module — configure examination sessions: regulation, academic scope, subjects, fees, dates, late fee rules.

## Status lifecycle

```
draft → pending_approval → approved → published
              ↓
          rejected → (edit) → draft / pending_approval
```

## Data model (key fields)

| Field | Description |
|-------|-------------|
| `name` | Examination name |
| `type` | `regular` \| `supply` \| `improvement` \| `special_supply` |
| `regulationId` | Regulation |
| `course`, `branch`, `batch`, `semester` | Academic scope |
| `examSubjects[]` | `{ subjectId, fee }` per subject |
| `packageFee` | Optional package fee when all subjects selected |
| `examinationStartDate` / `examinationEndDate` | Exam dates |
| `applicationStartDate` / `applicationEndDate` | Registration window |
| `lateFeeStartDate` | Late fee applicability |
| `lateFeeSlabs[]` | `{ fromDay, toDay, amount }` |
| `instructions` | Exam instructions text |
| `status` | Workflow status |

## Business rules

- Regulation must exist
- Subject mapping must exist for academic scope
- At least one subject required
- Application end < examination start
- Package fee optional; applied when all subjects selected (min of package vs subject total)
- Cannot publish before approval

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/exams` | Create (`submitForApproval: true` to submit immediately) |
| GET | `/exams?status=` | List |
| GET | `/exams/:id` | Get one |
| PATCH | `/exams/:id` | Update (draft/rejected only) |
| POST | `/exams/:id/submit` | Submit for approval |
| POST | `/exams/:id/approve` | Approve |
| POST | `/exams/:id/reject` | Reject with remarks |
| POST | `/exams/:id/publish` | Publish (+ optional student list for fee gen) |
| POST | `/exams/:id/generate-fees` | Generate fee records |

## Backend

`backend/src/exam/`

## Frontend (planned)

`/dashboard/exams` — multi-step wizard: scope → subjects → fees → dates → review
