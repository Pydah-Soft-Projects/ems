# Quick Fix Guide - Payment Settings Error

## The Error
```
GET /api/settings/payments → HTTP 500
QueryFailedError: Unknown column 'PaymentGatewaySettings.selfOnlineEnabled' in 'field list'
```

## What Happened
Database table `payment_gateway_settings` is missing 5 new columns that the code expects:
- `selfOnlineEnabled`
- `selfOnlineUpiId`
- `selfOnlineMerchantName`
- `selfOnlinePaymentNote`
- `selfOnlineExpiryHours`

## Fix (3 Simple Steps)

### 1️⃣ Run the Migration
```bash
cd backend
npm run migrate:add-self-online
```

**Expected**: You'll see the columns being added successfully

### 2️⃣ Restart the Backend
```bash
npm run dev
# or
npm start
```

### 3️⃣ Test
```bash
# Should return HTTP 200 with payment settings
curl http://localhost:4000/api/settings/payments
```

## That's It! ✅

The error is now fixed. The endpoint will work and return the payment gateway settings properly.

## What the Migration Does
- ✅ Connects to your MySQL database
- ✅ Adds missing `selfOnline*` columns
- ✅ Safely skips already-existing columns
- ✅ Verifies the final schema

## If You Need More Details
See: [backend/PAYMENT_SETTINGS_FIX.md](backend/PAYMENT_SETTINGS_FIX.md)

## Architecture Context
- The error happens when TypeORM entity definition doesn't match database schema
- The code added self-online payment support (college UPI) but database wasn't updated
- Migration script synchronizes database with code
- See: [ARCHITECTURE_ANALYSIS.md](ARCHITECTURE_ANALYSIS.md) for complete app overview
