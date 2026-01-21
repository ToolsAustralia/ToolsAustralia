# Payment Error Handling and Recovery System

## Overview

This document describes the comprehensive payment error handling and recovery system implemented to provide seamless user experience, automatic error recovery, and expert frontend error handling patterns. The system ensures all payment errors are handled gracefully, with state preservation and automatic recovery when possible, allowing users to retry without closing/reopening modals.

**Key Goals Achieved:**
- ✅ Cleaner Stripe dashboard (one PaymentIntent per subscription payment)
- ✅ Expert frontend error handling for ALL payment endpoints
- ✅ State preservation on ALL errors (seamless retry)
- ✅ Automatic recovery for recoverable errors
- ✅ Better UI/UX with clear feedback and loading states
- ✅ User-friendly error messages with "Try again" guidance

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Core Utilities](#core-utilities)
4. [Component Updates](#component-updates)
5. [Error Handling Flow](#error-handling-flow)
6. [State Preservation Strategy](#state-preservation-strategy)
7. [Recovery Mechanisms](#recovery-mechanisms)
8. [User Experience Improvements](#user-experience-improvements)
9. [Best Practices Implemented](#best-practices-implemented)
10. [API Reference](#api-reference)
11. [Testing Scenarios](#testing-scenarios)
12. [Troubleshooting](#troubleshooting)

---

## Problem Statement

### Initial Issues

1. **Multiple PaymentIntents**: Subscriptions were triggering 3 PaymentIntents, causing:
   - Bank issues and authorization holds
   - Cluttered Stripe dashboard
   - Unnecessary codebase complexity
   - Incorrect amounts in Google Pay and Apple Pay

2. **Poor Error Handling**: When payment endpoints threw errors:
   - Users couldn't retry without closing/reopening modals
   - Form state was lost on errors
   - Generic error messages without actionable guidance
   - No automatic recovery for recoverable errors
   - Poor UX causing user frustration

3. **Specific Error Scenarios**:
   - `setup_intent_unexpected_state` (already succeeded)
   - `payment_intent_unexpected_state` (already succeeded)
   - "Payment Failed" errors
   - "payment processing error" messages
   - Network errors
   - Card declined errors
   - All required manual modal reset

### Goals

- **Cleaner Stripe Dashboard**: One PaymentIntent per subscription payment
- **Expert Error Handling**: All API errors handled gracefully and expertly in frontend
- **State Preservation**: All errors preserve form state for seamless retry
- **Automatic Recovery**: Recoverable errors handled automatically when possible
- **Better UI/UX**: Clear error messages, loading states, retry capabilities
- **User Guidance**: All errors include "Try again" or actionable guidance

---

## Solution Architecture

### Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Utilities (Pure Functions)                     │
│ - payment-error-detection.ts                            │
│ - payment-error-messages.ts                             │
│ - setup-intent-recovery.ts                              │
│ - payment-intent-recovery.ts                            │
│ - payment-state-preservation.ts                         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Components (UI Logic)                          │
│ - PaymentMethodSelector.tsx (Error detection)           │
│ - MembershipModal.tsx (Recovery orchestration)          │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Layer 3: UI Feedback                                    │
│ - Toast notifications                                   │
│ - Loading states                                        │
│ - Error states                                          │
└─────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── utils/payment/stripe/
│   ├── payment-error-detection.ts        # Error detection & categorization
│   ├── payment-error-messages.ts         # User-friendly error formatting
│   ├── setup-intent-recovery.ts          # SetupIntent recovery logic
│   ├── payment-intent-recovery.ts        # PaymentIntent recovery logic
│   └── payment-state-preservation.ts     # State preservation utilities
│
└── components/modals/
    ├── PaymentMethodSelector.tsx         # Updated error handling
    └── MembershipModal.tsx               # Expert error handling & recovery
```

---

## Core Utilities

### 1. Payment Error Detection (`payment-error-detection.ts`)

**Purpose**: Centralized logic to detect and categorize ALL payment errors.

**Key Functions**:

- `detectPaymentError(error)`: Comprehensive error detection with all information
- `isRecoverableError(error)`: Determines if error can be automatically recovered
- `categorizeError(error)`: Categorizes errors (recoverable, retryable, non-recoverable)
- `getRecoveryStrategy(error)`: Determines recovery strategy needed
- `shouldPreserveState(error)`: Always returns `true` (state always preserved)

**Error Categories**:
- `recoverable`: Can be automatically fixed (e.g., SetupIntent already succeeded)
- `retryable`: User can retry (e.g., card declined, network error)
- `non-recoverable`: Generic errors that still allow retry

**Error Types Detected**:
- `setup_intent_unexpected_state`
- `payment_intent_unexpected_state`
- `payment_processing_error`
- `payment_failed`
- `card_declined`
- `insufficient_funds`
- `network_error`
- `unknown`

**Recovery Strategies**:
- `setup_intent_recovery`: Create new SetupIntent
- `payment_intent_recovery`: Create new PaymentIntent
- `api_retry`: Simple API retry
- `manual_retry`: User must retry manually
- `none`: No recovery available

### 2. Payment Error Messages (`payment-error-messages.ts`)

**Purpose**: Centralized error message formatting for ALL payment errors.

**Key Functions**:

- `formatPaymentError(error)`: Formats error with title, message, and "Try again" flag
- `getPaymentErrorTitle(error)`: Get error title only
- `getPaymentErrorMessage(error)`: Get error message only

**Error Messages** (All include "Try again" or actionable guidance):

| Error Type | Title | Message |
|------------|-------|---------|
| `setup_intent_unexpected_state` (already succeeded) | Payment Setup Already Completed | This payment method setup was already completed. Creating a new one. Please try again. |
| `payment_intent_unexpected_state` (already succeeded) | Payment Already Completed | This payment was already completed. Please try again. |
| Payment Failed | Payment Failed | Payment failed. Please check your card details and try again. |
| payment processing error | Payment Processing Error | A payment processing error occurred. Please try again. |
| Card declined | Card Declined | Your card was declined. Please check your card details or try a different payment method. |
| Insufficient funds | Insufficient Funds | Insufficient funds. Please ensure you have sufficient balance and try again. |
| Network error | Connection Error | Connection error. Please check your internet and try again. |

### 3. SetupIntent Recovery (`setup-intent-recovery.ts`)

**Purpose**: Centralized logic for SetupIntent recovery.

**Key Functions**:

- `recoverSetupIntent()`: Creates new SetupIntent when existing one has already succeeded

**Return Type**:
```typescript
interface SetupIntentRecoveryResult {
  success: boolean;
  clientSecret: string | null;
  setupIntentId: string | null;
  error?: string;
}
```

**Usage**:
```typescript
const recoveryResult = await recoverSetupIntent();
if (recoveryResult.success) {
  // Use recoveryResult.clientSecret for new SetupIntent
  setSetupIntentClientSecret(recoveryResult.clientSecret);
}
```

### 4. PaymentIntent Recovery (`payment-intent-recovery.ts`)

**Purpose**: Centralized logic for PaymentIntent recovery (for one-time purchases).

**Key Functions**:

- `recoverPaymentIntent(options)`: Creates new PaymentIntent when existing one has already succeeded or was canceled

**Options**:
```typescript
interface PaymentIntentRecoveryOptions {
  amount: number;        // Amount in cents
  currency?: string;     // Default: "aud"
  metadata?: Record<string, string>;
  paymentMethodId?: string;
}
```

**Return Type**:
```typescript
interface PaymentIntentRecoveryResult {
  success: boolean;
  clientSecret: string | null;
  paymentIntentId: string | null;
  error?: string;
}
```

### 5. State Preservation (`payment-state-preservation.ts`)

**Purpose**: Centralized logic for preserving form state on errors.

**Key Functions**:

- `preservePaymentState(error, currentState)`: Determines state preservation strategy
- `getStatePreservationInstructions(error)`: Get preservation instructions

**State Preserved**:
- ✅ SetupIntent client secret
- ✅ PaymentIntent client secret
- ✅ Payment method ID
- ✅ Form data (first name, last name, email, etc.)

**When State is Cleared**:
- Only when automatic recovery succeeds (new SetupIntent/PaymentIntent created)
- User explicitly wants to change payment method
- Payment succeeds successfully

---

## Component Updates

### PaymentMethodSelector.tsx

**Changes Made**:

1. **Imported Utilities**:
   - `categorizeError`, `isRecoverableError`, `getRecoveryStrategy`
   - `formatPaymentError`
   - `getStatePreservationInstructions`

2. **Updated Error Handling** (lines 481-513):
   - Uses `categorizeError()` to categorize ALL errors
   - Uses `formatPaymentError()` for all error messages
   - Returns structured error with recovery flags
   - Never clears form state on errors

3. **Enhanced Return Type**:
   ```typescript
   {
     paymentMethodId?: string;
     paymentIntentId?: string;
     error?: string;
     setupIntentAlreadySucceeded?: boolean;
     errorCategory?: "recoverable" | "retryable" | "non-recoverable";
     errorType?: string;
     isRecoverable?: boolean;
     recoveryStrategy?: string;
     shouldPreserveState?: boolean;
   }
   ```

### MembershipModal.tsx

**Changes Made**:

1. **Imported Utilities**:
   - All error detection, recovery, and formatting utilities

2. **Created `handlePaymentRecovery()` Function** (around line 1565):
   - Handles automatic recovery for recoverable errors
   - Creates new SetupIntent/PaymentIntent when needed
   - Shows toast notifications during recovery
   - Retries API calls automatically

3. **Created `handlePaymentError()` Function** (around line 1615):
   - Universal error handler for ALL payment errors
   - Categorizes errors automatically
   - Preserves state for ALL errors
   - Handles recoverable errors with automatic recovery
   - Handles non-recoverable errors with formatted messages
   - Shows appropriate toast notifications

4. **Updated Error Handling for ALL API Calls**:
   - **confirm-subscription-payment** (line ~2784): Uses `handlePaymentError()`
   - **create-subscription** (line ~3874): Uses `handlePaymentError()`
   - **setupIntentAlreadySucceeded** (line ~2390): Uses `handlePaymentRecovery()`
   - **ALL other payment endpoints**: Same pattern

5. **State Preservation**:
   - ✅ **NEVER** clears `setupIntentClientSecret` on API errors
   - ✅ **NEVER** clears `paymentMethodId` on API errors
   - ✅ **NEVER** resets form data on errors
   - Only clears state when explicitly required (recovery success, payment success)

---

## Error Handling Flow

### Current Flow (Before)

```
User clicks purchase
  ↓
API call fails
  ↓
Generic error shown
  ↓
Form state lost
  ↓
User must close modal
  ↓
User reopens modal
  ↓
User re-enters all information
  ↓
User retries purchase
```

### Optimized Flow (After)

```
User clicks purchase
  ↓
API call fails with ANY error
  ↓
Error detected and categorized
  ↓
State preserved (SetupIntent, payment method, form data)
  ↓
Is error recoverable?
  ├─ YES → Automatic recovery
  │    ↓
  │  Create new SetupIntent/PaymentIntent
  │    ↓
  │  Toast: "Recovering payment..."
  │    ↓
  │  Retry API call automatically
  │    ↓
  │  Success → Continue purchase seamlessly
  │
  └─ NO → Show formatted error
       ↓
     Toast: Error message with "Try again"
       ↓
     State preserved
       ↓
     User can click purchase again immediately
       ↓
     No modal reset required
```

---

## State Preservation Strategy

### What is Preserved

On **ALL** errors, the following state is preserved:

1. **SetupIntent Client Secret**: Allows retry with same SetupIntent if valid
2. **PaymentIntent Client Secret**: Allows retry with same PaymentIntent if valid
3. **Payment Method ID**: User doesn't need to re-enter payment method
4. **Form Data**: First name, last name, email, etc. remain filled

### When State is Cleared

State is only cleared in these scenarios:

1. **Automatic Recovery Succeeds**: New SetupIntent/PaymentIntent created
2. **Payment Succeeds**: State cleared on successful payment
3. **User Explicitly Changes Payment Method**: User clicks "Add New Payment Method"

### Implementation

```typescript
// ✅ CORRECT: State preserved on error
catch (error) {
  await handlePaymentError(error, {
    preserveState: true, // State always preserved
    autoRetry: true,
  });
  // State remains intact - user can retry immediately
}

// ❌ WRONG: Clearing state on error
catch (error) {
  setSetupIntentClientSecret(null); // ❌ DON'T DO THIS
  setPaymentMethodId(null);         // ❌ DON'T DO THIS
  throw error;
}
```

---

## Recovery Mechanisms

### 1. SetupIntent Recovery

**Trigger**: `setup_intent_unexpected_state` with "already succeeded"

**Process**:
1. Detect error as recoverable
2. Show toast: "Detected a recoverable error. Setting up again. Please try again."
3. Create new SetupIntent via API
4. Update `setupIntentClientSecret` with new client secret
5. Wait for PaymentElement to remount (500ms)
6. Retry confirmation automatically
7. Show success toast: "Payment setup ready. Retrying automatically..."
8. Continue with purchase seamlessly

**Code Flow**:
```typescript
const recoveryResult = await handlePaymentRecovery("setup_intent_recovery", error);
if (recoveryResult.success) {
  setSetupIntentClientSecret(recoveryResult.clientSecret);
  // Wait for remount, then retry
}
```

### 2. PaymentIntent Recovery

**Trigger**: `payment_intent_unexpected_state` or canceled PaymentIntent

**Process**:
1. Detect error as recoverable
2. Show recovery toast
3. Create new PaymentIntent with same amount/currency
4. Update `paymentIntentClientSecret`
5. Retry confirmation automatically
6. Continue with purchase

**Code Flow**:
```typescript
const recoveryResult = await recoverPaymentIntent({
  amount: amountInCents,
  currency: "aud",
  paymentMethodId: existingPaymentMethodId,
});
```

### 3. API Retry

**Trigger**: Generic "payment processing error" (intermittent issues)

**Process**:
1. Detect error as recoverable
2. Wait briefly (300ms)
3. Retry API call automatically
4. If succeeds, continue; if fails, show error with "Try again"

---

## User Experience Improvements

### Loading States

- **During Automatic Recovery**: Shows loading state with "Recovering payment..."
- **During Retry**: Shows loading state with "Retrying automatically..."
- **On Error**: Loading state cleared, form remains accessible

### Toast Notifications

**Recovery Start Toast**:
```typescript
{
  type: "info",
  title: "Recovering payment",
  message: "Detected a recoverable error. Setting up again. Please try again.",
  duration: 3000
}
```

**Recovery Success Toast**:
```typescript
{
  type: "success",
  title: "Ready",
  message: "Payment setup ready. Retrying automatically...",
  duration: 2000
}
```

**Recovery Error Toast**:
```typescript
{
  type: "error",
  title: "Recovery Failed",
  message: "Formatted error message with 'Try again' text",
  duration: 5000
}
```

**API Error Toast (Non-Recoverable)**:
```typescript
{
  type: "error",
  title: "Payment Failed" | "Card Declined" | etc.,
  message: "Formatted error message with 'Try again' text",
  duration: 5000
}
```

### Error State Management

- ✅ Error shown in toast (non-intrusive)
- ✅ Form remains accessible (inputs not disabled)
- ✅ Purchase button remains enabled (unless loading)
- ✅ User can retry immediately without modal reset

---

## Best Practices Implemented

### Expert Frontend Error Handling Patterns

1. **State Preservation First**: ALWAYS preserve form state on errors unless recovery explicitly requires clearing
2. **Fail-Gracefully**: Never break user flow - always allow retry
3. **Error Categorization**: Categorize errors (recoverable, retryable, non-recoverable) for appropriate handling
4. **Automatic Recovery**: Detect and recover from recoverable errors automatically
5. **Graceful Degradation**: Fallback to manual retry if automatic recovery fails
6. **User Guidance**: Always include actionable "Try again" or specific instructions
7. **Error Logging**: Log all errors for debugging (client and server)
8. **Type Safety**: TypeScript types for all error scenarios
9. **Non-Intrusive Errors**: Use toast notifications, don't block UI
10. **Clear Feedback**: Loading states, error states, success states - user always knows what's happening
11. **Never Clear State Unnecessarily**: Only clear SetupIntent/PaymentIntent if explicitly needed
12. **Expert UX**: Smooth transitions, no jarring resets, seamless retry

### Separation of Concerns

- **Layer 1 (Utilities)**: Pure functions, no UI dependencies
- **Layer 2 (Components)**: UI logic and orchestration
- **Layer 3 (UI Feedback)**: Toast notifications, loading states

### Error Message Consistency

- All errors include "Try again" or actionable guidance
- User-friendly, non-technical language
- Contextual messages based on error type
- Consistent formatting across all endpoints

---

## API Reference

### Error Detection

```typescript
import { detectPaymentError, isRecoverableError, categorizeError } from "@/utils/payment/stripe/payment-error-detection";

// Comprehensive error detection
const detection = detectPaymentError(error);
// Returns: { isRecoverable, category, errorType, recoveryStrategy, shouldPreserveState }

// Quick check if recoverable
const isRecoverable = isRecoverableError(error);

// Categorize error
const categorization = categorizeError(error);
// Returns: { category, errorType, shouldPreserveState }
```

### Error Messages

```typescript
import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";

const formatted = formatPaymentError(error);
// Returns: { title, message, shouldIncludeTryAgain }
```

### Recovery

```typescript
import { recoverSetupIntent } from "@/utils/payment/stripe/setup-intent-recovery";
import { recoverPaymentIntent } from "@/utils/payment/stripe/payment-intent-recovery";

// SetupIntent recovery
const result = await recoverSetupIntent();

// PaymentIntent recovery
const result = await recoverPaymentIntent({
  amount: 5000, // cents
  currency: "aud",
  metadata: {},
});
```

### State Preservation

```typescript
import { getStatePreservationInstructions } from "@/utils/payment/stripe/payment-state-preservation";

const instructions = getStatePreservationInstructions(error);
// Returns: { shouldPreserveSetupIntent, shouldPreservePaymentIntent, shouldPreservePaymentMethod, shouldPreserveFormData }
```

---

## Testing Scenarios

### 1. SetupIntent Already Succeeded

**Scenario**: User tries to confirm SetupIntent that already succeeded externally

**Expected Behavior**:
- Error detected as recoverable
- New SetupIntent created automatically
- Toast: "Recovering payment..."
- API call retried automatically
- Purchase continues seamlessly

### 2. Payment Failed

**Scenario**: API returns "Payment Failed" error

**Expected Behavior**:
- Error categorized as retryable
- Formatted error shown: "Payment failed. Please check your card details and try again."
- State preserved (SetupIntent, payment method, form data)
- User can click purchase again immediately
- No modal reset required

### 3. Card Declined

**Scenario**: User's card is declined by bank

**Expected Behavior**:
- Error categorized as retryable
- Formatted error: "Your card was declined. Please check your card details or try a different payment method."
- State preserved
- User can retry with same or different payment method

### 4. Network Error

**Scenario**: API call fails due to network issue

**Expected Behavior**:
- Error categorized as retryable
- Formatted error: "Connection error. Please check your internet and try again."
- State preserved
- User can retry when connection restored

### 5. Multiple Retries

**Scenario**: User retries payment multiple times

**Expected Behavior**:
- Each retry preserves state
- No modal reset required
- Smooth user experience
- Clear feedback at each step

### 6. Recovery Failure

**Scenario**: Automatic recovery fails (e.g., API down)

**Expected Behavior**:
- Recovery attempted automatically
- Recovery failure detected
- Error shown with "Try again"
- User can retry manually
- State still preserved

---

## Troubleshooting

### Issue: Recovery doesn't trigger

**Possible Causes**:
- Error not detected as recoverable
- Recovery strategy not determined correctly
- API endpoint for recovery not available

**Solution**:
- Check error categorization in `payment-error-detection.ts`
- Verify `isRecoverableError()` logic
- Check network tab for recovery API calls

### Issue: State not preserved

**Possible Causes**:
- State cleared explicitly in error handler
- Recovery clears state unnecessarily
- Component unmounts on error

**Solution**:
- Verify `preserveState: true` in `handlePaymentError()` calls
- Check that state is only cleared on success
- Ensure modal stays mounted on errors

### Issue: Error messages don't show "Try again"

**Possible Causes**:
- Error not formatted using `formatPaymentError()`
- Custom error message doesn't include guidance

**Solution**:
- Always use `formatPaymentError()` for error messages
- Check `payment-error-messages.ts` for message format
- Verify error type is correctly detected

### Issue: Recovery creates duplicate SetupIntents

**Possible Causes**:
- Recovery called multiple times
- No guard against concurrent recovery

**Solution**:
- Add guard in `handlePaymentRecovery()` to prevent concurrent calls
- Use loading state to prevent multiple recovery attempts
- Clear old SetupIntent before creating new one

---

## Migration Notes

### For Developers

When adding new payment endpoints:

1. Import error handling utilities:
   ```typescript
   import { handlePaymentError } from "@/components/modals/MembershipModal";
   // Or use utilities directly
   ```

2. Wrap API calls in try-catch:
   ```typescript
   try {
     const result = await paymentAPI();
   } catch (error) {
     await handlePaymentError(error, {
       preserveState: true,
       autoRetry: true,
       packageId,
       packageName,
     });
   }
   ```

3. **NEVER** clear state on errors:
   ```typescript
   // ❌ DON'T
   catch (error) {
     setSetupIntentClientSecret(null);
     throw error;
   }
   
   // ✅ DO
   catch (error) {
     await handlePaymentError(error, { preserveState: true });
     // State preserved automatically
   }
   ```

4. Use formatted error messages:
   ```typescript
   import { formatPaymentError } from "@/utils/payment/stripe/payment-error-messages";
   
   const formatted = formatPaymentError(error);
   showToast({
     type: "error",
     title: formatted.title,
     message: formatted.message,
   });
   ```

---

## Summary

This comprehensive payment error handling and recovery system ensures:

- ✅ **Seamless UX**: Users can retry without modal reset
- ✅ **Automatic Recovery**: Recoverable errors handled automatically
- ✅ **State Preservation**: Form state never lost on errors
- ✅ **Clear Guidance**: All errors include actionable "Try again" text
- ✅ **Better UI/UX**: Loading states, toast notifications, clear feedback
- ✅ **Maintainable**: Centralized utilities, clear separation of concerns
- ✅ **Scalable**: Reusable utilities for future error scenarios
- ✅ **Type-Safe**: Full TypeScript support

The system follows expert frontend error handling patterns and provides a production-ready solution for handling all payment errors gracefully.

---

## Related Documentation

- [Failed Renewal Pay Now](./FAILED_RENEWAL_PAY_NOW.md) - Failed renewal payment handling
- [Error Reporting System](./ERROR_REPORTING_SYSTEM.md) - Error reporting infrastructure
- [Stripe Integration](./STRIPE_INTEGRATION.md) - General Stripe integration patterns (if exists)

---

**Last Updated**: Implementation Date
**Version**: 1.0.0
