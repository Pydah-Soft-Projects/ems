# Module: Fee Payment (Online & Offline)

## Overview (Workflow 9)

Unified fee collection — students pay online; Accounts staff collect offline (cash/bank).

## Payment methods

### Online (student)
- UPI, Debit Card, Credit Card, Net Banking
- **Current:** Simulated gateway success

### Offline (accounts staff)
- Cash, Bank Transfer
- Search student by roll number → select exam fee → record payment

## Functional flow — Online

1. Student views pending fees
2. Clicks Pay Now
3. Payment gateway (simulated)
4. Fee status → `paid`
5. Receipt generated
6. Hall ticket eligibility updated (future)

## Functional flow — Offline

1. Accounts staff logs in
2. Search student roll number
3. Select examination fee
4. Record payment mode + details
5. Receipt generated

## Business rules

- One payment per fee record
- Duplicate payments blocked
- Receipt immutable after generation
- Payment history cannot be modified

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/fees/records/:id/pay-online` | Simulated online pay |
| POST | `/fees/pay-offline` | Accounts offline collection |
| GET | `/fees/payments` | Payment history |

## Frontend (planned)

`/dashboard/fees` — records list, payment actions, receipt view
