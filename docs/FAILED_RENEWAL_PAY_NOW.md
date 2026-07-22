# Failed Renewal Pay Now Feature Documentation

## Overview

The "Pay Now" feature allows users with failed subscription renewals to immediately pay their existing Stripe invoice using the existing PaymentIntent. This flow follows Stripe best practices by reusing existing resources (invoice, PaymentIntent) and trusting webhooks as the source of truth for subscription state.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Stripe Best Practices](#stripe-best-practices)
4. [User Flow](#user-flow)
5. [API Reference](#api-reference)
6. [Component Usage](#component-usage)
7. [Integration Points](#integration-points)
8. [Payment Method Handling](#payment-method-handling)
9. [Error Handling](#error-handling)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)

---

## Features

### Core Features

- **Automatic Detection**: Failed renewals are automatically detected when subscription status is `past_due`
- **Modal Priority System**: Renewal failed modal integrates with existing modal priority system
- **Auto-Confirm Payment**: If user has default payment method, payment is processed immediately
- **Payment Element Integration**: If no default payment method, Payment Element is shown for manual entry
- **Automatic Payment Method Saving**: New payment methods entered via Payment Element are automatically saved and set as default
- **Multiple Access Points**: Modal can be accessed from:
  - Dashboard (auto-triggered on page load)
  - Settings modal subscription tab (with visual marker)
  - Subscription management modal (with alert banner)
- **Visual Indicators**: Exclamation icon on subscription tab when renewal issue is pending
- **Webhook-Driven**: Subscription reactivation is handled by Stripe webhooks (`invoice.payment_succeeded`)

---

## Architecture

### Components

```
src/
├── utils/payment/
│   └── failed-invoice-handler.ts      # Business logic for handling failed invoices
│
├── utils/subscription/
│   └── subscription-helpers.ts         # Utility functions for subscription status checks
│
├── app/api/stripe/
│   └── pay-failed-invoice/
│       └── route.ts                   # API endpoint for paying failed invoice
│
├── components/modals/
│   ├── RenewalFailedModal.tsx         # Main modal component for failed renewal payment
│   ├── SettingsModal.tsx               # Settings modal with subscription tab integration
│   └── SubscriptionManagementModal.tsx # Subscription management with failed renewal handling
│
├── hooks/queries/
│   └── useSubscriptionQueries.ts      # React Query hook for payFailedInvoice mutation
│
└── stores/
    └── useModalPriorityStore.ts       # Modal priority system (includes renewal-failed)
```

### Data Flow

```
User visits dashboard
  ↓
Check subscription status (past_due)
  ↓
Trigger RenewalFailedModal via modal priority system
  ↓
User clicks "Pay Now"
  ↓
API: /api/stripe/pay-failed-invoice
  ↓
Business Logic: failed-invoice-handler.ts
  ├─ Retrieve subscription from Stripe
  ├─ Get latest invoice (status: open)
  ├─ Extract PaymentIntent from invoice
  └─ Check for default payment method
  ↓
If default payment method exists:
  ├─ Pay invoice immediately (stripe.invoices.pay())
  └─ Return success response
  ↓
If no default payment method:
  ├─ Return PaymentIntent client_secret
  └─ Show Payment Element in modal
  ↓
User enters payment details
  ↓
Confirm PaymentIntent via Payment Element
  ↓
Extract payment method ID
  ↓
Save payment method (set as default)
  ↓
Stripe webhook: invoice.payment_succeeded
  ↓
Subscription reactivated
  ↓
Modal shows success, closes, refreshes user data
```

---

## Stripe Best Practices

### Core Principles

✅ **DO**:
- Reuse existing failed invoice (retrieve from subscription's latest invoice)
- Reuse existing PaymentIntent (extract from invoice)
- Trust Stripe webhooks as source of truth (`invoice.payment_succeeded` for reactivation)
- Allow Stripe's automatic retry system to remain enabled
- Use `stripe.invoices.pay()` to pay existing invoice

❌ **DO NOT**:
- Create new subscriptions
- Create new **manual** invoices (a Stripe-created held cycle draft may be finalized — see the stranded exception below — but never `stripe.invoices.create()`, which sets `billing_reason: "manual"` and skips the webhook renewal pipeline)
- Create new PaymentIntents
- Manually mark invoices as paid
- Disable Stripe's automatic retry system

### Exception: stranded (retry-exhausted) invoices are recovered

When Stripe's Smart Retries exhaust, the renewal invoice becomes **"stranded"** — status stays `open` but `attempt_count >= 1` and `next_payment_attempt == null` (Dashboard label: "Failed"). `stripe.invoices.pay()` **rejects** these ("This invoice can no longer be paid…"), which used to produce a terminal `invoice_not_payable` dead-end.

The member paths (`pay-failed-invoice`, `force-charge-overdue`, `renew-subscription`) now **recover** instead, via the shared [`prepareRecoveredCycleInvoice`](../src/services/subscription/prepareRecoveredCycleInvoice.ts) primitive (under a per-subscription `RecoveryClaim` lock):

1. **Void** the stranded original.
2. **Finalize** the pre-existing **held cycle draft** (`pause_collection: keep_as_draft` leaves one per missed cycle) — this is a Stripe-created `subscription_cycle` invoice, **not** a manually-created one, so `billing_reason` stays `subscription_cycle` and the webhook renewal pipeline + reanchor run normally.
3. Interactive paths return that finalized draft's PaymentIntent `client_secret` through the existing `requiresPaymentConfirmation` shape; off_session Force-Charge pays it directly.

If **no held draft exists** (`no_held_draft`), the behaviour now depends on the caller:

- **`pay-failed-invoice` (the member "Resolve payment" button) MINTS a fresh current cycle** on the member's default card via [`mintCurrentCycleInvoice`](..\src\services\subscription\mintCurrentCycleInvoice.ts) (`skipClaim: true` — the route already holds the `RecoveryClaim`), classified by [`classifyMemberResolveMintOutcome`](..\src\utils\payment\recovery\member-resolve-mint-policy.ts): the auto-charge succeeding (or a prior re-bill already having collected) reactivates the member (`success`); a **decline** returns `requiresNewCardPreflight` so the member adds a working card via the existing InlineCardSetup flow and their retry collects on the new default (the minted invoice is left `open`/`still_chargeable`, so the retry routes to the normal open-invoice pay path — it does **not** re-mint a second cycle, and the failed card is not re-charged); a scheduled-to-cancel / Stripe-error state returns a terminal member-safe error. A declined mint fires "Subscription Renewal Failed" (dunning) via the webhook `isRebill` path. Verified on a test clock: `npm run stripe:probe-member-resolve-mint`.
- The off_session `force-charge-overdue` + `renew-subscription` paths still return a terminal error for `no_held_draft` (a manual invoice is never created).

Expected cycle amount is single-sourced from the live subscription price (`deriveExpectedCycleAmountCents`), surviving a past-due tier switch.

### Stripe Retry Behavior

- Stripe's automatic retries remain enabled throughout the process
- Retries continue while invoice status = `open`
- When user pays via "Pay Now":
  - Invoice becomes `paid`
  - Subscription becomes `active`
  - All scheduled retries automatically stop

---

## User Flow

### Scenario 1: User with Default Payment Method

1. User visits dashboard with `past_due` subscription
2. `RenewalFailedModal` appears automatically (via modal priority system)
3. User clicks "Pay Now"
4. Payment is processed immediately using default payment method
5. Success message shown, modal closes
6. Webhook updates subscription status to `active`

### Scenario 2: User without Default Payment Method

1. User visits dashboard with `past_due` subscription
2. `RenewalFailedModal` appears automatically
3. User clicks "Pay Now"
4. Payment Element is displayed (matching MembershipModal styling)
5. User enters card details
6. Payment is confirmed via Payment Element
7. Payment method is automatically saved and set as default
8. Success message shown, modal closes
9. Webhook updates subscription status to `active`

### Scenario 3: User Closes Modal and Reopens Later

1. User closes modal (can be reopened)
2. User navigates to Settings → Subscription tab
3. Visual marker (exclamation icon) appears on subscription tab
4. Alert banner shows with "Resolve Payment Issue" button
5. User clicks button, modal reopens
6. Payment flow continues as above

---

## API Reference

### POST `/api/stripe/pay-failed-invoice`

Pays a failed subscription renewal invoice using the existing PaymentIntent.

#### Request

```typescript
// No request body required (user is authenticated via session)
```

#### Response (Success with Default Payment Method)

```json
{
  "success": true,
  "message": "Invoice paid successfully. Subscription will be reactivated shortly.",
  "data": {
    "invoiceId": "in_xxx",
    "status": "paid",
    "paymentIntentId": "pi_xxx"
  }
}
```

#### Response (Requires Payment Confirmation)

```json
{
  "success": false,
  "requiresPaymentConfirmation": true,
  "message": "Payment confirmation required",
  "data": {
    "paymentIntent": {
      "id": "pi_xxx",
      "clientSecret": "pi_xxx_secret_xxx",
      "amount": 2000,
      "currency": "aud",
      "status": "requires_payment_method"
    },
    "invoiceId": "in_xxx"
  }
}
```

#### Response (Invoice Already Paid)

```json
{
  "success": true,
  "message": "Invoice has already been paid",
  "data": {
    "invoiceId": "in_xxx",
    "status": "paid"
  }
}
```

#### Error Responses

```json
{
  "error": "Authentication required"
}
```

```json
{
  "error": "No subscription found"
}
```

```json
{
  "error": "Subscription is not in a failed renewal state"
}
```

```json
{
  "error": "Failed to retrieve invoice data"
}
```

---

## Component Usage

### RenewalFailedModal

Main modal component for handling failed renewal payments.

```tsx
import RenewalFailedModal from "@/components/modals/RenewalFailedModal";

<RenewalFailedModal
  isOpen={isOpen}
  onClose={() => {
    setIsOpen(false);
    // Refresh user data after payment
    queryClient.invalidateQueries({ queryKey: queryKeys.users.detail("current") });
  }}
/>
```

#### Props

- `isOpen: boolean` - Controls modal visibility
- `onClose: () => void` - Callback when modal closes (after successful payment or user cancellation)

#### Features

- Auto-triggers payment attempt when opened
- Shows Payment Element if no default payment method
- Automatically saves new payment methods and sets as default
- Handles success/error states
- Integrates with React Query for data refresh

---

## Integration Points

### 1. Dashboard Integration (`my-account/page.tsx`)

The modal is automatically triggered when:
- User has `past_due` subscription status
- User setup is completed
- Modal hasn't been shown this session (sessionStorage tracking)

```tsx
// Check for failed renewal and trigger modal
React.useEffect(() => {
  if (hasFailedRenewal(accountData.user)) {
    const renewalModalShown = sessionStorage.getItem("renewalFailedModalShown");
    if (!renewalModalShown) {
      requestModal("renewal-failed", false);
      setIsRenewalFailedModalOpen(true);
      sessionStorage.setItem("renewalFailedModalShown", "true");
    }
  }
}, [accountData, requestModal]);
```

### 2. Settings Modal Integration

The subscription tab in Settings modal shows:
- Visual marker (exclamation icon) on tab when renewal failed
- Alert banner with "Resolve Payment Issue" button
- RenewalFailedModal integration

### 3. Subscription Management Modal Integration

The subscription management modal shows:
- Prominent alert banner when renewal failed
- "Pay Now" button to open RenewalFailedModal
- Upgrade/downgrade options are hidden until payment is resolved

---

## Payment Method Handling

### Automatic Saving

When a user manually enters a card via Payment Element:

1. Payment is confirmed via `stripe.confirmPayment()`
2. Payment method ID is extracted from `paymentIntent.payment_method`
3. Payment method is automatically saved using `savePaymentMethod(paymentMethodId, true)`
4. Payment method is set as default automatically

This follows the same pattern as `MembershipModal` for consistency.

### Styling

The Payment Element matches `MembershipModal` styling:
- Same appearance configuration (colorPrimary: `#ee0000`, spacing, etc.)
- Same PaymentElement options (layout: `"tabs"`, wallets, fields, terms)
- Same wrapper styling (border, padding, etc.)

---

## Error Handling

### Common Errors

1. **Invoice Already Paid**
   - Check invoice status before processing
   - Show success message if already paid
   - Refresh user data

2. **No Invoice Found**
   - Log error with context (subscriptionId, userId)
   - Show user-friendly error message
   - Allow retry

3. **Payment Method Failure**
   - Handle Stripe payment errors (insufficient funds, card declined, etc.)
   - Show specific error messages based on error type
   - Allow retry with different payment method

4. **Network Errors**
   - Handle gracefully with retry option
   - Use React Query's retry mechanism
   - Show network error message to user

5. **Subscription Already Active**
   - Check subscription status before processing
   - Refresh user data, dismiss modal
   - Show success message if already resolved

### Error Messages

Error messages are user-friendly and actionable:
- "Payment failed. Please try again with a different payment method."
- "Your payment method was declined. Please check your card details or try a different card."
- "Network error. Please check your connection and try again."

---

## Testing

### Test Scenarios

1. **User with Default Payment Method**
   - Subscription status: `past_due`
   - Default payment method exists
   - Payment should process immediately
   - Subscription should reactivate via webhook

2. **User without Default Payment Method**
   - Subscription status: `past_due`
   - No default payment method
   - Payment Element should appear
   - Payment method should be saved after payment
   - Subscription should reactivate via webhook

3. **Payment Success Flow**
   - Payment completes successfully
   - Success message displayed
   - Modal closes automatically
   - User data refreshes

4. **Payment Failure Flow**
   - Payment fails (insufficient funds, card declined, etc.)
   - Error message displayed
   - User can retry with different payment method

5. **Invoice Already Paid**
   - Invoice status is `paid`
   - Success message shown
   - Modal closes

6. **Modal Reopening**
   - User closes modal
   - Navigates to Settings → Subscription tab
   - Can reopen modal via "Resolve Payment Issue" button

7. **Visual Indicators**
   - Exclamation icon appears on subscription tab when renewal failed
   - Alert banner shows in subscription management modal

### Integration Testing

- Modal appears on dashboard when status is `past_due`
- Modal can be reopened from settings
- Visual markers appear correctly
- Payment flow completes successfully
- Subscription status updates correctly after payment
- Webhook processing verification

---

## Troubleshooting

### Issue: Modal Not Appearing

**Possible Causes:**
- User subscription status is not `past_due`
- Modal was already shown this session (check sessionStorage)
- Modal priority system is blocking it (check activeModal state)

**Solutions:**
- Verify subscription status: `user.subscription.status === "past_due" && !user.subscription.isActive`
- Clear sessionStorage: `sessionStorage.removeItem("renewalFailedModalShown")`
- Check modal priority: renewal-failed has priority 3 (below upsell: 4, above user-setup: 2)

### Issue: Payment Not Processing

**Possible Causes:**
- Default payment method is invalid or expired
- PaymentIntent is in wrong state
- Network error

**Solutions:**
- Check Stripe dashboard for payment method status
- Verify PaymentIntent status in API response
- Check browser console for network errors
- Try with Payment Element (manual entry)

### Issue: Payment Method Not Saving

**Possible Causes:**
- User not authenticated
- Payment method ID extraction failed
- API error during save

**Solutions:**
- Verify user authentication
- Check paymentIntent.payment_method in Payment Element confirmation result
- Check browser console for save errors (saving failure doesn't block payment)

### Issue: Subscription Not Reactivating

**Possible Causes:**
- Webhook not received
- Webhook processing failed
- Subscription status not updated in database

**Solutions:**
- Check Stripe webhook logs for `invoice.payment_succeeded` event
- Verify webhook endpoint is processing correctly
- Check database for subscription status update
- Manually refresh user data (query invalidation should handle this)

---

## Additional Notes

### Modal Priority

The renewal-failed modal has priority 3 in the modal priority system:
- Priority 4: Upsell (highest)
- Priority 3: Renewal Failed
- Priority 2: User Setup
- Priority 1: Special Packages
- Priority 0: Pixel Consent (lowest)

This ensures payment issues are addressed promptly but don't interrupt critical onboarding flows.

### Session Tracking

The modal is shown once per session using sessionStorage:
- Key: `renewalFailedModalShown`
- Value: `"true"`
- Cleared: On page reload/new session

### Webhook Dependency

Subscription reactivation depends on Stripe webhooks. The modal shows a success message immediately after payment, but the actual subscription status update happens via webhook. This is by design and follows Stripe best practices.

### Post-Recovery Reanchor

A successful Pay-Now payment emits `invoice.payment_succeeded`, which also triggers the **past-due reanchor** flow: future renewals are moved to the recovery-payment date (AEST), clamping days 25/26/27 → 24. The user's `endDate` (shown in my-account and the SubscriptionManagementModal) updates automatically on the next fetch. See [PAST_DUE_REANCHOR.md](./PAST_DUE_REANCHOR.md).

---

## Version History

- **v1.0.0** (2025-01-XX): Initial implementation
  - Basic Pay Now flow
  - Auto-confirm with default payment method
  - Payment Element integration
  - Automatic payment method saving
  - Dashboard, Settings, and Subscription Management integrations


