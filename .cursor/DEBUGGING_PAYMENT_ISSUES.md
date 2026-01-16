# Payment Issues Debugging - Instrumentation Summary

## Hypotheses Being Tested

### Hypothesis A: Payment Method Attachment Failures
**Location**: `create-subscription.ts:271-312`
**What we're tracking**:
- Payment method retrieval before attachment
- Payment method attachment to customer
- Verification that payment method is properly attached
- Errors during attachment process

**Expected behavior**: Payment method should be attached to customer before subscription creation.

### Hypothesis B: Default Payment Method Not Set Correctly
**Location**: `create-subscription.ts:283-299`
**What we're tracking**:
- Setting default payment method on customer
- Verification that default payment method was set correctly
- Mismatches between expected and actual default payment method

**Expected behavior**: Default payment method should be set and verified before subscription creation.

### Hypothesis C: Payment Method Reuse Issues
**Location**: `create-subscription.ts:313-324`
**What we're tracking**:
- Cases where payment method cannot be reused (consumed without attachment)
- Error messages when payment method reuse fails

**Expected behavior**: Payment methods from upfront PaymentIntents should either be reusable or we should collect a fresh one.

### Hypothesis D: Subscription Creation Failures
**Location**: `create-subscription.ts:358-406`
**What we're tracking**:
- Subscription creation parameters (customer ID, price ID, default payment method)
- Subscription creation success/failure
- PaymentIntent and invoice IDs from created subscription
- Stripe API errors during subscription creation

**Expected behavior**: Subscription should be created successfully with proper PaymentIntent attached.

### Hypothesis E: General Error Handling
**Location**: `create-subscription.ts:857-917`
**What we're tracking**:
- Stripe-specific errors (type, code, message)
- General server errors
- Error context (package ID, user email, customer ID)
- Error stack traces

**Expected behavior**: All errors should be properly logged with full context.

### Hypothesis F: Webhook Payment Failure Processing
**Location**: `webhook.ts:2475`
**What we're tracking**:
- Invoice payment failure details (failure reason, code, decline code)
- PaymentIntent ID extraction
- Initial payment vs renewal payment failures
- Package and user information

**Expected behavior**: Payment failures should be properly tracked with detailed error information.

### Hypothesis G: No Payment Method Found in Confirm Route
**Location**: `confirm-subscription-payment.ts:213-245`
**What we're tracking**:
- Cases where no payment method is found after all fallback strategies
- Customer ID, subscription status, invoice ID
- Whether user has saved payment methods

**Expected behavior**: Payment method should be found using fallback strategies or clear error should be returned.

### Hypothesis H: Payment Method Verification in Confirm Route
**Location**: `confirm-subscription-payment.ts:248-278`
**What we're tracking**:
- Payment method retrieval and attachment verification
- Automatic attachment if payment method is not attached
- Errors during verification/attachment

**Expected behavior**: Payment method should be verified and attached before paying invoice.

### Hypothesis I: Invoice Payment Failures
**Location**: `confirm-subscription-payment.ts:283-300`
**What we're tracking**:
- Invoice payment attempts
- Invoice payment success/failure
- PaymentIntent creation from invoice payment
- Stripe API errors during invoice payment

**Expected behavior**: Invoice should be paid successfully, creating a PaymentIntent.

### Hypothesis J: Frontend Subscription Confirmation Failures
**Location**: `MembershipModal.tsx:2559`
**What we're tracking**:
- Subscription payment confirmation errors in frontend
- Error messages and codes
- Package and user information

**Expected behavior**: Subscription confirmation should succeed or provide clear error message.

### Hypothesis K: Frontend Error Message Processing
**Location**: `MembershipModal.tsx:3177-3303`
**What we're tracking**:
- Error extraction from API responses
- Payment failure detection
- Error message transformation
- Final error message shown to user

**Expected behavior**: Errors should be properly extracted and transformed into user-friendly messages.

## Key Issues Being Investigated

1. **"Insufficient funds" errors when account has funds**
   - Tracked in: Hypotheses D, E, F, I, K
   - Could be caused by: Payment method attachment issues, multiple authorization holds, Stripe account restrictions

2. **"No payment regardless of card details will be accepted" error**
   - Tracked in: Hypotheses A, B, G, H
   - Could be caused by: Payment method not attached, default payment method not set, customer configuration issues

3. **Some payments working, some not**
   - Tracked in: All hypotheses
   - Could be caused by: Race conditions, payment method state issues, intermittent Stripe API issues

## Log Locations

- **Server logs**: Vercel logs (console.error/console.log statements)
- **Debug logs**: `c:\Codes\ToolsAustralia\.cursor\debug.log` (NDJSON format)
- **Debug endpoint**: `http://127.0.0.1:7242/ingest/6d8a8556-1519-4b01-80e9-11ea61ccfeea`

## Next Steps

1. **Reproduce the issue** with instrumentation active
2. **Check debug.log** for detailed instrumentation data
3. **Check Vercel logs** for console.error/console.log output
4. **Analyze logs** to identify which hypothesis is confirmed/rejected
5. **Fix the root cause** based on log evidence
6. **Verify the fix** with another test run

## Important Notes

- All instrumentation logs are wrapped in collapsible regions (`// #region agent log` / `// #endregion`)
- Logs include hypothesis IDs (A-K) for easy filtering
- All console.error statements are preserved for Vercel logging
- Error context is captured at multiple points in the flow
