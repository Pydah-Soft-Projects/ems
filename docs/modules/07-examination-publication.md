# Module: Examination Publication

## Overview (Workflow 7)

Makes approved examinations visible to eligible students and triggers downstream processes.

## Functional flow

1. Open **Approved** queue
2. Review final exam details
3. Publish examination
4. Status → `published`
5. Optionally pass student list → auto fee generation
6. (Future) Send notifications to eligible students

## System actions after publication

- Exam visible on student dashboard (future)
- Registration window opens
- Fee generation initiated
- Notifications triggered (future)
- Publication logged in audit (future)

## Business rules

- Only `approved` exams can be published
- Exam details read-only after publication
- Students see only exams matching their academic profile (via SDMS)

## API

| Method | Path | Body |
|--------|------|------|
| POST | `/exams/:id/publish` | `{ students?: [{ rollNumber, name, selectedSubjectIds? }] }` |

## Frontend (planned)

Publish dialog with student preview / confirm
