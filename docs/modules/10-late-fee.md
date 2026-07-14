# Module: Late Fee & Fine Management

## Overview (Workflow 10)

Applies late fees based on slabs configured during exam creation. Computed at fee lookup and payment time (desk + online).

## Late fee slabs (example)

| Period | Additional fee |
|--------|----------------|
| Before late-fee start | ₹0 |
| 1–5 days after start | ₹100 |
| 6–10 days after start | ₹250 |
| 11–15 days after start | ₹500 |
| Beyond last slab | Last slab amount (flagged) |

`lateFeeStartDate` counts as **day 1**.

## Functional flow

1. Staff/student opens fee record (collection search or pay)
2. System compares today vs `lateFeeStartDate`
3. Match slab by `fromDay`–`toDay`
4. Persist `lateFee` and `totalAmount = baseFee + lateFee` on pending records
5. Payment uses the refreshed total

## Status

✅ **Pay-time application** — slabs stored on exam; applied on `lookupForCollection`, `listFeeRecords`, `getFeeRecord`, and before `payOnline` / `payOffline`.

⏳ Optional future: nightly scheduler + notifications for unpaid fees.

## Backend

`ExamService.calculateLateFee` / `refreshLateFee` in `backend/src/exam/exam.service.ts`

## Depends on

Examination Creation (late fee slabs), Fee Generation, Fee Payment
