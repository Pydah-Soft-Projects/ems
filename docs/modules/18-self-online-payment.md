# Module: Self Online Payment & Reconciliation

## Overview

College UPI collection **without** a payment gateway. Students pay via UPI deep link / QR; EMS holds the order until Accounts reconciles against the **merchant statement (PDF primary)**. Fee Management receives the transaction **only after verification**.

Related: [Fee Payment](./09-fee-payment.md), Fee Management sync in exam service.

## Design decisions (locked)

| Topic | Rule |
|-------|------|
| Fee status after “I have paid” | Fee stays **`pending`**. Payment → **`awaiting_verification`**. |
| Auto-match | Auto-approve only on **`tr` / order ID** or **unique UTR**. Amount+date = **suggest only**. |
| Statement format | **PDF primary** (harder to tamper). CSV/Excel secondary (editable — treat as assistive). |
| Where txn lives before confirm | **EMS only** at QR time. |
| Fee Management | Create / post transaction **only after admin verification**. |
| Official receipt | **Temp acknowledgement** first; official receipt only after verify. |
| Convenience fee | **None** for Self Online (exact exam fee amount). |

## Payment methods (EMS)

| Mode | Method | Confirmation |
|------|--------|----------------|
| `online` | UPI / card / netbanking | Razorpay |
| `offline` | cash / bank_transfer | Desk staff |
| `self_online` | `upi` | Statement reconcile |

## Lifecycle

```
Created (EMS Payment pending)
  → QR / deep link shown (order ref in UPI tr)
  → Student pays outside EMS
  → Student claims “I have paid” (± optional UTR)
  → awaiting_verification + TEMP acknowledgement
  → Admin uploads merchant PDF (± CSV/XLS)
  → Parse → match / suggest
  → Admin verifies (or auto on strong match)
  → Payment success · Fee paid · Official receipt
  → Sync Fee Management (first time)
```

## Settings (configure UPI)

Dashboard → **Settings** → Self Online UPI:

| Field | Purpose |
|-------|---------|
| Enable Self Online | Show method to students when ready |
| Merchant UPI ID (`pa`) | e.g. `college@bank` |
| Merchant name (`pn`) | Shown on UPI apps / QR page |
| Default note (`tn`) | e.g. `Exam Fee` (order id appended) |
| Expiry hours | Open QR / pending claim window (default 48) |

Status for students: `enabled && upiId configured` → `ready`.

## Step 1 — Create EMS order at QR time

Before showing QR:

1. Ensure fee is unpaid.
2. Reuse open Self Online payment (`pending` / `awaiting_verification`) if any; else create one.
3. Amount = exact `feeRecord.totalAmount` (no 2.2%).
4. Assign **order reference** → `transactionReference` (e.g. `SO2026000042`).
5. Temp receipt number e.g. `TMP-SO-…` (not final).
6. **Do not** post to Fee Management yet.

## Step 2 — UPI deep link & QR

```
upi://pay?pa={upiId}&pn={merchantName}&am={amount}&cu=INR&tn={note}+{orderRef}&tr={orderRef}
```

`tr` (and note) carry the EMS order reference for statement matching.

## Step 3 — Temporary acknowledgement

On “I have paid”:

- Payment status → `awaiting_verification`
- Optional student UTR stored
- Student downloads **awaiting verification** acknowledgement
- Fee remains `pending`; hall ticket stays blocked

## Step 4 — Statement upload

Accounts downloads merchant report (PhonePe / bank / BharatPe / PSP).

| Format | Role |
|--------|------|
| **PDF** | Primary — preferred for audit integrity |
| CSV / Excel | Secondary — faster parse; flag as editable source |

Parsed rows stored as merchant statement transactions (UTR, amount, date, refs, payer, raw line).

## Step 5 — Reconciliation

| Priority | Match | Auto-verify? |
|----------|-------|--------------|
| 1 | Statement contains order ref (`tr`) | Yes (if amount exact, UTR unused) |
| 2 | Exact amount + student UTR = statement UTR (unique) | Yes |
| 3 | Exact amount + date window (±1 day) | Suggest only — admin approve |
| 4 | Duplicate UTR / payment already linked | Reject |
| 5 | **Manual link** — admin pastes bank UTR / narration | Admin confirms |

One merchant row ↔ one EMS payment.

### Why order id is often missing on bank statements

UPI apps / banks frequently **drop `tr`** and **truncate `tn`**. Example:

```
UPI/CR/696846634477/Gollavil/…/Exam … -- 1.00
```

EMS sent `tn=Exam Fee SO2026…` but the statement only kept `Exam`. The reliable token is the **UTR** after `UPI/CR/`.

Mitigations:

1. `tn` now starts with order id: `SO2026… Exam Fee`
2. Parser reads UTR from `UPI/CR/{utr}/`
3. Reconcile page → **Manual link by UTR / bank line**

## Step 6 — After verification

1. Payment → `success`; store UTR, statement row, verifiedBy, verifiedAt  
2. Fee → `paid`  
3. Replace temp receipt with **official** receipt number  
4. **Then** `syncPaymentToFeeManagement` (creates Fee Mgmt txn / ledger)  
5. Unlock hall ticket / paid documents  

## Admin UI

- Pending Self Online payments  
- Uploaded statements + parsed rows  
- Suggested matches (confidence)  
- Approve / reject / manual link  
- Upload PDF (primary) or CSV/XLS  

## Desk collection

Staff fee desk (`/dashboard/fees/collect/[roll]`) includes **Self Online** alongside Cash / Bank / Razorpay:

1. Select one pending fee row  
2. Choose **Self Online** → **Open Self Online QR**  
3. Student/parent scans and pays  
4. Staff taps **I have paid** (± UTR) → temporary acknowledgement  
5. Fee stays pending until reconcile at `/dashboard/fees/self-online`  

## Audit events

Transaction created · QR generated · Student claimed paid · Statement uploaded · Auto-match · Admin verified / rejected · Official receipt · Fee Management posted  

## API (summary)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/fees/self-online/status` | Public readiness (no secrets) |
| POST | `/fees/self-online/order` | Create/reuse EMS order + QR |
| POST | `/fees/self-online/:paymentId/claim` | I have paid |
| GET | `/fees/self-online/pending` | Staff reconcile queue |
| POST | `/fees/self-online/statements` | Upload PDF/CSV/XLS |
| GET | `/fees/self-online/statements` | List uploads |
| POST | `/fees/self-online/verify` | Confirm match |
| GET/PUT | `/settings/payments` | Includes Self Online UPI fields |

## Privileges

- `settings:payments` — configure UPI  
- `fees:read` — view pending / statements  
- `fees:reconcile` — upload statements & verify matches  
