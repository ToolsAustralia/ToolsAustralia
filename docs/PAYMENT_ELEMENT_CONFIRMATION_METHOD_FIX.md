# PaymentElement Confirmation Method Fix

## Issue Summary

**Date**: January 2026  
**Error**: `IntegrationError: The Payment Element does not support Intents created with confirmation_method=manual.`  
**Impact**: PaymentElement was stuck and unable to process payments when manually created PaymentIntents were used.

## Problem Description

When implementing the manual PaymentIntent fallback for edge cases where Stripe doesn't automatically create a PaymentIntent with the subscription invoice, we initially set `confirmation_method: "manual"`. However, Stripe's PaymentElement component does not support PaymentIntents created with `confirmation_method: "manual"`.

### Error Flow
1. User successfully registers
2. SetupIntent is created and confirmed
3. Payment method is attached to customer
4. User clicks "Purchase"
5. Subscription is created
6. Backend detects missing PaymentIntent in invoice
7. Backend manually creates PaymentIntent with `confirmation_method: "manual"`
8. Frontend receives `clientSecret` and attempts to use PaymentElement
9. **ERROR**: PaymentElement throws `IntegrationError` because it doesn't support manual confirmation

## Root Cause

According to Stripe's current documentation (2024-2026):
- **PaymentElement** only supports PaymentIntents with `confirmation_method: "automatic"` (or default, which is automatic)
- `confirmation_method: "manual"` is intended for server-side confirmation flows, not frontend PaymentElement flows
- PaymentElement requires the ability to handle 3D Secure challenges and wallet payments (Apple Pay/Google Pay) on the frontend, which requires automatic confirmation method

## Solution

Removed `confirmation_method: "manual"` from manual PaymentIntent creation. The PaymentIntent now uses the default `confirmation_method: "automatic"` while still maintaining `confirm: false` to prevent auto-confirmation.

### Files Modified

1. **`src/app/api/stripe/create-subscription/route.ts`** (Line ~699)
2. **`src/app/api/stripe/create-subscription-existing-user/route.ts`** (Line ~376)

### Code Changes

**Before:**
```typescript
const manualPaymentIntent = await stripe.paymentIntents.create(
  {
    amount: invoice.amount_due,
    currency: invoice.currency,
    customer: customer.id,
    payment_method: finalPaymentMethodId,
    confirmation_method: "manual", // ❌ PaymentElement doesn't support this
    confirm: false,
    // ... metadata
  }
);
```

**After:**
```typescript
const manualPaymentIntent = await stripe.paymentIntents.create(
  {
    amount: invoice.amount_due,
    currency: invoice.currency,
    customer: customer.id,
    payment_method: finalPaymentMethodId,
    // ✅ PaymentElement requires confirmation_method: "automatic" (default)
    // confirm: false ensures PaymentIntent is not auto-confirmed, frontend will confirm via PaymentElement
    confirm: false,
    // ... metadata
  }
);
```

## Why This Works

1. **PaymentElement Compatibility**: By using the default `confirmation_method: "automatic"`, PaymentElement can properly handle the PaymentIntent, including:
   - 3D Secure authentication flows
   - Wallet payments (Apple Pay/Google Pay)
   - Card validation and confirmation

2. **Frontend Control**: With `confirm: false`, the PaymentIntent is created but not automatically confirmed, giving the frontend full control over when to confirm the payment via `PaymentElement.confirmPayment()`.

3. **Stripe Best Practices**: This aligns with Stripe's recommended approach for frontend payment confirmation using PaymentElement.

## Updated Flow

### Complete Subscription Flow (After Fix)

1. **User Registration**
   - User fills registration form
   - Backend creates user account + Stripe customer
   - User moves to payment step

2. **SetupIntent Creation**
   - Frontend creates SetupIntent via `/api/stripe/create-setup-intent`
   - PaymentElement renders with SetupIntent `client_secret`

3. **Payment Method Confirmation**
   - User fills card details in PaymentElement
   - User clicks "Purchase" button
   - Frontend calls `cardFormRef.current.confirmSetup()`
   - SetupIntent confirmed → Payment method attached to customer
   - Payment method set as default

4. **Subscription Creation**
   - Frontend calls `/api/stripe/create-subscription` or `/api/stripe/create-subscription-existing-user`
   - Backend creates subscription with `payment_behavior: "default_incomplete"`
   - Backend checks `subscription.latest_invoice.payment_intent`:
     - **If exists**: Use existing PaymentIntent
     - **If null**: Manually create PaymentIntent (with `confirmation_method: "automatic"` default, `confirm: false`)

5. **Payment Confirmation (Frontend)**
   - Frontend receives `clientSecret` and `paymentIntentId` from backend
   - PaymentElement renders with PaymentIntent `client_secret`
   - User confirms payment → `PaymentElement.confirmPayment()` is called
   - Payment is processed (handles 3DS, wallet payments automatically)

6. **Webhook Processing (Backend - Async)**
   - Stripe sends `invoice.payment_succeeded` webhook
   - Webhook grants benefits (entries, points)
   - Activates subscription
   - Saves payment method

7. **Payment Verification (Frontend)**
   - Frontend calls `/api/stripe/verify-payment-complete`
   - Endpoint checks database (webhook-processed data)
   - If benefits processed → Success flow
   - If not → Optional polling for delayed webhooks

8. **Success Flow**
   - Auto-login (if new user)
   - Show success screen
   - Trigger upsell modal
   - Close modal

## Technical Details

### PaymentIntent Creation Parameters

When manually creating a PaymentIntent for the fallback scenario:

```typescript
{
  amount: invoice.amount_due,           // Amount from invoice
  currency: invoice.currency,            // Currency from invoice
  customer: customer.id,                 // Stripe customer ID
  payment_method: paymentMethodId,       // Attached payment method (optional)
  // confirmation_method: "automatic"   // Default - required for PaymentElement
  confirm: false,                       // Let frontend confirm via PaymentElement
  metadata: {
    invoice_id: invoice.id,
    subscription_id: subscription.id,
    is_manual_fallback: "true",         // Flag for webhook identification
    // ... other metadata
  }
}
```

### PaymentElement Usage

The frontend uses PaymentElement to confirm the PaymentIntent:

```typescript
// PaymentElement is initialized with PaymentIntent client_secret
const { error } = await stripe.confirmPayment({
  elements,
  clientSecret: paymentIntentClientSecret,
  confirmParams: {
    return_url: window.location.origin + '/success',
  },
});
```

PaymentElement automatically handles:
- 3D Secure authentication
- Wallet payments (Apple Pay/Google Pay)
- Card validation
- Payment confirmation

## Testing Checklist

- [x] User can register and create SetupIntent
- [x] User can confirm SetupIntent and attach payment method
- [x] User can create subscription with existing PaymentIntent
- [x] User can create subscription with manually created PaymentIntent (fallback)
- [x] PaymentElement works with manually created PaymentIntent
- [x] 3D Secure authentication works
- [x] Wallet payments (Apple Pay/Google Pay) work
- [x] Webhook processes payment correctly
- [x] Benefits are granted after payment

## Related Documentation

- [Stripe PaymentElement Documentation](https://stripe.com/docs/payments/payment-element)
- [Stripe PaymentIntent Lifecycle](https://stripe.com/docs/payments/paymentintents/lifecycle)
- [Stripe Subscription Lifecycle](https://stripe.com/docs/subscriptions/lifecycle)
- [SUBSCRIPTION_FLOW_ASSESSMENT.md](../SUBSCRIPTION_FLOW_ASSESSMENT.md) - Overall subscription flow documentation

## Notes

- This fix ensures compatibility with Stripe's PaymentElement component
- The manual PaymentIntent fallback is still necessary for edge cases where Stripe doesn't automatically create a PaymentIntent
- The fix maintains PCI compliance and wallet payment support
- All PaymentIntents (whether from invoice or manually created) now use the same confirmation method, ensuring consistent behavior
