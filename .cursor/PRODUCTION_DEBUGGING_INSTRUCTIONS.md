# Production Debugging Instructions

## Important Context

- **Error shown to users**: "A processing error occurred" (from toast notification)
- **User description**: "No payment regardless of card details will be accepted"
- **Environment**: Production (not localhost)
- **Bug reporting**: Users can report bugs with additional notes via the "Report Problem" feature

## What We've Added

### 1. Enhanced Error Extraction
- Added multiple error extraction strategies to catch errors in different formats
- Added logging when error extraction fails
- Enhanced logging to capture full error objects

### 2. Vercel Log Formatting
All `console.error` statements now include structured data for easy searching in Vercel logs:
- Error type, code, message
- Context (packageId, userEmail, customerId, userId)
- Full error object as JSON

### 3. Debug Instrumentation
- Logs to both debug.log (if accessible) and Vercel logs
- All critical paths have instrumentation
- Hypothesis IDs (A-K) for easy filtering

## How to Debug in Production

### Step 1: Check Vercel Logs

1. Go to your Vercel dashboard
2. Navigate to your project → Logs
3. Filter for recent errors around the time users reported the issue
4. Look for log entries with:
   - `❌ Stripe error:` - Stripe API errors
   - `❌ Invoice payment error details (VERCEL LOGS):` - Invoice payment failures
   - `⚠️ WARNING: Generic error message detected!` - Error extraction failures
   - `🔍 API Error Response Structure:` - Full API error structure
   - `🔍 Error Object Structure:` - Full error object structure

### Step 2: Search for Specific Patterns

In Vercel logs, search for:
- `errorCode` - Stripe error codes
- `errorMessage` - Actual error messages (not generic ones)
- `paymentMethodId` - Payment method issues
- `customerId` - Customer-related issues
- `subscriptionId` - Subscription creation issues
- Hypothesis IDs: `hypothesisId:'A'` through `hypothesisId:'K'`

### Step 3: Look for These Specific Errors

Based on user description "No payment regardless of card details will be accepted", look for:

1. **Payment Method Attachment Errors**:
   - Search: `"Failed to attach/set default payment method"`
   - Search: `"Payment method attachment FAILED"`
   - Search: `hypothesisId:'A'` or `hypothesisId:'H'`

2. **No Payment Method Found**:
   - Search: `"No payment method found"`
   - Search: `hypothesisId:'G'`

3. **Invoice Payment Failures**:
   - Search: `"Invoice payment FAILED"`
   - Search: `hypothesisId:'I'`

4. **Generic Error Messages**:
   - Search: `"Generic error message detected"`
   - Search: `"ERROR EXTRACTION FAILED"`
   - Search: `hypothesisId:'K'`

### Step 4: Analyze Error Context

When you find the error, check the log entry for:
- `customerId` - Is the customer properly set up?
- `paymentMethodId` - Is the payment method attached?
- `errorCode` - What Stripe error code is returned?
- `errorMessage` - What's the actual Stripe error message?
- `packageId` - Which package is being purchased?
- `userEmail` - Which user is experiencing the issue?

## Common Issues and What to Look For

### Issue 1: "No payment regardless of card details will be accepted"
**Possible causes**:
- Payment method not attached to customer → Look for `hypothesisId:'A'` or `hypothesisId:'H'`
- Default payment method not set → Look for `hypothesisId:'B'`
- Customer account restrictions in Stripe → Check Stripe dashboard for customer

**What to check in logs**:
```
"message":"Payment method attachment FAILED"
"message":"No payment method found after all fallback strategies"
"message":"Default payment method verification"
```

### Issue 2: "Insufficient funds" when account has funds
**Possible causes**:
- Multiple authorization holds → Check for multiple payment attempts in logs
- Payment method state issues → Look for payment method errors
- Stripe account restrictions → Check Stripe dashboard

**What to check in logs**:
```
"errorCode":"insufficient_funds"
"errorCode":"card_declined"
"declineCode":"insufficient_funds"
```

### Issue 3: Generic "A processing error occurred"
**Possible causes**:
- Error extraction failed → Look for `"ERROR EXTRACTION FAILED"`
- API error structure changed → Check `"API Error Response Structure"`
- Network/timeout issues → Check for network errors

**What to check in logs**:
```
"WARNING: Generic error message detected!"
"ERROR EXTRACTION FAILED - could not parse error"
"API Error Response Structure:"
```

## Next Steps After Finding the Error

1. **If you find the actual Stripe error**:
   - Note the error code and message
   - Check Stripe documentation for that specific error
   - Fix the root cause based on the error

2. **If error extraction failed**:
   - Check the "ERROR EXTRACTION FAILED" log entry
   - Look at `errorStringified` field to see the actual error structure
   - Update error extraction logic to handle this error format

3. **If no errors found in logs**:
   - Error might be happening client-side before reaching the API
   - Check browser console logs (if accessible)
   - Consider adding client-side error logging

## Important Notes

- All instrumentation is wrapped in collapsible regions - won't clutter code
- Production logs are preserved in Vercel - safe to deploy
- Error extraction now tries multiple strategies to catch all error formats
- All console.error statements include structured data for Vercel search
