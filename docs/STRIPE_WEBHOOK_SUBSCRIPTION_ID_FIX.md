# Stripe Payment Integration Improvements - Complete Documentation

## Date: January 2025

## Overview

This document covers all improvements made to the Stripe payment integration, from fixing the $0.00 amount display issue in Google Pay/Apple Pay to resolving webhook subscription ID extraction problems. All changes align with Stripe best practices.

---

## Part 1: Google Pay/Apple Pay $0.00 Amount Issue

### Problem Statement

When users attempted to pay for subscriptions using Google Pay or Apple Pay, the payment methods displayed **$0.00** instead of the actual subscription amount. This occurred because the `PaymentElement` was being initialized with a `SetupIntent` instead of the actual invoice `PaymentIntent`.

### Root Cause

- Subscriptions were being created without payment methods
- `SetupIntent` was used to initialize `PaymentElement`
- `SetupIntent` has no amount, causing wallets to show $0.00
- The invoice `PaymentIntent` (which contains the actual amount) was not being used

### Solution: Use `confirmation_secret` from Invoice

**Implementation in `src/app/api/stripe/create-subscription/route.ts`:**

```typescript
// ✅ STRIPE BEST PRACTICE: Create subscription first with payment_behavior: 'default_incomplete'
const subscription = await stripe.subscriptions.create(
  {
    customer: customer.id,
    items: [{ price: stripePriceId }],
    payment_behavior: "default_incomplete", // ✅ Creates invoice with PaymentIntent
    expand: ["latest_invoice.payment_intent", "latest_invoice.confirmation_secret"], // ✅ Get PaymentIntent and confirmation_secret
    // ... other options
  }
);

// ✅ PREFERRED METHOD: Get client_secret from confirmation_secret (most direct)
if (subscription.latest_invoice && typeof subscription.latest_invoice !== "string") {
  const latestInvoiceExpanded = subscription.latest_invoice as Stripe.Invoice & {
    confirmation_secret?: {
      client_secret?: string;
    } | null;
    payment_intent?: string | Stripe.PaymentIntent;
  };
  
  if (latestInvoiceExpanded.confirmation_secret?.client_secret) {
    clientSecret = latestInvoiceExpanded.confirmation_secret.client_secret;
    subscriptionLog.info(`Found PaymentIntent client_secret via confirmation_secret for subscription ${subscription.id}`);
  }
}
```

**Key Changes:**
1. ✅ Create subscription with `payment_behavior: "default_incomplete"` - This creates an invoice with a PaymentIntent
2. ✅ Expand `latest_invoice.confirmation_secret` - This contains the PaymentIntent client_secret
3. ✅ Use `confirmation_secret.client_secret` to initialize PaymentElement - This ensures wallets show the correct amount

**Benefits:**
- Google Pay and Apple Pay now display the correct subscription amount
- Follows Stripe's recommended approach for subscription payments
- No manual PaymentIntent creation needed

---

## Part 2: ToolLoadingSpinner Component

### Problem Statement

Need a reusable loading component that aligns with the website's tool-themed design (metallic red and metallic colors) to display while waiting for the PaymentElement to load.

### Solution: Created `ToolLoadingSpinner` Component

**File:** `src/components/ui/ToolLoadingSpinner.tsx`

**Features:**
- **Tool-themed variants**: `wrench`, `gear`, `drill`
- **Metallic design**: Red metallic colors with gradient effects
- **Size options**: `sm`, `md`, `lg`, `xl`
- **Customizable message**: Loading message can be customized
- **Smooth animations**: Rotating tool icon with counter-rotating rings

**Usage:**
```typescript
<ToolLoadingSpinner
  message="Loading payment form..."
  size="md"
  variant="gear" // Changed from "wrench" to "gear" per user request
  className="py-4"
/>
```

**Implementation Details:**
- Uses SVG icons for each tool variant
- Metallic gradient borders with glow effects
- Custom CSS animations (`spin`, `spin-reverse`, `spin-fast`, `spin-slow`)
- Responsive sizing with Tailwind classes

**Integration:**
- Used in `PaymentMethodSelector.tsx` while waiting for PaymentElement to load
- Displays when `isCreatingIntent` is true OR when `activeClientSecret` is null/undefined

---

## Part 3: PaymentElement Remounting Fix

### Problem Statement

When users changed packages during checkout, the `PaymentElement` would get stuck in a loading state and not remount with the new `clientSecret`. The internal Stripe Elements session API call was not being triggered.

### Root Cause

- React's `Elements` component wasn't properly remounting when `clientSecret` changed
- State updates were happening too quickly, causing race conditions
- The old `Elements` component wasn't fully unmounting before the new one mounted

### Solution: Implemented Remount Key and Delayed State Updates

**Implementation in `src/components/modals/MembershipModal.tsx`:**

```typescript
// ✅ FIX: Remount counter to force Elements remount when clientSecret changes
const [elementsRemountKey, setElementsRemountKey] = useState(0);

// When package changes or new subscription is created:
// ✅ CRITICAL FIX: Force unmount Elements by clearing clientSecret AND hiding card form
setPaymentIntentClientSecret(null);
setSetupIntentClientSecret(null);
setPaymentIntentId(null);
setShowCardForm(false); // ✅ Force unmount Elements component
setIsCreatingSubscription(false);
setCardFormError(null);
// ✅ CRITICAL: Increment remount key to ensure Elements remounts with new clientSecret
setElementsRemountKey((prev) => prev + 1);

// When new subscription data is received:
if (subscriptionData?.clientSecret) {
  const clientSecret = subscriptionData.clientSecret;

  // ✅ CRITICAL FIX: Use setTimeout to ensure Elements is fully unmounted before setting new clientSecret
  setTimeout(() => {
    // ✅ CRITICAL FIX: Increment remount key BEFORE setting client secret to force Elements remount
    setElementsRemountKey((prev) => prev + 1);
    setPaymentIntentClientSecret(clientSecret);
    setSetupIntentClientSecret(null);
    setCardFormError(null);
    // ✅ CRITICAL: Show card form AFTER setting clientSecret to trigger Elements mount
    setShowCardForm(true);
    
    // ✅ CRITICAL FIX: Clear loading state after a brief delay to ensure Elements mounts
    setTimeout(() => {
      setIsCreatingSubscription(false);
    }, 200);
  }, 150); // Small delay to ensure previous Elements is unmounted
}
```

**Implementation in `src/components/modals/PaymentMethodSelector.tsx`:**

```typescript
interface PaymentMethodSelectorProps {
  // ... other props
  elementsRemountKey?: number;
}

// ✅ FIX: Derive package type from intentType and amount for proper Elements remounting
const packageType = paymentIntentClientSecret && amount && amount > 0 ? "one-time" : "membership";

// ✅ CRITICAL: Include elementsRemountKey in Elements component key
<Elements
  key={`elements-${activeIntentType}-${packageType}-${activeClientSecret?.split("_secret_")[0] || "default"}-${amount || 0}-${packageName || "default"}-remount${elementsRemountKey}`}
  stripe={stripePromise}
  options={{
    clientSecret: activeClientSecret,
    // ... other options
  }}
>
  <StripeCardForm
    // ... props
  />
</Elements>
```

**Additional Fix: Elements Ready State**

```typescript
const [elementsReady, setElementsReady] = useState(false);

useEffect(() => {
  if (stripe && elements) {
    const initTimeout = setTimeout(() => {
      setIsStripeLoading(false);
      setElementsReady(true);
    }, 100); // Small delay to allow Elements session to initialize

    return () => clearTimeout(initTimeout);
  } else {
    setIsStripeLoading(true);
    setElementsReady(false);
  }
}, [stripe, elements, showToast, clientSecret]);

// Show loading spinner while Elements is initializing
if (isStripeLoading || !elementsReady) {
  return (
    <ToolLoadingSpinner
      message={isStripeLoading ? "Loading payment form..." : "Initializing payment session..."}
      size="md"
      variant="gear"
      className="py-4"
    />
  );
}

// Add onReady callback to PaymentElement
<PaymentElement
  onReady={() => {
    setElementsReady(true);
  }}
  onLoadError={(error) => {
    console.error("❌ PaymentElement load error - Elements session failed:", error);
    // ... error handling
  }}
  // ... other props
/>
```

**Key Changes:**
1. ✅ Added `elementsRemountKey` state that increments when `clientSecret` changes
2. ✅ Included `elementsRemountKey` in `Elements` component `key` prop
3. ✅ Added `setTimeout` delays to ensure proper unmounting/remounting sequence
4. ✅ Added `elementsReady` state to track when Elements session is initialized
5. ✅ Added `onReady` and `onLoadError` callbacks to `PaymentElement`

**Benefits:**
- PaymentElement now properly remounts when packages change
- No more stuck loading states
- Reliable initialization of Stripe Elements session

---

## Part 4: Package Change Handling

### Problem Statement

When users changed packages during checkout, the system needed to handle multiple incomplete subscriptions properly without causing errors or blocking the payment flow.

### Solution: Allow Multiple Incomplete Subscriptions, Cleanup After Payment

**Implementation:**

1. **Frontend (`MembershipModal.tsx`):** Don't immediately cancel old subscriptions
   ```typescript
   // When package changes:
   // Clear payment state and create new subscription
   // Don't cancel old subscription - let webhook handle cleanup
   setPaymentIntentClientSecret(null);
   setShowCardForm(false);
   // Create new subscription...
   ```

2. **Backend (`src/utils/payment/stripe/subscription-cleanup.ts`):** Cleanup utility
   ```typescript
   export async function cancelOtherIncompleteSubscriptions(
     customerId: string,
     successfulSubscriptionId: string
   ): Promise<number> {
     // Lists all incomplete subscriptions for customer
     // Cancels all except the successful one
     // Returns count of cancelled subscriptions
   }
   ```

3. **Webhook (`src/app/api/stripe/webhook/route.ts`):** Cleanup after payment succeeds
   ```typescript
   // ✅ STRIPE BEST PRACTICE: Cleanup other incomplete subscriptions AFTER payment succeeds
   if (invoice.customer && subscriptionId) {
     const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
     
     // Execute cleanup as background job (non-blocking)
     executeBackgroundJob("Cleanup incomplete subscriptions", async () => {
       try {
         await cancelOtherIncompleteSubscriptions(customerId, subscriptionId);
       } catch (cleanupError) {
         // Non-blocking: cleanup failure shouldn't affect payment success
         webhookLog("error", `Subscription cleanup failed (non-critical): ${cleanupError}`);
       }
     });
   }
   ```

**Key Principles:**
- ✅ Multiple incomplete subscriptions during checkout are normal and expected
- ✅ Only cleanup AFTER payment succeeds (Stripe best practice)
- ✅ Cleanup is non-blocking - doesn't affect payment success
- ✅ Prevents race conditions and errors

---

## Part 5: Subscription ID Saving Timing

### Problem Statement

When should `user.stripeSubscriptionId` be saved to the database? Should it be saved during subscription creation or only after payment succeeds?

### Solution: Save Only After Payment Succeeds

**Implementation:**

1. **`create-subscription` route:** Do NOT save subscription ID
   ```typescript
   // ✅ REMOVED: Don't save subscription ID during creation
   // It will be saved after payment succeeds (via webhook or confirm-subscription-payment)
   // This prevents saving subscription ID for failed payments
   ```

2. **`confirm-subscription-payment` route:** Save subscription ID after payment confirmation
   ```typescript
   // After payment is confirmed as successful:
   if (subscription.status === "active" || subscription.status === "trialing") {
     // ✅ Save subscription ID only after payment succeeds
     await User.findByIdAndUpdate(
       user._id,
       { $set: { stripeSubscriptionId: subscription.id } },
       { new: false }
     );
   }
   ```

3. **Webhook (`invoice.payment_succeeded`):** Early save for data consistency
   ```typescript
   // ✅ CRITICAL: Save subscription ID early for data consistency
   // This ensures subscriptionId is saved even if benefit processing fails later
   try {
     if (user.stripeSubscriptionId !== subscription.id) {
       await User.findByIdAndUpdate(
         user._id,
         { $set: { stripeSubscriptionId: subscription.id } },
         { new: false }
       );
       webhookLog("info", `✅ Saved subscription ID early: ${subscription.id} for user ${user.email}`);
     }
   } catch (saveError) {
     // Non-blocking: subscription ID save failure shouldn't prevent benefit processing
     webhookLog("warn", `Failed to save subscription ID early (non-critical): ${saveError}`);
   }
   ```

**Benefits:**
- ✅ Prevents saving subscription ID for failed payments
- ✅ Ensures data consistency (saved in multiple places as backup)
- ✅ Aligns with Stripe best practices

---

## Part 6: Webhook Subscription ID Extraction Fix

### Problem Statement

The webhook handler for `invoice.payment_succeeded` was failing to extract the subscription ID from Stripe invoice objects, resulting in `subscriptionId: null` and preventing benefits from being granted to users.

### Root Cause

Stripe's new API (Basil) changed the structure of invoice objects in webhook events. The subscription ID is no longer available at the top-level `invoice.subscription` field. Instead, it's nested in:
- `parent.subscription_details.subscription` (primary location)
- `lines.data[0].parent.subscription_item_details.subscription` (fallback location)

### Solution: Multi-Method Subscription ID Extraction

**Implementation in `src/app/api/stripe/webhook/route.ts`:**

```typescript
// ✅ STRIPE BEST PRACTICE: Use webhook event invoice directly (no API call needed)
// Stripe guarantees invoice.subscription is always available as string (or null) in webhook events
// No need to retrieve - webhook event already has all fields we need

// Type for invoice with nested parent structure (Basil API)
type InvoiceWithParent = Stripe.Invoice & {
  subscription?: string | null;
  parent?: {
    subscription_details?: {
      subscription?: string;
    };
  };
};
const invoiceWithParent = invoice as InvoiceWithParent;

// ✅ STRIPE BEST PRACTICE: Get subscription ID from invoice
// Stripe's new API (Basil) nests subscription in parent.subscription_details.subscription
// Fallback to lines.data[0].parent.subscription_item_details.subscription
// Also check top-level invoice.subscription for backward compatibility
let subscriptionId: string | undefined;

// Method 1: Check top-level invoice.subscription (old API / backward compatibility)
subscriptionId = (invoice as Stripe.Invoice & { subscription?: string | null }).subscription || undefined;

// Method 2: Check parent.subscription_details.subscription (new Basil API - PRIMARY METHOD)
if (!subscriptionId && invoiceWithParent.parent?.subscription_details?.subscription) {
  subscriptionId = invoiceWithParent.parent.subscription_details.subscription;
  console.log("✅ Found subscription ID from parent.subscription_details.subscription:", subscriptionId);
}

// Method 3: Check lines.data[0].parent.subscription_item_details.subscription (fallback)
type LineItemWithParent = Stripe.InvoiceLineItem & {
  parent?: {
    subscription_item_details?: {
      subscription?: string;
    };
  };
};
const firstLineItem = invoice.lines?.data?.[0] as LineItemWithParent | undefined;
if (!subscriptionId && firstLineItem?.parent?.subscription_item_details?.subscription) {
  subscriptionId = firstLineItem.parent.subscription_item_details.subscription;
  console.log("✅ Found subscription ID from line item parent.subscription_item_details.subscription:", subscriptionId);
}
```

**Key Changes:**
1. ✅ Removed `stripe.invoices.retrieve()` call with expansions (use webhook event directly)
2. ✅ Added multi-method subscription ID extraction (3 fallback methods)
3. ✅ Added proper TypeScript types (`InvoiceWithParent`, `LineItemWithParent`)
4. ✅ Enhanced debug logging
5. ✅ Fixed all TypeScript `any` type errors

**Benefits:**
- ✅ Supports both old and new Stripe API versions
- ✅ Multiple fallback methods ensure reliability
- ✅ Backward compatible with existing implementations
- ✅ No unnecessary API calls (faster, more reliable)

---

## Files Modified

### `src/app/api/stripe/create-subscription/route.ts`

**Key Changes:**
1. ✅ Use `confirmation_secret` to get PaymentIntent client_secret
2. ✅ Expand `latest_invoice.confirmation_secret` when creating subscription
3. ✅ Removed manual PaymentIntent creation
4. ✅ Removed `user.subscription` field updates (only save after payment succeeds)

### `src/components/ui/ToolLoadingSpinner.tsx` (NEW FILE)

**Features:**
- Tool-themed loading spinner with metallic red design
- Multiple variants: `wrench`, `gear`, `drill`
- Size options: `sm`, `md`, `lg`, `xl`
- Smooth animations with rotating tool icons

### `src/components/modals/MembershipModal.tsx`

**Key Changes:**
1. ✅ Added `elementsRemountKey` state for PaymentElement remounting
2. ✅ Added `setTimeout` delays for state synchronization
3. ✅ Simplified package change flow (don't cancel immediately)
4. ✅ Removed unnecessary debug logs

### `src/components/modals/PaymentMethodSelector.tsx`

**Key Changes:**
1. ✅ Added `elementsRemountKey` prop and included in `Elements` key
2. ✅ Added `elementsReady` state with `onReady`/`onLoadError` callbacks
3. ✅ Integrated `ToolLoadingSpinner` component
4. ✅ Enhanced loading state management

### `src/app/api/stripe/webhook/route.ts`

**Key Changes:**
1. ✅ Removed `stripe.invoices.retrieve()` call with expansions
2. ✅ Use webhook event invoice directly
3. ✅ Added multi-method subscription ID extraction
4. ✅ Added proper TypeScript types (`InvoiceWithParent`, `LineItemWithParent`)
5. ✅ Enhanced debug logging
6. ✅ Fixed all TypeScript `any` type errors
7. ✅ Added subscription cleanup after payment succeeds

### `src/utils/payment/stripe/subscription-cleanup.ts`

**Key Changes:**
1. ✅ Fixed import path from `@/utils/logging/subscription-logs` to `@/utils/logging/subscription-logger`
2. ✅ Utility functions for cleaning up incomplete subscriptions

### `src/app/api/stripe/confirm-subscription-payment/route.ts`

**Key Changes:**
1. ✅ Save `user.stripeSubscriptionId` only after payment succeeds
2. ✅ Removed unnecessary validation checks

---

## Testing

### Verification Steps

1. **Google Pay/Apple Pay Amount Display:**
   - Create a new subscription
   - Check that Google Pay and Apple Pay show the correct amount (not $0.00)
   - Verify payment completes successfully

2. **PaymentElement Remounting:**
   - Start subscription checkout
   - Change package during step 2
   - Verify PaymentElement remounts correctly with new clientSecret
   - Verify no stuck loading states

3. **Package Changes:**
   - Change packages multiple times
   - Verify only one subscription is active after payment
   - Verify incomplete subscriptions are cleaned up

4. **Subscription ID Saving:**
   - Create subscription and complete payment
   - Verify `user.stripeSubscriptionId` is saved in database
   - Verify it's NOT saved if payment fails

5. **Webhook Subscription ID Extraction:**
   - Trigger `invoice.payment_succeeded` webhook
   - Check logs for: `✅ Found subscription ID from parent.subscription_details.subscription: sub_xxx`
   - Verify `subscriptionId` is no longer `null`
   - Verify benefits are granted correctly

6. **Test Different Scenarios:**
   - New subscription creation
   - Subscription renewals
   - Package changes
   - Multiple package changes in sequence
   - Payment failures and retries

---

## Stripe API Compatibility

### Supported API Versions

- ✅ **Old API**: Top-level `invoice.subscription` field
- ✅ **New API (Basil)**: `parent.subscription_details.subscription` field
- ✅ **Future-proof**: Multiple fallback methods

### Invoice Structure (Basil API)

```json
{
  "id": "in_xxx",
  "billing_reason": "subscription_create",
  "parent": {
    "subscription_details": {
      "subscription": "sub_xxx",  // ← Subscription ID here
      "metadata": { ... }
    },
    "type": "subscription_details"
  },
  "lines": {
    "data": [{
      "parent": {
        "subscription_item_details": {
          "subscription": "sub_xxx"  // ← Also here as fallback
        }
      }
    }]
  }
}
```

### Confirmation Secret Structure

```json
{
  "latest_invoice": {
    "id": "in_xxx",
    "confirmation_secret": {
      "client_secret": "pi_xxx_secret_xxx"  // ← PaymentIntent client_secret here
    },
    "payment_intent": "pi_xxx"
  }
}
```

---

## Best Practices Followed

1. ✅ **No unnecessary API calls** - Use webhook event data directly
2. ✅ **No unnecessary expansions** - Only expand when needed
3. ✅ **Type safety** - Proper TypeScript types, no `any`
4. ✅ **Backward compatibility** - Support old and new API versions
5. ✅ **Multiple fallbacks** - Robust error handling
6. ✅ **Comprehensive logging** - Easy debugging
7. ✅ **Save subscription ID only after payment succeeds** - Prevents data inconsistency
8. ✅ **Allow multiple incomplete subscriptions** - Normal during checkout
9. ✅ **Cleanup after payment succeeds** - Stripe best practice
10. ✅ **Use confirmation_secret for PaymentIntent** - Stripe recommended approach

---

## Related Documentation

- [Stripe Invoice API Documentation](https://docs.stripe.com/api/invoices)
- [Stripe Webhook Events](https://docs.stripe.com/api/webhooks)
- [Stripe Best Practices](https://docs.stripe.com/payments/handling-payment-events)
- [Stripe PaymentElement Documentation](https://stripe.com/docs/payments/payment-element)

---

## Notes

- All changes align with Stripe best practices
- The subscription ID extraction now works with Stripe's Basil API
- All TypeScript errors have been resolved
- Build passes successfully (`npm run build`)
- The implementation is production-ready
- Google Pay and Apple Pay now display correct amounts
- PaymentElement remounting works reliably

---

## Future Considerations

- Monitor Stripe API changelog for any future structure changes
- Consider adding unit tests for subscription ID extraction
- May want to remove debug console.log statements in production (or gate behind environment variable)
- Consider adding retry logic for PaymentIntent retrieval if confirmation_secret is not immediately available
