# Module: Late Fee & Fine Management

## Overview (Workflow 10)

Automatically applies late fees after application deadline based on slabs configured during exam creation.

## Late fee slabs (example from doc)

| Period | Additional fee |
|--------|----------------|
| Before due date | ₹0 |
| 1–5 days after | ₹100 |
| 6–10 days after | ₹250 |
| 11–15 days after | ₹500 |
| Beyond last date | Registration closed |

## Functional flow

1. Scheduler checks active examinations
2. Compare current date vs due date
3. Find unpaid fee records
4. Apply matching late fee slab
5. Update `totalAmount`
6. Notify students (future)

## Status

⏳ **Planned** — slabs stored on exam; scheduler not yet implemented.

## Backend location (planned)

`backend/src/exam/` or dedicated `late-fee` service + cron job

## Depends on

Examination Creation (late fee slabs), Fee Generation, Notifications
