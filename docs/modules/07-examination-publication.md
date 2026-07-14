# Module: Examination Publication

## Overview (Workflow 7)

Makes approved examinations visible to eligible students and triggers downstream processes.

## Functional flow

1. Open **Approved** queue
2. Review final exam details
3. Click **Publish** — system loads SDMS students matching exam scope:
   - college, programme (course), branch, batch, program year, semester
4. Select students (all selected by default) to generate fee records
5. Publish → status `published` (+ optional fee generation)
6. (Future) Send notifications to eligible students

## System actions after publication

- Exam visible on student dashboard (future)
- Registration window opens
- Fee generation for selected students
- Notifications triggered (future)
- Publication logged in audit (future)

## Business rules

- Only `approved` exams can be published
- Exam details read-only after publication
- Eligible students come from SDMS using exam `college` + `course` + `branch` + `batch` + `yearOfStudy` + `semester`
- Roll number on fee records uses SDMS `pinNo` (fallback: admission number)

## API

| Method | Path | Body / notes |
|--------|------|----------------|
| GET | `/exams/:id/eligible-students` | Lists matching SDMS students for publish desk |
| POST | `/exams/:id/publish` | `{ students?: [{ rollNumber, name, selectedSubjectIds? }] }` |

## Frontend

`/dashboard/exams` — Publish modal shows eligible student table with select-all, filter, and “generate fees” toggle.
