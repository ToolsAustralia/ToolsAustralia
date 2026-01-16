# Klaviyo Timeout Error Fix

## Issue Identified

**Error**: `❌ Klaviyo request failed after 1 attempts: Klaviyo API timeout after 30000ms`
**Location**: `/api/admin/dashboard/projected-income` (but error is from background Klaviyo sync)

## Root Cause

1. **PATCH profile method was using `maxRetries = 1`** - This meant timeout errors were only retried once before failing
2. **Idempotency check had no timeout wrapper** - Could hang indefinitely if Klaviyo API is slow
3. **Background syncs could block** - Timeout errors weren't properly handled as non-blocking

## Fixes Applied

### Fix 1: Increased Retries for PATCH Operations
- Changed `maxRetries = 1` to `maxRetries = this.MAX_RETRIES` (5 retries)
- Timeout errors are now retried up to 5 times with exponential backoff

### Fix 2: Added Timeout Wrapper for Idempotency Check
- Wrapped idempotency check in `Promise.race()` with 10-second timeout
- Prevents idempotency check from hanging and blocking profile creation

### Fix 3: Improved Error Logging
- Timeout errors are now logged as warnings (non-critical) instead of errors
- Added detailed error context for debugging

### Fix 4: Enhanced Background Sync Error Handling
- Background Klaviyo syncs now log timeouts as warnings, not errors
- Prevents timeout errors from appearing as critical failures

## Why This Happens

The Klaviyo API can timeout due to:
- Network latency
- Klaviyo API slowness
- Rate limiting (429 errors)
- Gateway errors (502/504)

The projected-income route doesn't call Klaviyo directly, but background profile syncs might be triggered when:
- User data is queried
- Admin dashboard loads and triggers profile syncs
- Webhook processes payment and syncs profile

## Expected Behavior After Fix

1. **Timeout errors will be retried** up to 5 times before failing
2. **Idempotency checks won't hang** - 10-second timeout prevents blocking
3. **Background syncs won't block** - Timeouts are logged but don't break the flow
4. **Better error visibility** - Timeout errors are clearly identified in logs

## Monitoring

After deployment, monitor Vercel logs for:
- `⚠️ Klaviyo idempotency check timeout` - Non-blocking, expected
- `⚠️ Klaviyo profile sync timeout` - Non-blocking, expected
- `❌ Klaviyo request failed after 5 attempts` - If this appears, Klaviyo API might be down
