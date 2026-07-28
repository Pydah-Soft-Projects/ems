# Module: Exam Due Clearance

## Overview

Before a student can apply for an examination (or access a hall ticket), EMS checks whether they have **overdue academic fee dues** in the Fee Management MongoDB (same connection used to post exam fee / late fee transactions).

Students may open exam details freely. If overdue dues exist, **Apply is disabled** and submission is rejected. The same rule blocks hall tickets.

## Business rules (locked)

| Rule | Decision |
|------|----------|
| What blocks | Any **overdue** unpaid balance across **all fee heads** |
| Late fee | Included |
| Future unpaid terms | Do **not** block (due date not yet reached) |
| As-of date | **Today** at every check point |
| Check points | Exam publish (eligible summary), exam details view, apply submit, hall ticket |
| UI | Show exam details; disable Apply; no submission |
| Message | Total due + term-wise + head-wise |
| Concessions | Use currently stored **APPROVED** values as final |
| Override | Users with `fees:due_override`; Super Admin always |
| Hall tickets | Same overdue-due gate |

## Data source

Fee Management Mongo (`FEE_MANAGEMENT_MONGODB_URI`) — same DB as exam fee posting.

| Collection / model | Role |
|--------------------|------|
| `StudentFee` | Demand rows (head, year, semester, term, amount) |
| `Transaction` | Payments / waivers / refunds (`status: active`) |
| `OverallConcessionRequest` | Declaration concession (split across terms) |
| `ConcessionRequest` | Application concession (waterfall to first unpaid terms) |
| `FeeStructure` | Term due dates / offsets / late-fee config (strict:false mirror) |
| `FeeHead` | Head name/code for display |

Student identity in Fee Mgmt is preferred as **admission number**, with **PIN** as fallback. Due queries match **both**.

## Calculation algorithm

For each active `StudentFee` group keyed by `(feeHead, academicYear, studentYear, semester)`:

```
1. Load term demands (StudentFee rows), ordered by termNumber
2. Load APPROVED OverallConcessionRequest entries for that head/year/sem
   → split concession across all terms by term share
3. Load active Transactions for that head/year/sem
   → net paid = DEBIT + Waiver/Adjustment − CREDIT/Refund
   → apply remaining payment term-by-term (earliest first)
4. Load APPROVED ConcessionRequest for that head/year/sem
   → waterfall onto first unpaid term balances
5. termBalance = max(0, demand − declaration − paid − application)
6. Resolve term dueDate:
   a. FeeStructure term fixed dueDate, else
   b. semester start (SDMS) + term offset days, else
   c. treat as already due (active demand with no date)
7. If termBalance > 0 AND dueDate <= today → include in blockingDue
```

Cross-check: if `structureId` is present, compare structure expected amount vs sum of StudentFee demands and attach a `verification` note when they diverge. **StudentFee remains the demand source of truth.**

### Concession split detail

**Declaration (`OverallConcessionRequest`)** — before payments:

```
termDeclaration = concessionAmount * (termDemand / totalDemandForHeadYearSem)
```

**Application (`ConcessionRequest`)** — after payments:

```
Apply remaining concession to Term 1 unpaid, then Term 2, …
```

## EMS integration points

| Gate | Behaviour |
|------|-----------|
| `publish` | Exam still publishes; eligible-student summary includes due-blocked counts |
| `listEligibleStudents` | Each student gets `dueClearance` summary |
| `listPublishedExamsForStudent` | Each exam includes `dueClearance` + `canApply` |
| `getPublishedExamForStudent` | Full due breakdown; `canApply` false when blocked |
| `createStudentApplication` | Hard reject unless override |
| Hall ticket get/list | Hard reject / filter when blocked |

## API shape (`dueClearance`)

```json
{
  "blocked": true,
  "canApply": false,
  "asOfDate": "2026-07-28",
  "totalDue": 12500,
  "currency": "INR",
  "byHead": [
    {
      "feeHeadId": "...",
      "feeHeadCode": "TF",
      "feeHeadName": "Tuition Fee",
      "due": 10000,
      "terms": [
        { "termNumber": 1, "due": 5000, "dueDate": "2026-06-01", "overdue": true },
        { "termNumber": 2, "due": 5000, "dueDate": "2026-09-01", "overdue": false }
      ]
    }
  ],
  "byTerm": [
    { "termNumber": 1, "due": 7500 },
    { "termNumber": 2, "due": 5000 }
  ],
  "message": "You have outstanding fee dues of ₹12,500. Clear all overdue dues before applying for the examination.",
  "verification": { "matched": true, "notes": [] },
  "skipped": false
}
```

Only **overdue** term balances contribute to `totalDue` / `blocked`.

## Privilege

| Key | Meaning |
|-----|---------|
| `fees:due_override` | Staff may submit application / release hall-ticket access despite overdue dues |

Super Admin (`*` / `isSuperAdmin`) always may override.

Staff apply body flag: `{ "overrideDues": true }` (ignored without privilege).

## Frontend

- Exam list card: if `dueClearance.blocked`, show due badge; **View details** still opens; Apply disabled.
- Apply page: show total + head-wise + term-wise due panel; hide/disable submit.
- Staff apply modal: checkbox “Override dues” when user has `fees:due_override`.

## Dependencies

- Fee Management Mongo connected
- SDMS student profile (admission / PIN / college context)
- Optional: SDMS semester calendar for offset-based due dates

## Status

Backend + student/staff gates — implemented.
See `fee-management/due-clearance.js`, `FeeManagementService.getStudentDueClearance`, and exam apply/hall-ticket gates.
