# Module: Marks & Results

## Overview (from project scope)

Marks entry, result processing, and publication.

## Expected flow

1. Examination conducted
2. Faculty/admin enters marks per subject
3. Result processing (pass/fail, grades)
4. Results published to student portal
5. Reports: pass %, subject-wise, branch-wise

## Expected features

- Marks entry per subject / student
- Internal + external marks per subject schema
- Result publication workflow
- Student result viewing
- Regulation-wise / branch-wise result reports

## Status

⏳ **Planned**

## Depends on

Examination Publication, Subjects, Hall Tickets (optional gate)

## API (planned)

| Method | Path |
|--------|------|
| POST | `/exams/:id/marks` |
| GET | `/results?examId=` |
| POST | `/exams/:id/publish-results` |
