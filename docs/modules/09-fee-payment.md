# Module: Fee Payment (Online & Offline)

## Overview (Workflow 9)

Unified fee collection — students pay via Razorpay online, Self Online college UPI, or Accounts desk offline (cash/bank).

See also: [Self Online Payment & Reconciliation](./18-self-online-payment.md), [Canara Bank UPI Collection](./19-canara-upi-collection.md).

## Desk collection UI

`/dashboard/fees` — select a **published examination** first (only eligible students load). Narrow with branch / section / search scoped to that exam, then **Select** → `/dashboard/fees/collect/[roll]`. The fee desk does not open until a student is chosen.

Screenshot-style desk page:
- Student banner (PIN, admission, year, total due)
- Year summary cards
- Fee dues table (select fees)
- Collect sidebar (cash/bank, collector, remarks)
- Transaction history → print receipt

Self Online reconcile: `/dashboard/fees/self-online` (merchant PDF upload + match).

Desk collect methods: Cash · Bank · Razorpay · **Self Online** · **Canara UPI**.

## Receipt (A5)

`/dashboard/fees/receipt/[paymentId]` and `/student/receipt/[paymentId]`

- Printable A5 landscape layout (mock fee receipt style)
- QR for receipt number, particulars, authorized signatory
- Browser **Print receipt** button
- Self Online: temporary acknowledgement until verified; official receipt after reconcile
- Canara UPI: official receipt when bank confirms (callback / status sync)

## Student portal

- Login: `/student/login` — PIN + Admission Number (password)
- Home: `/student` — exams, subjects, paid/pending, online pay
- Auth: `POST /auth/student/login`
- Payment methods: Razorpay and/or Self Online and/or **Canara Bank UPI** when enabled in Settings

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
| GET | `/fees/self-online/status` | Self Online readiness |
| POST | `/fees/self-online/order` | Create EMS order + UPI QR |
| POST | `/fees/self-online/:id/claim` | Student “I have paid” |
| POST | `/fees/self-online/statements` | Upload merchant PDF/CSV/XLS |
| POST | `/fees/self-online/verify` | Admin confirm match |
| GET | `/fees/canara-upi/status` | Canara UPI readiness |
| POST | `/fees/canara-upi/order` | Dynamic bank QR |
| POST | `/fees/canara-upi/:id/sync` | Bank status sync |
| POST | `/fees/canara-upi/callback` | Bank Call-Back |

