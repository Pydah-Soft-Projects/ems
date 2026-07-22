# EMS Application Architecture & Payment Settings Analysis

## Application Overview

The EMS (Examination Management System) is a comprehensive university examination management platform with support for multiple payment methods and role-based access control.

### Core Technology Stack
- **Backend**: Node.js + Express + TypeORM + MySQL
- **Frontend**: Next.js + TypeScript + React
- **Databases**: 
  - Exam Portal Database (MySQL): Main application data
  - Student Database (MySQL): Student records (separate)
  - HRMS MongoDB: User authentication data
  - Fee Management MongoDB: Financial records

### Key Modules

1. **Authentication & RBAC (Role-Based Access Control)**
   - HRMS MongoDB integration for user credentials
   - EMS role/permission system with 6 role types
   - JWT token-based authentication
   - Privilege-based route protection

2. **Examination Management**
   - Exam creation and configuration
   - Subject and exam-subject mapping
   - Late fee slabs
   - Hall tickets generation

3. **Fee Management**
   - Exam fee calculation and recording
   - Multiple payment methods:
     - **Razorpay**: Professional payment gateway
     - **Self-Online**: College UPI QR code (new feature)
   - Payment tracking and reconciliation

4. **Results Processing**
   - Mark uploads (PDF parsing)
   - Result generation and publication
   - Merchant statement reconciliation

5. **Settings Management**
   - Payment gateway configuration
   - System-wide settings
   - Razorpay credentials management
   - College UPI configuration

6. **Reporting & Analytics**
   - Audit logs
   - Exam statistics
   - Financial reports

## Payment Settings Data Flow

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SETTINGS MODULE                              │
└─────────────────────────────────────────────────────────────────┘

Frontend (React)                Backend (Node.js)              Database (MySQL)
─────────────────              ──────────────────              ─────────────────

Settings Page
  ├─ Razorpay Form          GET /api/settings/payments      payment_gateway_settings
  │  ├─ enabled               │                             ├─ id (PRIMARY KEY)
  │  ├─ razorpayKeyId        │                             ├─ enabled (bool)
  │  ├─ razorpayKeySecret    ├─ SettingsService            ├─ razorpayKeyId (str)
  │  └─ razorpayWebhookSecret│   .getPaymentSettingsPublic()├─ razorpayKeySecret (str)
  │                          │   .getOrCreateRow()         ├─ razorpayWebhookSecret (str)
  └─ Self-Online Form       │                             ├─ selfOnlineEnabled (bool) ← NEW
     ├─ selfOnlineEnabled    │                             ├─ selfOnlineUpiId (str) ← NEW
     ├─ selfOnlineUpiId      │  PaymentGatewaySettings     ├─ selfOnlineMerchantName (str) ← NEW
     ├─ selfOnlineMerchantName│  entity definition          ├─ selfOnlinePaymentNote (str) ← NEW
     ├─ selfOnlinePaymentNote└─────────────────────────────┤─ selfOnlineExpiryHours (int) ← NEW
     └─ selfOnlineExpiryHours                              ├─ createdAt (datetime)
                                                            └─ updatedAt (datetime)

PUT /api/settings/payments (update)
```

### Entity Definition
**File**: [payment-gateway-settings.entity.js](../src/settings/payment-gateway-settings.entity.js)

Defines 10 columns using TypeORM EntitySchema:
- `id` (int, primary key, auto-generated)
- `enabled` (boolean, default: false) - Razorpay enabled
- `razorpayKeyId` (varchar 100)
- `razorpayKeySecret` (varchar 255)
- `razorpayWebhookSecret` (varchar 255)
- `selfOnlineEnabled` (boolean, default: false) - NEW
- `selfOnlineUpiId` (varchar 150) - NEW
- `selfOnlineMerchantName` (varchar 150) - NEW
- `selfOnlinePaymentNote` (varchar 100) - NEW
- `selfOnlineExpiryHours` (int, default: 48) - NEW
- `createdAt` (datetime, auto-set on creation)
- `updatedAt` (datetime, auto-set on update)

### Service Layer
**File**: [settings.service.js](../src/settings/settings.service.js)

**Key Methods**:

1. **getOrCreateRow()**
   - Fetches or creates a single settings record
   - Returns database row with all fields
   - **Issue**: Queries all columns, fails if database is missing new columns

2. **getPaymentSettingsPublic()**
   - Called by GET /api/settings/payments
   - Masks secrets (shows ••• for passwords)
   - Returns combined Razorpay + self-online settings
   - Returns 15 fields including computed values

3. **updatePaymentSettings(dto)**
   - Updates settings based on request body
   - Validates inputs (e.g., expiryHours must be 1-720)
   - Supports partial updates
   - Saves only provided fields

4. **selfOnlinePublicFromRow(row)**
   - Extracts self-online payment data from database row
   - Returns: enabled, configured, ready, upiId, merchantName, paymentNote, expiryHours
   - "configured" = has UPI ID
   - "ready" = enabled AND configured

### API Routes
**File**: [settings.routes.js](../src/settings/settings.routes.js)

**Endpoints**:
- `GET /api/settings/payments` - Fetch payment settings (requires `settings:payments` privilege)
- `PUT /api/settings/payments` - Update payment settings (requires `settings:payments` privilege)

**Access Control**: Both routes require:
- Authentication (`requireStaff`)
- Authorization (`requirePrivilege('settings:payments')`)

### Frontend Integration
**File**: [frontend/src/app/dashboard/settings/page.tsx](../../frontend/src/app/dashboard/settings/page.tsx)

**State Management**:
- Loads settings on component mount via `api.getPaymentSettings()`
- Maintains separate form states for Razorpay and self-online
- Handles save with loading states

**UI Components**:
- Razorpay configuration section
  - Enabled toggle
  - Key ID input
  - Secret input (masked, shows ••••)
  - Webhook secret input
  
- Self-Online configuration section
  - Enabled toggle
  - UPI ID input
  - Merchant name input
  - Payment note input
  - Expiry hours input (numeric)

### Type Definitions
**File**: [lib/razorpayCheckout.ts](../../frontend/src/lib/razorpayCheckout.ts)

```typescript
interface PaymentGatewaySettings {
  enabled: boolean;
  configured: boolean;
  razorpayKeyId?: string;
  razorpayKeySecretMasked?: string;
  hasKeySecret: boolean;
  selfOnlineEnabled?: boolean;        // NEW
  selfOnlineConfigured?: boolean;     // NEW
  selfOnlineReady?: boolean;           // NEW
  selfOnlineUpiId?: string;            // NEW
  selfOnlineMerchantName?: string;     // NEW
  selfOnlinePaymentNote?: string;      // NEW
  selfOnlineExpiryHours?: number;      // NEW
  updatedAt: string;
}
```

## Database Schema Issue - Root Cause

### The Problem
When TypeORM generates a SELECT query via `repository.find()`, it includes all columns defined in the entity schema. If the database table is missing these columns, MySQL returns:
```
Error: Unknown column 'PaymentGatewaySettings.selfOnlineEnabled' in 'field list'
```

### Timeline of Events
1. **Phase 1**: Database created with basic Razorpay support
   - Table: `payment_gateway_settings` (5 columns + timestamps)
   
2. **Phase 2**: Self-online payment feature added to entity
   - Entity updated with 5 new columns
   - Code ready to handle self-online payments
   
3. **Phase 3**: Deployment/runtime
   - TypeORM synchronize setting not applied to existing database
   - Code tries to query new columns that don't exist
   - Error occurs

### Why TypeORM Sync Didn't Apply
- `EXAM_PORTAL_DB_SYNCHRONIZE=true` setting exists but may not have run
- TypeORM sync is cautious and won't drop columns, but may miss schema updates
- Existing database often resists automatic schema changes in production

## Solution Summary

### Migration Script
**File**: [scripts/migrate-add-self-online-columns.js](./migrate-add-self-online-columns.js)

**Purpose**: Add missing `selfOnline*` columns to database table

**Features**:
- Connects via MySQL credentials from `.env`
- Checks which columns are missing
- Adds only missing columns (safe/idempotent)
- Provides detailed logging
- Verifies final schema

**Usage**:
```bash
npm run migrate:add-self-online
```

### Implementation Steps

1. **Run Migration**
   ```bash
   cd backend
   npm run migrate:add-self-online
   ```

2. **Restart Backend**
   ```bash
   npm run dev
   ```

3. **Verify Fix**
   ```bash
   curl http://localhost:4000/api/settings/payments
   ```

## Code Consistency Check

### Backend Code ✅
- Entity defines all 10 columns correctly
- Service handles all columns in `getOrCreateRow()`, `updatePaymentSettings()`, `selfOnlinePublicFromRow()`
- No issues found in business logic

### Frontend Code ✅
- Settings page has forms for all new fields
- API types match backend response
- State management consistent

### Database Schema ❌ (Before Migration)
- Missing 5 columns: `selfOnline*` fields
- After migration: ✅ All columns present

## Prevention Strategies

### For Development
1. **Keep synchronize enabled**: `EXAM_PORTAL_DB_SYNCHRONIZE=true`
2. **Test entity changes**: Always test with synchronize enabled first
3. **Document schema changes**: Update PAYMENT_SETTINGS_FIX.md for future changes

### For Production
1. **Create explicit migrations**: Never rely on auto-sync
2. **Version migrations**: Number them (001_, 002_, etc.)
3. **Test migrations**: Run on staging before production
4. **Keep audit trail**: Document all schema changes

## Future Payment Features

### Extensibility
The current architecture supports adding more payment methods by:
1. Adding columns to `PaymentGatewaySettings` entity
2. Creating migration script
3. Updating service to handle new fields
4. Updating frontend UI
5. Implementing payment handler logic

### Possible Future Methods
- **PhonePe**: UPI payment aggregator
- **Square/Stripe**: International payments
- **Bank Direct**: NEFT/RTGS setup
- **Mobile Wallets**: Google Pay, Apple Pay
- **Cryptocurrency**: Blockchain payments (future)

## Summary

✅ **Issue**: New self-online payment columns added to entity but missing from database  
✅ **Impact**: Payment settings API fails with HTTP 500  
✅ **Root Cause**: Database schema out of sync with TypeORM entity definition  
✅ **Fix**: Migration script adds missing columns  
✅ **Apply**: `npm run migrate:add-self-online`  
✅ **Verify**: Restart and test endpoint  
✅ **Prevention**: Enable EXAM_PORTAL_DB_SYNCHRONIZE=true in development, use migrations in production  

The payment settings module now supports both Razorpay gateway payments and college UPI-based self-online payments.
