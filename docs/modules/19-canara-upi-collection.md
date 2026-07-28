# Module: Canara Bank UPI Collection

## Overview

Bank-confirmed **dynamic UPI QR** fee collection via **Canara Bank API Banking (Collection APIs)**. Unlike Self Online (college VPA + delayed statement reconcile), the bank issues a per-payment QR and confirms success through **QR Call-Back** and/or **transaction status poll** — same real-time feedback pattern as Razorpay.

Related: [Fee Payment](./09-fee-payment.md), [Self Online Payment](./18-self-online-payment.md).

| Channel | Confirmation | Money path |
|---------|--------------|------------|
| Razorpay | Checkout verify + optional webhook | Razorpay → settlement |
| Self Online | Admin statement reconcile | College UPI VPA |
| **Canara UPI** | Bank callback + status API | Canara Collection → college account |

## Design decisions (locked)

| Topic | Rule |
|-------|------|
| Credential storage | Dedicated versioned table — **not** inside `payment_gateway_settings` |
| Credential rotation | Client ID / Secret etc. rotate ~**every 6 months**; **full history kept** |
| One active row | Exactly **one** `isActive = true` at a time |
| On any settings change | **Insert new row** (copy unchanged columns + apply patch); deactivate previous |
| Secrets in API responses | Masked (`••••xxxx`); blank / mask-only values do not overwrite |
| Dynamic QR | Always `type: "D"` with unique `extTransactionId` = EMS payment reference |
| Fee paid when | Bank callback SUCCESS **or** status poll confirms success (idempotent) |
| Convenience fee | **None** for Canara UPI (exact fee amount) — same as Self Online unless product changes |
| Fee Management sync | After payment marked success (same as Razorpay) |
| Env fallback | Optional env for bootstrap/UAT only; **runtime prefers active DB row** |

## What the bank provides (UPI only)

### Prerequisites

- Static IP / range whitelisted (UAT + Production)
- Digital certificate (client) + bank-shared crypto material
- OAuth app registration (callback / redirect URL)
- Client ID + Client Secret (Developer Portal; ~6 month validity)
- AES symmetric key + RSA signing keys
- Merchant onboarding: `mid`, `sid`, `terminalId`, VPA (`upiId`), account / IFSC / MCC as required

### Security on every API call

1. Digitally sign plaintext payload — **RSA-SHA256** → header `x-signature` (base64)
2. Encrypt `encryptData` — **A128CBC-HS256** (symmetric key)
3. Headers: `x-client-id`, `x-Client-Secret`, `x-client-Certificate`, Bearer token, `x-api-interaction-id`, `x-timestamp`, etc.
4. Decrypt + verify bank responses the same way

Node sample (`sign` / AES encrypt / JWT-wrap / decrypt / verify) is the crypto foundation for the EMS client.

### UPI APIs used by EMS

| Bank API | EMS use |
|----------|---------|
| VPA Creation / Inquiry / Verify | One-time (or rare) merchant VPA lifecycle |
| **QR Generation** | Per fee payment — dynamic QR string |
| Intent Generation | Optional deep-link alternative to QR |
| **QR Call-Back** | Real-time success → mark EMS payment paid |
| Txn status by ExtTransaction ID | Poll / backup if callback delayed |
| Txn status by RRN | Ops / support lookup |
| QR Statement | Backfill / reconcile if callback missed |

UAT base (examples): `https://api.canarauat.bank.in/v1/upi/...`  
Prod host differs; store **base URL** on the credential version.

---

## Credential versioning (core of this module)

### Why a separate table

Razorpay / Self Online use a single `payment_gateway_settings` row. Canara credentials:

- Rotate on a fixed schedule (~6 months)
- Include large PEM blobs
- Need **audit history** of what was active when a past payment was made
- Must never lose the previous Client ID / Secret when rotating

### Table: `canara_upi_credential_versions`

One row = one **complete snapshot** of Canara config. Editing anything creates a **new** snapshot.

| Column | Type | Notes |
|--------|------|--------|
| `id` | INT PK AI | Version id |
| `isActive` | TINYINT(1) | Exactly one `1` among all rows |
| `enabled` | TINYINT(1) | Show Canara UPI as a pay method when ready |
| `environment` | VARCHAR(20) | `uat` \| `production` |
| `baseUrl` | VARCHAR(255) | API host prefix |
| `clientId` | VARCHAR(255) | `x-client-id` |
| `clientSecret` | VARCHAR(512) | `x-Client-Secret` |
| `oauthAccessToken` | TEXT NULL | Cached token (optional; may be refreshed in memory) |
| `oauthTokenExpiresAt` | DATETIME NULL | Token expiry |
| `aesSecretKeyHex` | VARCHAR(128) | Symmetric key (hex) |
| `privateKeyPem` | LONGTEXT | RSA private key for request signing |
| `clientPublicCertPem` | LONGTEXT | Sent as `x-client-Certificate` |
| `bankPublicCertPem` | LONGTEXT | Verify bank signatures / callbacks |
| `merchantMid` | VARCHAR(32) | Merchant ID (`mid` / `source`) |
| `merchantSid` | VARCHAR(32) | Sub-merchant ID |
| `terminalId` | VARCHAR(32) | Terminal ID |
| `upiId` | VARCHAR(150) | Merchant VPA |
| `merchantName` | VARCHAR(150) | Display name |
| `accountNumber` | VARCHAR(32) NULL | Onboarding / VPA create |
| `ifscCode` | VARCHAR(20) NULL | |
| `mcc` | VARCHAR(8) NULL | Merchant category |
| `mobileNumber` | VARCHAR(15) NULL | |
| `bankName` | VARCHAR(100) NULL | e.g. Canara Bank |
| `callbackUrl` | VARCHAR(500) NULL | QR Call-Back URL registered with bank |
| `credentialExpiresAt` | DATETIME NULL | Target rotate-by date (~activatedAt + 6 months) |
| `activatedAt` | DATETIME | When this row became active |
| `deactivatedAt` | DATETIME NULL | When superseded |
| `changeReason` | VARCHAR(255) NULL | e.g. `6-month rotation`, `updated mid` |
| `changedFields` | JSON/TEXT NULL | List of field names changed vs previous |
| `changedByUserId` | INT NULL | Staff who saved |
| `createdAt` | DATETIME | |
| `updatedAt` | DATETIME | |

### Copy-on-write rule (mandatory)

```
PUT /settings/canara-upi  (any field change)
  1. Load current active row (or empty defaults if none)
  2. Clone ALL columns into a new object
  3. Apply only real patches (skip blank secrets / •••• masks)
  4. If nothing actually changed → return active row (no new version)
  5. Else:
     - Set previous.isActive = false, deactivatedAt = now
     - New row: isActive = true, activatedAt = now
     - If auth/crypto secrets rotated → set credentialExpiresAt = now + 6 months
     - Store changedFields + changeReason + changedByUserId
     - INSERT new row
  6. Return public (masked) active view
```

**History:** `GET /settings/canara-upi/versions` lists all rows (newest first), secrets masked. Old rows stay forever for audit; payments can store `canaraCredentialVersionId` on the payment gateway payload for traceability.

```
┌─────────────┐     save change      ┌─────────────┐
│ Version N   │ ──────────────────►  │ Version N+1 │
│ isActive=0  │  copy + patch        │ isActive=1  │
│ deactivated │                      │ activated   │
└─────────────┘                      └─────────────┘
```

Only **runtime reads** use `WHERE isActive = 1`.

---

## Payment lifecycle (planned / implementing)

```
Student/staff chooses Canara UPI
  → POST /fees/canara-upi/order
       → EMS Payment pending (mode online / method upi / provider canara)
       → extTransactionId = unique EMS ref (≤35 chars per bank)
       → Bank QR Generation type=D
       → Store qrString + credential version id on payment
  → UI shows QR / upi:// deep link + waiting state
  → Student pays in UPI app
  → Bank POST /fees/canara-upi/callback  (QR Call-Back)
       → Decrypt/verify → match extTransactionId → mark success
       → Fee paid → Fee Management sync → receipt
  → UI polls GET /fees/payments/:id/status until success/fail/timeout
  → Backup: EMS may call txnStatus-extid if callback late
```

### Mapping to Razorpay (mental model)

| Razorpay | Canara UPI |
|----------|------------|
| Create order | QR Generation (`type: D`) |
| Checkout modal | Show `qrString` |
| Verify HMAC | Call-Back + optional status poll |
| Webhook | QR Call-Back URL |
| Key id/secret in settings | Versioned credential row |

---

## Implementation map

| Area | Path / notes | Status |
|------|----------------|--------|
| Module doc | `docs/modules/19-canara-upi-collection.md` | ✅ |
| Entity | `backend/src/settings/canara-upi-credential-version.entity.js` | ✅ |
| Ensure table | `backend/src/settings/ensure-canara-upi-credential-table.js` | ✅ |
| Versioning service | `backend/src/settings/canara-upi-settings.service.js` | ✅ |
| Settings API | `GET/PUT /settings/canara-upi`, `GET .../versions` | ✅ |
| Crypto client | `backend/src/exam/canara-upi-crypto.js` | ✅ |
| Bank HTTP client | `backend/src/exam/canara-upi-client.js` | ✅ |
| Fee order + callback + sync | `backend/src/exam/canara-upi.service.js` + fees routes | ✅ |
| Settings UI | Dashboard → Settings → Canara Bank UPI | ✅ |
| Student / desk pay UI | `CanaraUpiPayPanel` + desk/student channels | ✅ |

## Settings API (implemented)

Privilege: `settings:payments`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings/canara-upi` | Active version (secrets masked) + readiness |
| PUT | `/settings/canara-upi` | Patch → **new active version** (copy-on-write) |
| GET | `/settings/canara-upi/versions` | Full history (secrets masked) |

### Readiness

`ready` when `enabled` and required fields present on active row:

- `clientId`, `clientSecret`, `aesSecretKeyHex`
- `privateKeyPem`, `clientPublicCertPem`
- `merchantMid`, `merchantSid`, `terminalId`, `upiId`
- `baseUrl`

### PUT body (partial patch)

Any subset of columns. Optional `changeReason`. Secrets omitted or starting with `••••` are **copied from previous** unchanged.

## Fee APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/fees/canara-upi/status` | Public readiness (no secrets) |
| POST | `/fees/canara-upi/order` | Create payment + dynamic QR |
| POST | `/fees/canara-upi/:paymentId/sync` | Poll bank status by extTransactionId |
| POST | `/fees/canara-upi/callback` | Bank QR Call-Back (no staff auth; reply `200_OK`) |
| GET | `/fees/payments/:id/status` | Lightweight EMS status poll |

## Privileges

- `settings:payments` — configure credentials / view history  
- `fees:collect` / student fee pay — create order (when wired)  
- Callback route — **no staff auth**; authenticate via bank crypto + IP allowlist where possible  

## Ops notes

- Before Client ID/Secret expire (`credentialExpiresAt`), create a new version with rotated values and keep history.
- After rotate, confirm UAT/prod bank portal still matches active `clientId`.
- Do not delete old versions; investigators need them for past txn disputes.
- Store `canaraCredentialVersionId` on payment `gatewayResponse` when creating orders.

## Difference from Self Online (do not confuse)

| | Self Online | Canara UPI |
|--|-------------|------------|
| QR source | EMS builds `upi://pay?pa=...` | **Bank** returns `qrString` |
| Confirm | Statement upload + match | **Callback / status API** |
| Fee after pay claim | Stays pending until reconcile | Marks **paid** on bank success |
| Credentials | UPI id + name on gateway settings | Versioned Canara crypto + merchant ids |
