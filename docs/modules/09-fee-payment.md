# Module: Fee Payment (Online & Offline)

## Overview (Workflow 9)

Unified fee collection — students pay online; Accounts staff collect offline (cash/bank).

## Desk collection UI

`/dashboard/fees` → click student / Collect → `/dashboard/fees/collect/[roll]`

Screenshot-style desk page:
- Student banner (PIN, admission, year, total due)
- Year summary cards
- Fee dues table (select fees)
- Collect sidebar (cash/bank, collector, remarks)
- Transaction history → print receipt

## Receipt (A5)

`/dashboard/fees/receipt/[paymentId]` and `/student/receipt/[paymentId]`

- Printable A5 landscape layout (mock fee receipt style)
- QR for receipt number, particulars, authorized signatory
- Browser **Print receipt** button

## Student portal

- Login: `/student/login` — PIN + Admission Number (password)
- Home: `/student` — exams, subjects, paid/pending, online pay
- Auth: `POST /auth/student/login`

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fees/collection?rollNumber=` | Desk lookup |
| GET | `/fees/records` | List records |
| POST | `/fees/pay-offline` | Desk collect |
| GET | `/fees/payments/:id` | Receipt data |
| GET | `/student/fees` | Student’s own fees |
| POST | `/student/fees/:id/pay` | Student online pay |
| GET | `/student/payments/:id` | Student receipt |
