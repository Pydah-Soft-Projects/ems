# Module: Late Fee & Fine Management

## Overview (Workflow 10)

Applies late fees based on date slabs configured during exam creation. Computed at fee lookup and payment time (desk + online).

## Late fee slabs (example)

| Period | Additional fee |
|--------|----------------|
| Before late-fee start / before first slab | ₹0 |
| 2026-08-01 → 2026-08-05 | ₹100 |
| 2026-08-06 → 2026-08-10 | ₹250 |
| 2026-08-11 → application end | ₹500 |
| After application end | ₹0 |

`lateFeeStartDate` is the earliest day late fees may apply. Each slab uses calendar **from date** / **to date**. The last slab may omit **to date** (applies until application end).

## Functional flow

1. Staff/student opens fee record (collection search or pay)
2. System compares today vs `lateFeeStartDate` and application end
3. Match slab by `fromDate`–`toDate`
4. Persist `lateFee` and `totalAmount = baseFee + lateFee` on pending records
5. Payment uses the refreshed total

## Status

✅ **Pay-time application** — slabs stored on exam; applied on `lookupForCollection`, `listFeeRecords`, `getFeeRecord`, and before online / offline pay.

⏳ Optional future: nightly scheduler + notifications for unpaid fees.

## Backend

`ExamService.calculateLateFee` / `refreshLateFee` in `backend/src/exam/exam.service.js`

## Depends on

Examination Creation (late fee slabs), Fee Generation, Fee Payment
