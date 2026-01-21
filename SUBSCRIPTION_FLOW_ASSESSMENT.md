# Subscription Flow Assessment

## Current Flow (Step-by-Step)

### Step 1: User Registration (New Users Only)
- User fills registration form
- Backend creates user account + Stripe customer
- **No subscription created yet** ✅
- User moves to payment step

### Step 2: SetupIntent Creation (When User Reaches Payment Step)
- Frontend creates SetupIntent via `/api/stripe/create-setup-intent`
- SetupIntent `client_secret` is returned
- PaymentElement renders with SetupIntent
- **Payment method NOT attached yet** ⚠️

### Step 3: User Confirms Payment Method (Before Purchase)
- User fills card details in PaymentElement
- User clicks "Purchase" button
- Frontend calls `cardFormRef.current.confirmSetup()` 
- Stripe confirms SetupIntent → **Payment method attached to customer** ✅
- `paymentMethodId` is stored in state
- **Payment method is NOT set as default yet** ⚠️

### Step 4: User Clicks Purchase → Subscription Creation
- Frontend calls `/api/stripe/create-subscription` (new user) or `/api/stripe/create-subscription-existing-user` (existing user)
- Backend receives `paymentMethodId` from SetupIntent
- Backend attaches payment method to customer (if not already attached)
- **Backend sets payment method as default AFTER subscription creation** ✅
- Backend creates subscription with:
  ```typescript
  payment_behavior: "default_incomplete"
  expand: ["latest_invoice.payment_intent"]
  ```
- Stripe creates invoice + PaymentIntent (if needed)
- Backend returns:
  - `subscriptionId`
  - `clientSecret` (if PaymentIntent exists)
  - `paymentIntentId` (if PaymentIntent exists)

### Step 5: Payment Confirmation (Frontend)
- If `clientSecret` exists:
  - Frontend uses PaymentElement to confirm invoice PaymentIntent
  - Calls `cardFormRef.current.confirmSetup()` (which internally calls `stripe.confirmPayment()`)
  - Payment is charged immediately
- If `clientSecret` is missing:
  - Stripe charges automatically via `default_payment_method`
  - Frontend calls `verify-payment-complete` to check status

### Step 6: Webhook Processing (Backend - Async)
- Stripe sends `invoice.payment_succeeded` webhook
- Webhook:
  - Verifies payment succeeded
  - Grants benefits (entries, points)
  - Activates subscription (`subscription.isActive = true`)
  - Saves payment method to user
  - Triggers Klaviyo events
  - Processes referrals

### Step 7: Payment Verification (Frontend)
- Frontend calls `/api/stripe/verify-payment-complete`
- Endpoint checks **database** (webhook-processed data):
  - `user.subscription.isActive === true` → Payment succeeded ✅
  - `user.accumulatedEntries > 0` → Benefits granted ✅
- If benefits processed → Proceed to success
- If benefits NOT processed → Wait for webhook

### Step 8: Success Flow
- `handlePaymentSuccess()` is called
- Auto-login (if new user)
- Show success screen
- Trigger upsell modal
- Close modal

---

## Issues & Recommendations

### ✅ What's Working Well
1. **Webhook is source of truth** - Benefits are granted by webhook, not frontend
2. **Payment method attachment** - SetupIntent correctly attaches payment method
3. **Frontend confirmation** - PaymentIntent confirmed on frontend (PCI compliant, wallet support)

### ⚠️ Potential Issues

#### Issue 1: Payment Method Default Setting Timing ✅ FIXED
**Previous**: Payment method was set as default **AFTER** subscription creation
**Problem**: If Stripe needs to charge immediately, it might not know which payment method to use
**Solution**: ✅ **FIXED** - Payment method is now set as default **BEFORE** subscription creation

**Current Implementation**:
```typescript
// In create-subscription/route.ts
// Payment method set as default BEFORE subscription creation
if (finalPaymentMethodId && canUsePaymentMethod) {
  await stripe.customers.update(customer.id, {
    invoice_settings: {
      default_payment_method: finalPaymentMethodId,
    },
  });
}
// Then create subscription with payment_behavior: "default_incomplete"
```

**Result**: 
- Payment method is set as default before subscription creation
- `payment_behavior: "default_incomplete"` forces PaymentIntent creation even with default payment method
- This ensures PaymentIntent is always available for frontend confirmation

#### Issue 2: Complex Verification Flow
**Current**: Multiple verification steps (Stripe status, database status, webhook status)
**Problem**: Confusing, multiple sources of truth
**Recommendation**: ✅ **Already fixed** - `verify-payment-complete` now only checks database (webhook-processed data)

#### Issue 3: Missing clientSecret Handling
**Current**: If `clientSecret` is missing, frontend calls `verify-payment-complete`
**Problem**: If Stripe charges automatically, frontend doesn't know immediately
**Recommendation**: ✅ **Already handled** - Frontend checks `verify-payment-complete` if `clientSecret` is missing

---

## Recommended Flow (Simplified)

### Step 1: SetupIntent Creation
- User reaches payment step
- Frontend creates SetupIntent
- PaymentElement renders with SetupIntent

### Step 2: Payment Method Confirmation
- User fills card details
- User clicks "Purchase"
- Frontend confirms SetupIntent → Payment method attached ✅

### Step 3: Subscription Creation
- Backend receives `paymentMethodId`
- **Set payment method as default BEFORE subscription creation** ✅
- Create subscription with `payment_behavior: "default_incomplete"`
- Stripe creates invoice + PaymentIntent
- Return `subscriptionId`, `clientSecret`, `paymentIntentId`

### Step 4: Payment Confirmation
- Frontend confirms invoice PaymentIntent via PaymentElement
- Payment charged immediately ✅

### Step 5: Webhook Processing
- Webhook receives `invoice.payment_succeeded`
- Grants benefits (entries, points)
- Activates subscription
- Saves payment method

### Step 6: Verification & Success
- Frontend calls `verify-payment-complete`
- Checks database (webhook-processed data)
- If benefits processed → Success flow
- If not → Wait for webhook (poll or show "processing" screen)

---

## Key Questions Answered

### Q: When is payment method attached?
**A**: When SetupIntent is confirmed (Step 2), **before** subscription creation

### Q: When is payment method set as default?
**A**: Currently **AFTER** subscription creation. Should be **BEFORE** to ensure PaymentIntent creation.

### Q: When is subscription created?
**A**: When user clicks "Purchase" button (Step 3)

### Q: When is payment processed?
**A**: When frontend confirms invoice PaymentIntent (Step 4), or automatically if `default_payment_method` is set

### Q: When are benefits granted?
**A**: When webhook processes `invoice.payment_succeeded` (Step 5) - **Webhook is source of truth** ✅

### Q: When does auto-login happen?
**A**: After `verify-payment-complete` confirms benefits are processed (Step 6)

---

## Action Items

1. ✅ **DONE**: `verify-payment-complete` now uses webhook-processed data as source of truth
2. ✅ **DONE**: Payment method set as default BEFORE subscription creation
3. ✅ **DONE**: Frontend confirms PaymentIntent (PCI compliant, wallet support)
4. ✅ **DONE**: Webhook grants benefits (single source of truth)
5. ✅ **DONE**: Fixed PaymentElement compatibility - removed `confirmation_method: "manual"` from manual PaymentIntent creation (see [PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md](./docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md))

---

## Recent Changes

### PaymentElement Confirmation Method Fix (January 2026)
- **Issue**: PaymentElement was throwing `IntegrationError` when trying to use manually created PaymentIntents with `confirmation_method: "manual"`
- **Fix**: Removed `confirmation_method: "manual"` from manual PaymentIntent creation. PaymentElement requires `confirmation_method: "automatic"` (default).
- **Impact**: PaymentElement now works correctly with both invoice PaymentIntents and manually created PaymentIntents.
- **Documentation**: See [PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md](./docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md) for detailed explanation.
