# CRM to EMS Single Sign-On (SSO) Integration Specification

This specification documents the end-to-end integration between the **CRM Authentication Gateway** and the **Examination Management System (EMS)** portal.

---

## 1. System Roles & Architecture

```
┌────────────────────────────────────────────────────────┐
│                   CRM Authentication Gateway            │
│  Frontend: https://crm.pydah.edu.in                     │
│  Backend:  https://pydah-crm-backend.pydah.edu.in       │
└───────────────────────────┬────────────────────────────┘
                            │
              1. User clicks EMS Portal
              2. CRM issues Encrypted SSO Token
              3. Redirects to EMS with ?token=...
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             Examination Management System (EMS)        │
│  Frontend: https://ems.pydah.edu.in                     │
│  Backend:  https://ems-backend.pydah.edu.in (or :4000)  │
└───────────────────────────┬────────────────────────────┘
                            │
              4. EMS Backend calls CRM Backend:
                 POST /auth/verify-token
              5. CRM Backend validates & returns user data
              6. EMS creates local JWT session & redirects:
                 - Staff/Admin  → /dashboard
                 - Student      → /student
```

---

## 2. Environments & URLs

| Component | Local Development | Production |
|---|---|---|
| **CRM Frontend** | `http://localhost:5173` | `https://crm.pydah.edu.in` |
| **CRM Backend API** | `http://localhost:3000` | `https://pydah-crm-backend.pydah.edu.in` |
| **EMS Frontend** | `http://localhost:3000` (or `3001`) | `https://ems.pydah.edu.in` |
| **EMS Backend API** | `http://localhost:4000` | `https://ems-api.pydah.edu.in` |

---

## 3. How the CRM Gateway Must Integrate

### Step 1: User Redirect from CRM

When an authenticated user in CRM clicks on the **Examination Management System (EMS)** card/link:

1. CRM generates an encrypted SSO token.
2. CRM redirects the user's browser to the EMS login page:

```text
https://ems.pydah.edu.in/login?token={ENCRYPTED_TOKEN}
```
*(In local development: `http://localhost:3000/login?token={ENCRYPTED_TOKEN}` or `http://localhost:3001/login?token={ENCRYPTED_TOKEN}`)*

> **Important (URL Encoding):** Always URL-encode the token using `encodeURIComponent(token)` before appending it to the URL query string. Base64 characters like `+`, `/`, and `=` can otherwise be corrupted during HTTP transmission.

---

### Step 2: Token Verification Endpoint on CRM Backend

The EMS Backend will make a server-to-server HTTP request to the CRM Backend to verify the incoming token.

- **Method**: `POST`
- **Path**: `/auth/verify-token`
- **Full URL (Production)**: `https://pydah-crm-backend.pydah.edu.in/auth/verify-token`
- **Full URL (Dev)**: `http://localhost:3000/auth/verify-token`
- **Headers**:
  ```http
  Content-Type: application/json
  ```

#### Request Payload (sent by EMS Backend):
```json
{
  "encryptedToken": "base64-or-encrypted-token-string"
}
```

#### Success Response from CRM (HTTP 200):
```json
{
  "success": true,
  "valid": true,
  "data": {
    "userId": "6640c3...",
    "portalId": "examination-portal",
    "role": "staff",
    "email": "faculty@pydah.edu.in",
    "employeeId": "EMP102",
    "username": "faculty@pydah.edu.in",
    "expiresAt": "2026-10-13T18:30:00.000Z"
  }
}
```

For Students:
```json
{
  "success": true,
  "valid": true,
  "data": {
    "userId": "1542",
    "portalId": "student-portal",
    "role": "student",
    "pinNo": "23A91A0501",
    "username": "23A91A0501",
    "expiresAt": "2026-10-13T18:30:00.000Z"
  }
}
```

#### Failure / Expired Response from CRM (HTTP 200 or 401):
```json
{
  "success": false,
  "valid": false,
  "message": "Invalid or expired token"
}
```

---

## 4. Accepted Portal Identifiers (`portalId`)

To ensure smooth interoperability, the EMS backend accepts any of the following portal identifiers in `verifyResult.data.portalId`:
- `examination-portal` *(Recommended standard)*
- `ems`
- `examination`
- `student-portal` *(for student access)*

---

## 5. EMS User Resolution & Session Generation

When the EMS backend receives valid payload data from the CRM backend, it resolves the user account using the following hierarchy:

### A. Students
- **Identification**: `data.role === 'student'`, `data.pinNo`, `data.rollNumber`, or `databaseSource === 'student_credentials'`.
- **Lookup**: Matched in the SDMS student database (`sdms.findStudentCredentials`) by PIN / Roll Number / Username.
- **Action**: Issues an EMS Student JWT (`role: 'student'`).
- **Destination**: Redirected automatically to `/student`.

### B. Bootstrap Super Administrator
- **Identification**: `data.email === 'ravi@pydahsoft.in'`.
- **Action**: Bypasses role checks, assigns complete super admin privileges (`*`), and issues an EMS Super Admin JWT.
- **Destination**: Redirected automatically to `/dashboard`.

### C. Staff & Administrators
- **Identification**: HRMS Employee / User.
- **Lookup**: Matched in HRMS MongoDB (`users` or `employees` collection) via `hrmsUserId`, `email`, or `employeeId`.
- **Authorization**: Looks up the user's role and privileges in the EMS RBAC system.
  - If the user has an active EMS role: Issues EMS Staff JWT and redirects to `/dashboard`.
  - If the user exists in HRMS but does not have an EMS role assigned yet: Returns HTTP 403 Forbidden with message:
    `"Your account is verified via CRM, but you do not have an active EMS role assigned. Contact an EMS Super Admin to grant you access."`

---

## 6. Frontend Handling in EMS

1. **Stale Session Purge**: When `?token=` is present, any previous session in `localStorage` and cookies (`ems_token`, `ems_user`, `ems_role`) is cleared immediately before attempting login.
2. **Branded Loading State**: A spinner and message `"Verifying Single Sign-On..."` is displayed while contacting the backend.
3. **Error Recovery**:
   - If the token is invalid, expired, or the user is not provisioned in EMS, a clear alert is presented.
   - Provides a direct link **"Return to CRM Portal"** pointing to `https://crm.pydah.edu.in`.
   - Provides an option **"Sign In with Password"** to switch back to normal login.
4. **Logout Behavior**:
   - **For SSO Users**: When an SSO-authenticated user logs out, EMS displays an alert popup (*"Logged out successfully. Returning to CRM Portal…"*) and navigates the browser directly back to the CRM portal (`https://crm.pydah.edu.in`).
   - **For Standard Users**: When a standard user logs out, they are redirected to the local EMS login page (`/login` or `/student/login`).

---

## 7. Testing Checklist

1. **Staff SSO**:
   - Log into CRM Gateway with staff credentials.
   - Click the EMS card.
   - Verify redirection to `https://ems.pydah.edu.in/login?token=...`.
   - Verify automatic login and redirect to `/dashboard`.

2. **Student SSO**:
   - Log into CRM Gateway with student credentials.
   - Click the EMS card.
   - Verify automatic login and redirect to `/student`.

3. **Expired Token**:
   - Use a token that has passed `expiresAt`.
   - Verify that EMS displays `"SSO token has expired"` and offers the button `"Return to CRM Portal"`.
