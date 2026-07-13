# Module: Hall Tickets

## Overview (from project scope)

Generate and distribute hall tickets for students who have paid examination fees.

## Expected flow (per doc scope)

1. Student completes fee payment
2. System marks student eligible for hall ticket
3. Hall ticket generated with exam schedule + student details
4. Student downloads hall ticket from portal
5. Distribution tracked in reports

## Expected data

- Student details (from SDMS)
- Examination name, type, schedule
- Subject-wise timetable
- Roll number, photo (future)
- Unique hall ticket number

## Status

⏳ **Planned** — not yet in backend

## Depends on

Fee Payment, Examination Publication, SDMS student data, Subject Mapping

## API (planned)

| Method | Path |
|--------|------|
| POST | `/exams/:id/generate-hall-tickets` |
| GET | `/hall-tickets?rollNumber=` |
| GET | `/hall-tickets/:id/download` |
