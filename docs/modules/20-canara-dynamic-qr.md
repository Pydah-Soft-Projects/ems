# Module: Canara Bank Dynamic QR (UPI Collection)

## Implementation status (code)

Backend + Settings UI + student/desk pay panels are implemented. Enable **Mock mode** in Settings to test QR + simulate callback without bank credentials. For live UAT: register callback URL, fill credentials, Connect OAuth, disable mock.

| Piece | Path |
|-------|------|
| Crypto | `backend/src/exam/canara/canara-crypto.js` |
| API client / OAuth | `backend/src/exam/canara/canara-client.js` |
| QR + callback service | `backend/src/exam/canara/canara-qr.service.js` |
| Public callback | `POST /api/fees/canara/qr-callback` |
| Public OAuth redirect | `GET /api/fees/canara/oauth/callback` |
| Settings columns | `ensure-canara-columns.js` / `npm run migrate:add-canara` |

## Goal (plain English)

Students pay exam fees by scanning a **Canara Bank Dynamic QR** (amount locked for that payment). When the student pays in any UPI app, **Canara Bank calls our callback URL** and tells EMS: paid / failed. EMS then marks the fee paid in real time — no waiting for statement PDF.

This is **not** the same as current Self Online (static college UPI + PDF reconcile). Self Online stays as fallback. This is bank API Dynamic QR with live status.

Related: [Fee Payment](./09-fee-payment.md), [Self Online](./18-self-online-payment.md).

---

## What we are implementing (scope)

| In scope | Out of scope (for now) |
|----------|-------------------------|
| OAuth token management (authorize once, refresh ongoing) | VAN APIs |
| Merchant VPA setup (one-time / admin) if bank requires it | Raise Collect / Intent Generation |
| **Dynamic QR generation** (`type: "D"`) per fee payment | Static QR (`type: "S"`) as primary product |
| **QR Callback URL** (bank → EMS) for real-time paid/failed | Replacing Razorpay entirely |
| Status enquiry fallback (by `extTransactionId` / RRN) | Full QR statement UI (later) |
| Student UI: show QR → wait → paid | Changing Fee Management sync rules |
| Encrypt + sign every bank API request; decrypt responses | Client-side crypto (all bank crypto stays on backend) |

**Primary APIs we will use:**

1. OAuth authorize → access token → refresh token  
2. `POST /v1/upi/qr-generation` (Dynamic QR)  
3. **QR Callback** (our URL — bank POSTs payment result)  
4. `POST /v1/upi/txnStatus-extid` (and optionally `qrstatus-rrn`) if callback is missed  
5. One-time (or rare): VPA Creation + VPA Inquiry if merchant VPA is not already live

---

## Why callback URL comes first

Bank item **14** in their UAT list: *“QR Call-back URL to be given by customer.”*

Without this URL registered with Canara during app registration / UAT setup:

- We can generate QR and student can pay  
- **We will not get automatic “paid” notification**  
- We would only poll status APIs (slower, less reliable for realtime UX)

So **step 0 before coding QR**: decide, host, and register the callback with the bank.

### Callback URL we will give the bank

| Environment | URL to register with Canara |
|-------------|-----------------------------|
| UAT | `https://<our-uat-public-host>/api/fees/canara/qr-callback` |
| Production | `https://<our-prod-public-host>/api/fees/canara/qr-callback` |

Rules:

- Must be **HTTPS** with a valid CA-signed certificate (bank requirement).
- Must be reachable from **Canara’s servers** (public internet; our outbound IP is also whitelisted at bank for *our* API calls — inbound callback is separate).
- Method: **POST**, body JSON (encrypted payload pattern same as other APIs — confirm with bank if callback is encrypted or plaintext; doc sample shows plaintext `encryptData` object fields; production may encrypt — implement decrypt path either way).
- Our response: **HTTP 200** with body acknowledging success (bank expects `200` / `200_OK`).

### What bank sends on callback (payment feedback)

From bank doc (QR Call-Back), after student pays:

```json
{
  "Request": {
    "body": {
      "encryptData": {
        "extTransactionId": "NPST674857",
        "checksum": "",
        "status": "SUCCESS",
        "errCode": "",
        "customer_vpa": "navneet123@cnrb",
        "merchant_vpa": "youtube.youtube001.youtub8.youtub8@cnrf",
        "rrn": "417015880164",
        "txnId": "CANOEZEM7N0P9D03XF96OQCQ6EXWHE8OG8O",
        "amount": "7.00",
        "responseTime": "Tue Jun 18 12:58:56 IST 2024",
        "customerName": "M DINESH",
        "remark": "QR SIT testing",
        "channel": "API"
      }
    }
  }
}
```

**This is the realtime feedback you asked for.** We match `extTransactionId` to our EMS payment row and update status.

| Field | Our use |
|-------|---------|
| `extTransactionId` | **Primary key** — same ID we sent when creating QR |
| `status` | `SUCCESS` → mark paid; anything else → failed / keep pending |
| `amount` | Must match fee amount (reject mismatch) |
| `rrn` / `txnId` | Store on payment for audit / receipt |
| `customer_vpa` / `customerName` | Store for display / support |
| `checksum` | Verify if bank provides algorithm |

---

## End-to-end flow in EMS (student realtime pay)

```
1. Student opens fee → chooses Canara Dynamic QR
2. EMS creates Payment row (pending) with unique extTransactionId
3. EMS calls Canara QR Generation (type=D, amount, upiId, mid/sid/terminalId)
4. Bank returns qrString → EMS shows QR / UPI deep link on screen
5. Student scans & pays in PhonePe / GPay / etc.
6. Bank POSTs to our QR Callback URL  ← realtime feedback
7. EMS validates, marks Payment success, fee paid, sync Fee Management
8. Student UI polls / websocket / refresh → shows Paid + receipt

If callback never arrives (rare):
  EMS (or cron / “Check status” button) calls Transaction Status by ExtTransactionId
  Same update path as callback
```

```
┌─────────┐     ┌─────────┐     ┌──────────────┐     ┌────────────┐
│ Student │────▶│   EMS   │────▶│ Canara QR    │────▶│  UPI App   │
│  UI     │◀────│ Backend │◀────│ Generation   │     │  (pay)     │
└─────────┘     └────┬────┘     └──────────────┘     └─────┬──────┘
                     │                                      │
                     │  POST /api/fees/canara/qr-callback   │
                     │◀─────────────────────────────────────┘
                     │           (Canara bank)
                     ▼
              Mark fee PAID
```

---

## Security stack (every bank business API call)

Bank requires this on **all** UPI collection API calls (not OAuth token APIs):

| Layer | What we do |
|-------|------------|
| HTTPS + TLS 1.2+ | Only call bank over HTTPS; only expose callback over HTTPS |
| IP whitelist | Share our server egress IP(s) with bank in advance |
| Client ID / Secret | Headers `x-client-id`, `x-Client-Secret` (+ Basic Auth on OAuth) |
| Bearer access token | `Authorization: Bearer <access_token>` |
| Digital signature | Sign **plaintext** payload with **RSA-SHA256**, Base64 → header `x-signature` |
| Encryption | Encrypt `encryptData` with **A128CBC-HS256** (JWE) using bank-shared symmetric key |
| Certificate | Header `x-client-Certificate` = our public cert; share same with bank at registration |
| Other headers | `x-api-interaction-id`, `x-timestamp`, `x-forwarded-for`, `Content-Type: application/json` |

**Request build order (locked):**

1. Build plaintext JSON for `encryptData` fields  
2. Digitally sign that plaintext → `x-signature`  
3. Encrypt `encryptData` → replace body with encrypted string  
4. POST final `{ Request: { body: { encryptData: "<jwe>" } } }`  
5. On response: decrypt `encryptData`, then process

Secrets (client secret, private key, symmetric key, tokens) live **only on backend** (Settings DB / env / secret store). Never in frontend.

---

## OAuth (access to APIs) — how it fits our app

This is **admin / system** auth with Canara, **not** student login.

### One-time / rare (human or admin tool)

1. Open bank authorize URL in browser with our `client_id`, `redirect_uri` (= OAuth redirect registered at app creation — **different** from QR payment callback), `scope`, `state`.  
2. Bank login page → bank redirects to our OAuth redirect with `?code=...`  
3. EMS backend exchanges `code` → access token + refresh token (`POST /v1/oauth2/token`, Basic Auth client_id:client_secret).  
4. Store tokens encrypted in DB/settings.

### Ongoing (automatic)

- Access token: use as Bearer on API calls (UAT often longer; Production ~24h — follow bank note for env).  
- Before expiry: `POST /v1/oauth2/refresh-token` → new access + refresh.  
- If refresh expired: repeat authorize + code exchange.

| Token | Typical validity (per bank notes) |
|-------|-----------------------------------|
| Authorization code | ~10 minutes |
| Access token | UAT multi-day / Prod ~1 day (confirm with bank for your env) |
| Refresh token | ~7 days |

**OAuth redirect URI** (for getting tokens) ≠ **QR Callback URL** (for payment status). Both must be HTTPS URLs we own and register with the bank.

Suggested OAuth redirect for EMS:

- `https://<host>/api/fees/canara/oauth/callback`

---

## Dynamic QR Generation (core pay API)

**URL (UAT):** `POST https://api.canarauat.bank.in/v1/upi/qr-generation`

Important fields we send (after encrypt):

| Field | Value in EMS |
|-------|----------------|
| `amount` | Exact fee amount (e.g. `"500.00"`) |
| `extTransactionId` | Unique EMS id (max 35) — **must match callback** |
| `channel` | `"api"` |
| `type` | `"D"` (Dynamic) |
| `source` / mid | Merchant ID from bank |
| `sid` | Sub-merchant ID |
| `terminalId` | Terminal ID |
| `upiId` | Merchant VPA from VPA creation/inquiry |
| `remark` | e.g. exam name / roll |
| `requestTime` | Current timestamp |
| `reciept` | Optional receipt/landing URL |

Bank returns `qrString` (`upi://pay?...`) → we render QR on student/desk UI.

---

## Status if callback fails / delayed

| API | When |
|-----|------|
| Transaction Status by Ext Transaction ID | Primary fallback — we always know our `extTransactionId` |
| Transaction Status by RRN | If we only have RRN from partial data |

Student UI: short poll while “waiting for payment” screen is open (e.g. every 5–10s for a few minutes). Cron can re-check `pending` Canara payments older than N minutes.

---

## How this maps into EMS (implementation plan)

### New payment mode

| Mode / provider | Confirmation |
|-----------------|--------------|
| Existing `online` / Razorpay | Checkout + optional webhook |
| Existing `self_online` | Static UPI + statement PDF |
| **New `canara_dynamic_qr`** | Bank Dynamic QR + **QR callback** (+ status poll) |

Reuse: `exam_fee_records`, `payments`, Fee Management sync **only after success** (same rule as Razorpay/Self Online verify).

### Backend (planned files)

| Piece | Location (planned) |
|-------|--------------------|
| Crypto (sign / encrypt / decrypt) | `backend/src/exam/canara/canara-crypto.service.js` |
| OAuth + token store | `backend/src/exam/canara/canara-oauth.service.js` |
| QR create + status | `backend/src/exam/canara/canara-qr.service.js` |
| Routes | `exam.routes.js` + raw body registration like Razorpay webhook in `app.js` |
| Settings | Extend `payment_gateway_settings` + Settings UI |

### API endpoints (planned)

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/fees/canara/status` | Staff / system | Ready if credentials + VPA + tokens OK |
| POST | `/fees/canara/oauth/start` | Admin | Begin OAuth (returns authorize URL) |
| GET | `/fees/canara/oauth/callback` | Bank redirect | Receive `code`, exchange tokens |
| POST | `/fees/canara/order` | Student / desk | Create payment + Dynamic QR |
| **POST** | **`/fees/canara/qr-callback`** | **Canara Bank** | **Realtime paid/failed** |
| POST | `/fees/canara/:paymentId/status` | Student / system | Poll bank by `extTransactionId` |

### Frontend

- Student fee pay: Canara Dynamic QR panel (QR image, amount, “Waiting for payment…”, then Paid).  
- Desk collect: same option next to Self Online / Razorpay.  
- Settings: Canara credentials, cert paths/refs, mid/sid/terminal/VPA, enable flag.  
- Admin: “Connect Canara OAuth” once when refresh token dies.

### Payment lifecycle

```
pending → (QR shown) → processing / pending_payment
  → SUCCESS callback or status API → success → fee paid → Fee Mgmt sync → official receipt
  → failed / expired → failed | expired (student can retry new QR / new extTransactionId)
```

Store bank fields in `payments.gatewayResponse` (`provider: 'canara_dynamic_qr'`, rrn, txnId, qrString, etc.).

---

## Prerequisites from bank / college (before coding finishes)

Share / obtain and store securely:

1. **Client ID** and **Client Secret** (Developer Portal)  
2. **OAuth scope** (bank-specific)  
3. **Merchant mid, sid, terminalId, account, IFSC, MCC, mobile**  
4. **Symmetric encryption key** for A128CBC-HS256  
5. **Our RSA key pair** + public cert shared with bank; bank may share theirs for response verify if required  
6. **Egress IP(s)** of EMS servers for bank whitelist  
7. **Registered OAuth redirect URI**  
8. **Registered QR Callback URL** ← first operational dependency for realtime  
9. UAT base URL confirmation (`api.canarauat.bank.in`) and later Production URLs  

---

## Design decisions (locked for this module)

| Topic | Decision |
|-------|----------|
| Realtime truth source | **QR Callback** first; status API is backup |
| Match key | `extTransactionId` generated by EMS, unique, ≤35 chars |
| Amount | Exact fee; no convenience fee unless product later asks |
| Fee Management | Sync **only after** SUCCESS (callback or confirmed status) |
| Crypto | Backend only |
| vs Self Online | Parallel mode; Self Online remains for non-API college UPI |
| Idempotency | Callback may retry — process SUCCESS once; ignore duplicates |

---

## Implementation phases

### Phase 0 — Bank registration (ops, not code)

1. Create app in Canara Developer Portal  
2. Register **OAuth redirect** + **QR Callback URL**  
3. Share IP + public certificate  
4. Receive Client ID/Secret, keys, mid/sid/VPA details  

### Phase 1 — Callback + crypto + OAuth skeleton

1. Public HTTPS callback endpoint that logs/decrypts and returns 200  
2. Crypto helpers (sign / encrypt / decrypt) with UAT samples  
3. OAuth code exchange + refresh + secure token storage  

### Phase 2 — Dynamic QR order

1. Create EMS payment + call QR Generation  
2. Student/desk UI shows QR  
3. Callback marks paid end-to-end  

### Phase 3 — Hardening

1. Status poll / “Check status” + cron for stuck payments  
2. Settings UI, audit logs, amount mismatch guards  
3. UAT test matrix with bank  

### Phase 4 — Production

1. Prod URLs, certs, IP whitelist, regenerate keys if needed  
2. Cutover / enable in Settings  

---

## Clear answer: “What are we going to implement?”

1. **Give Canara a callback URL** on our EMS API that they POST to when a Dynamic QR payment succeeds/fails.  
2. **OAuth** so EMS can call Canara APIs with a Bearer token (refresh automatically).  
3. **Secure API client** (sign + encrypt requests, decrypt responses, required headers).  
4. **When a student pays a fee:** create unique `extTransactionId` → call **QR Generation (type D)** → show QR.  
5. **When bank hits callback:** match `extTransactionId` → mark paid in realtime → Fee Management + receipt.  
6. **If callback misses:** enquire status by `extTransactionId` and update the same way.

That is the whole product for Dynamic QR collection in EMS. Everything else (VPA onboarding, settings screens, cron) supports those six points.
