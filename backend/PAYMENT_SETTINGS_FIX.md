# EMS Payment Settings - Database Schema Fix

## Problem Summary
The `/api/settings/payments` endpoint was returning a **500 error** with the message:
```
QueryFailedError: Unknown column 'PaymentGatewaySettings.selfOnlineEnabled' in 'field list'
```

### Error Details
- **Endpoint**: `GET /api/settings/payments`
- **Service**: ems-backend
- **Table**: `payment_gateway_settings`
- **Missing Columns**: `selfOnlineEnabled`, `selfOnlineUpiId`, `selfOnlineMerchantName`, `selfOnlinePaymentNote`, `selfOnlineExpiryHours`

## Root Cause Analysis

### Database vs Entity Schema Mismatch
The TypeORM entity definition (`payment-gateway-settings.entity.js`) defines several columns for handling **college UPI-based payments** (self-online payments), but these columns don't exist in the actual MySQL database table.

**Entity Definition (Expected):**
```javascript
{
  id: integer (primary key),
  enabled: boolean,
  razorpayKeyId: varchar(100),
  razorpayKeySecret: varchar(255),
  razorpayWebhookSecret: varchar(255),
  selfOnlineEnabled: boolean,              // ← MISSING
  selfOnlineUpiId: varchar(150),           // ← MISSING
  selfOnlineMerchantName: varchar(150),    // ← MISSING
  selfOnlinePaymentNote: varchar(100),     // ← MISSING
  selfOnlineExpiryHours: integer,          // ← MISSING
  createdAt: datetime,
  updatedAt: datetime
}
```

**Database Table (Actual):**
Only has the Razorpay-related columns; missing all `selfOnline*` columns.

### Why This Happened
1. The database was created/initialized before the self-online payment feature was added
2. The `selfOnline*` columns were added to the TypeORM entity definition
3. TypeORM's automatic synchronization (`EXAM_PORTAL_DB_SYNCHRONIZE=true`) didn't run or failed to add the columns
4. When the settings service tries to query all columns via `repository.find()`, it generates a SELECT query that includes the non-existent columns, causing a MySQL error

## Application Workflow

### Settings Request Flow
```
GET /api/settings/payments
    ↓
SettingsService.getPaymentSettingsPublic()
    ↓
SettingsService.getOrCreateRow()
    ↓
settingsRepo.find() → Generates: SELECT * with all entity columns
    ↓
MySQL Error: Unknown column 'selfOnlineEnabled'
    ↓
HTTP 500 Error
```

### Settings Service Method Chain
1. **getPaymentSettingsPublic()** - Called by the GET endpoint
   - Calls `getOrCreateRow()` to fetch or create a settings record
   - Extracts public-safe data (masks secrets)
   - Returns combined Razorpay + self-online payment info

2. **getOrCreateRow()** - Core data access
   - Uses `settingsRepo.find()` to query the database
   - TypeORM automatically includes all entity columns in SELECT query
   - Fails because `selfOnline*` columns don't exist

3. **updatePaymentSettings()** - Called by PUT endpoint
   - Updates Razorpay and self-online settings
   - Would also fail when trying to query existing data

## Solution

### Migration Script
A migration script has been created at `backend/scripts/migrate-add-self-online-columns.js`

**This script:**
- Connects to the exam portal database
- Checks which `selfOnline*` columns are missing
- Adds only the missing columns (safely idempotent)
- Verifies the changes
- Provides detailed logging for troubleshooting

### How to Apply the Fix

#### Step 1: Run the Migration
```bash
cd backend
npm run migrate:add-self-online
```

**Expected Output:**
```
=== EMS Payment Settings Migration ===
Connecting to MySQL at student-database.cfu0qmo26gh3.ap-south-1.rds.amazonaws.com:3306, database: examination_portal...

📋 Checking current table structure...
Existing columns: id, enabled, razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret, createdAt, updatedAt

✏️  Adding column: selfOnlineEnabled
✏️  Adding column: selfOnlineUpiId
✏️  Adding column: selfOnlineMerchantName
✏️  Adding column: selfOnlinePaymentNote
✏️  Adding column: selfOnlineExpiryHours

5 column(s) added successfully!

📋 Verifying updated table structure...

Updated table structure:
  • id: int(11) (NOT NULL)
  • enabled: tinyint(1) (NOT NULL) [DEFAULT: 0]
  • razorpayKeyId: varchar(100) (nullable)
  • razorpayKeySecret: varchar(255) (nullable)
  • razorpayWebhookSecret: varchar(255) (nullable)
  • selfOnlineEnabled: tinyint(1) (NOT NULL) [DEFAULT: 0]
  • selfOnlineUpiId: varchar(150) (nullable)
  • selfOnlineMerchantName: varchar(150) (nullable)
  • selfOnlinePaymentNote: varchar(100) (nullable) [DEFAULT: Exam Fee]
  • selfOnlineExpiryHours: int(11) (NOT NULL) [DEFAULT: 48]
  • createdAt: datetime(6) (NOT NULL)
  • updatedAt: datetime(6) (NOT NULL)

✨ Migration completed successfully!
```

#### Step 2: Restart the Backend
```bash
npm run dev
# or
npm start
```

#### Step 3: Verify the Fix
Test the endpoint that was failing:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/settings/payments
```

**Expected Response (HTTP 200):**
```json
{
  "enabled": false,
  "configured": false,
  "razorpayKeyId": null,
  "razorpayKeySecretMasked": null,
  "hasKeySecret": false,
  "selfOnlineEnabled": false,
  "selfOnlineConfigured": false,
  "selfOnlineReady": false,
  "selfOnlineUpiId": null,
  "selfOnlineMerchantName": "College Examination Fees",
  "selfOnlinePaymentNote": "Exam Fee",
  "selfOnlineExpiryHours": 48,
  "updatedAt": "2026-07-22T06:24:16.000Z"
}
```

## Column Definitions

| Column Name | Type | Default | Purpose |
|---|---|---|---|
| `selfOnlineEnabled` | BOOLEAN | FALSE | Enable/disable college UPI payment feature |
| `selfOnlineUpiId` | VARCHAR(150) | NULL | UPI ID for receiving student payments |
| `selfOnlineMerchantName` | VARCHAR(150) | NULL | Merchant name displayed to students |
| `selfOnlinePaymentNote` | VARCHAR(100) | "Exam Fee" | Payment description shown to students |
| `selfOnlineExpiryHours` | INT | 48 | QR code validity period in hours |

## Technical Details

### Payment Gateway Features Supported
1. **Razorpay Integration** (existing)
   - Gateway-based online payments
   - Webhook support
   - Professional payment processing

2. **Self-Online Payments** (new)
   - College UPI QR code
   - Direct payment to college account
   - No gateway fees
   - Ideal for institutions with UPI infrastructure

### Entity and Service Consistency
- **Entity**: `payment-gateway-settings.entity.js` - Defines all 10 columns
- **Service**: `settings.service.js` - Handles both Razorpay and self-online configurations
- **Database**: Now synchronized after migration

## Troubleshooting

### Migration Script Fails to Connect
**Error**: `Error: connect ECONNREFUSED`

**Solution**:
- Verify `EXAM_PORTAL_DB_HOST`, `EXAM_PORTAL_DB_PORT` in `.env`
- Check database is accessible from your machine
- Verify credentials in `.env`

### Columns Already Exist
**Output**: `✅ Column already exists: selfOnlineEnabled ...`

**This is normal** - The script safely skips existing columns. All columns may already exist from a previous TypeORM sync.

### Still Getting "Unknown column" Error After Migration
**Solution**:
1. Clear TypeORM entity cache: Delete `node_modules/.typeorm` if it exists
2. Restart backend: `npm run dev`
3. Check that the migration script ran successfully

## Related Files

### Entity Definition
- [payment-gateway-settings.entity.js](../src/settings/payment-gateway-settings.entity.js)

### Service Implementation
- [settings.service.js](../src/settings/settings.service.js)

### API Routes
- [settings.routes.js](../src/settings/settings.routes.js)

### Migration Script
- [migrate-add-self-online-columns.js](./migrate-add-self-online-columns.js)

### Frontend Integration
- [settings/page.tsx](../../frontend/src/app/dashboard/settings/page.tsx)

## Prevention for Future

### Database Schema Management Best Practices
1. **Enable TypeORM Synchronize**: Set `EXAM_PORTAL_DB_SYNCHRONIZE=true` in development
2. **Manual Migrations**: For production, use explicit migration scripts before deploying code changes
3. **Code Review**: Ensure database schema changes are tested before merging
4. **Documentation**: Update this document when new columns are added

### Migration Workflow
1. Add columns to entity definition
2. Create migration script in `backend/scripts/`
3. Add npm script to `package.json`
4. Document in this file
5. Run migration before deploying new code
6. Verify via API tests

## Summary

✅ **Issue**: Database table missing `selfOnline*` columns  
✅ **Impact**: Payment settings API returns HTTP 500  
✅ **Fix**: Migration script adds missing columns  
✅ **Apply**: Run `npm run migrate:add-self-online`  
✅ **Verify**: Restart backend and test endpoint  

The self-online payment feature is now ready to use for handling college UPI-based payments without requiring a payment gateway.
