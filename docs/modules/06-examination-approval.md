# Module: Examination Approval

## Overview (Workflow 6)

Administrative verification layer before examinations become visible to students.

## Functional flow

1. Open **Pending Approval** queue
2. Review regulation, scope, subjects, fees, dates, late fee rules
3. **Approve** → status `approved` → eligible for publication
4. **Reject** → status `rejected` + remarks → returns to Examination Cell for correction

## Approval checklist

- [ ] Regulation
- [ ] Course, branch, batch, semester
- [ ] Subject selection
- [ ] Examination dates
- [ ] Application dates
- [ ] Subject fees + package fee
- [ ] Late fee slabs
- [ ] Instructions

## Business rules

- Only `pending_approval` exams can be approved/rejected
- Rejected exams can be edited and resubmitted
- Approved exams become read-only (except authorized admin override — future)
- Approval records: approver name, date, status

## API

| Method | Path |
|--------|------|
| POST | `/exams/:id/approve` |
| POST | `/exams/:id/reject` body: `{ remarks }` |
| GET | `/exams?status=pending_approval` |

## Frontend

`/dashboard/exams` — Pending approval filter with Approve / Reject (remarks) actions and detail review.
