# Facebook Conversions API Tracking Implementation

## Overview

This document describes the Facebook Conversions API (CAPI) implementation for tracking purchase events. The implementation follows Meta's best practices to ensure accurate revenue tracking and prevent duplicate conversions.

## Architecture

### Single Source of Truth: Server-Side Tracking

All Facebook Purchase events are tracked **server-side only** via the Conversions API. This ensures:

- **Reliability**: Not blocked by ad blockers (~30% of users have ad blockers)
- **Better Match Quality**: Includes hashed user data (email, phone, name), IP address, and user agent
- **Consistent Timing**: Fires at payment completion (webhook-based)
- **No Duplicates**: Single tracking point prevents duplicate events

### Tracking Flow

```
Payment Success (Stripe Webhook)
    ↓
processPaymentBenefits()
    ↓
grantBenefits()
    ↓
trackPixelPurchase() [Server-Side Only]
    ↓
Facebook Conversions API
```

## Implementation Details

### 1. Server-Side Tracking

**File**: `src/utils/payment/payment-processing.ts`

The `grantBenefits()` function calls `trackPixelPurchase()` for all purchase types **except renewals**:

```typescript
// ✅ CRITICAL: Skip Facebook tracking for subscription renewals
const isRenewal = billingReason === "subscription_cycle";

if (!isRenewal) {
  await trackPixelPurchase({
    value: packageData.price,
    currency: "AUD",
    orderId: paymentIntentId,
    packageType: packageData.packageType,
    // ... other params
  });
}
```

**Key Points**:
- Only tracks new purchases (not renewals)
- Uses PaymentIntentId/InvoiceId as orderId for deduplication
- Includes request context (IP, user agent, fbc, fbp) for better match quality
- Non-blocking: Errors don't break purchase flow

### 2. EventID Deduplication

**File**: `src/utils/tracking/facebook-helpers.ts`

EventIDs are generated using a consistent format:

```typescript
export function generateEventID(eventType: string, identifier: string, timestamp?: number): string {
  const ts = timestamp || Date.now();
  return `${eventType}_${identifier}_${ts}`;
}
```

**Format**: `{eventType}_{identifier}_{timestamp}`

**Example**: `purchase_pi_1234567890_1704067200000`

**Note**: Since we use CAPI-only (no browser pixel), EventIDs are primarily for internal tracking and future-proofing. Facebook's deduplication will handle any edge cases.

### 3. Renewal Exclusion

**File**: `src/utils/payment/payment-processing.ts`

Subscription renewals are **explicitly excluded** from Facebook tracking:

```typescript
if (packageData.packageType === "membership" && billingReason === "subscription_cycle") {
  // Skip Facebook tracking - renewals should not be counted as conversions
  return;
}
```

**Rationale**: 
- Renewals are not new conversions
- Only new subscriptions should be tracked as Purchase events
- This aligns with Meta's best practices

### 4. Webhook as Single Source of Truth

**File**: `src/app/api/stripe/webhook/route.ts`

All payment processing happens via Stripe webhooks:

- `payment_intent.succeeded` → One-time purchases, upsells, mini-draws
- `invoice.payment_succeeded` → Membership subscriptions

**Benefits**:
- Reliable: Stripe guarantees webhook delivery
- Atomic: PaymentEvent creation prevents duplicates
- Consistent: Single processing path for all payments

### 5. Defensive Logging

**File**: `src/utils/payment/payment-processing.ts`

Comprehensive logging helps debug tracking issues:

```typescript
console.log(`📊 [Facebook Tracking] Calling trackPixelPurchase:`, {
  paymentIntentId: trackingId,
  packageType: packageData.packageType,
  packageName: packageData.packageName,
  price: packageData.price,
  isRenewal: isRenewal,
  billingReason: billingReason || "N/A",
});
```

Logs include:
- When tracking is called
- Payment details (ID, type, price)
- Whether it's a renewal (should be skipped)
- Success/failure status

## Payment Types

### One-Time Purchases

- **Tracking**: ✅ Yes (via webhook)
- **Event Type**: `Purchase`
- **Content Type**: `membership_package`
- **Package Type**: `one-time`

### Membership Subscriptions (New)

- **Tracking**: ✅ Yes (via webhook)
- **Event Type**: `Purchase`
- **Content Type**: `subscription`
- **Package Type**: `membership`
- **Billing Reason**: `subscription_create`

### Membership Subscriptions (Renewal)

- **Tracking**: ❌ No (correctly excluded)
- **Billing Reason**: `subscription_cycle`
- **Rationale**: Renewals are not new conversions

### Upsells

- **Tracking**: ✅ Yes (via webhook)
- **Event Type**: `Purchase`
- **Content Type**: `upsell_package`
- **Package Type**: `upsell`

### Mini-Draws

- **Tracking**: ✅ Yes (via webhook)
- **Event Type**: `Purchase`
- **Content Type**: `mini_draw_package`
- **Package Type**: `mini-draw`

## Removed: Client-Side Tracking

**Previously**: Client-side browser pixel tracking was used in addition to server-side tracking, causing duplicate events.

**Now**: Client-side tracking has been **completely removed** from:

- `src/utils/tracking/pixel-purchase-tracking.ts` - Removed browser pixel call from `trackPixelPurchase()` (CAPI-only)
- `src/components/modals/SpecialPackagesModal.tsx`
- `src/components/modals/MembershipModal.tsx`
- `src/components/modals/UpsellModal.tsx`
- `src/components/features/MiniDrawPackages.tsx`

**Rationale**:
- Server-side tracking is more reliable
- Prevents duplicate events
- Better match quality
- Aligns with Meta's best practices
- Single source of truth (Conversions API only)

## Removed: API Fallback Processing

**Previously**: API routes had fallback processing that could duplicate webhook processing.

**Now**: Fallback processing has been **removed** from:

- `src/app/api/stripe/create-one-time-purchase-existing-user/route.ts`
- `src/app/api/stripe/create-one-time-purchase/route.ts`

**Rationale**:
- Webhook is more reliable
- Prevents duplicate tracking
- Single source of truth for payment processing

## Best Practices Followed

### 1. Single Source of Truth ✅
- Server-side Conversions API only
- Webhook-based processing
- No client-side tracking

### 2. EventID Deduplication ✅
- Consistent format: `{eventType}_{identifier}_{timestamp}`
- Same eventID used for all tracking (if browser pixel was used)
- Timestamp consistency

### 3. Renewal Exclusion ✅
- Renewals explicitly excluded from Purchase events
- Only new subscriptions tracked as conversions
- Aligns with Meta's recommendations

### 4. Match Quality Optimization ✅
- Hashed user data (email, phone, name)
- IP address and user agent included
- fbc and fbp cookies when available
- Request context passed from client to server

### 5. Error Handling ✅
- Non-blocking: Tracking errors don't break purchase flow
- Comprehensive logging for debugging
- Graceful degradation

## Testing

After implementation, verify:

1. **One-Time Purchases**: 1 Facebook event per payment
2. **New Memberships**: 1 Facebook event per subscription
3. **Renewals**: 0 Facebook events (correctly excluded)
4. **Upsells**: 1 Facebook event per purchase
5. **Mini-Draws**: 1 Facebook event per purchase

### Verification Steps

1. Make a test purchase
2. Check Facebook Events Manager
3. Verify conversion count matches actual purchases
4. Verify revenue matches internal revenue (not doubled)
5. Check logs for tracking calls

## Troubleshooting

### Issue: Duplicate Events

**Symptoms**: Facebook shows more conversions than actual purchases

**Causes**:
- Client-side tracking still active (should be removed)
- API fallback processing still active (should be removed)
- Multiple webhook handlers processing same payment

**Solution**: Verify all client-side tracking and API fallback processing has been removed

### Issue: Missing Events

**Symptoms**: Facebook shows fewer conversions than actual purchases

**Causes**:
- Webhook not firing
- PaymentEvent creation failing
- Facebook API errors

**Solution**: Check webhook logs and Facebook API responses

### Issue: Renewals Being Tracked

**Symptoms**: Renewals appear as conversions in Facebook

**Causes**:
- `billingReason` not being passed correctly
- Renewal check logic incorrect

**Solution**: Verify `billingReason === "subscription_cycle"` check is working

## Monitoring

### Logs to Monitor

1. **Facebook Tracking Calls**:
   ```
   📊 [Facebook Tracking] Calling trackPixelPurchase
   ✅ [Facebook Tracking] Successfully tracked purchase
   ⏭️ [Facebook Tracking] Skipping Purchase event for renewal
   ```

2. **Webhook Processing**:
   ```
   🎯 handleOneTimeWebhook called for PaymentIntent
   ✅ Successfully processed one-time package
   ```

3. **Payment Processing**:
   ```
   🔄 Processing payment with atomic PaymentEvent check
   ✅ Benefits granted and recorded
   ```

### Metrics to Track

- Facebook conversion count vs. actual purchases
- Facebook revenue vs. internal revenue
- Event match quality (in Facebook Events Manager)
- Webhook processing success rate

### Revenue Filtering by Attribution

PaymentEvent revenue is stored with UTM attribution (`data.utmSource`, `data.utmMedium`, etc.). The hourly insights API supports an optional `utmSource` query param (e.g. `utmSource=facebook`) to filter revenue by platform—enabling Facebook-only ROAS in the hourly breakdown. See [PAYMENT_ATTRIBUTION.md](./PAYMENT_ATTRIBUTION.md) for attribution capture, storage, and filtering.

## References

- [Meta Conversions API Documentation](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Meta Best Practices](https://www.facebook.com/business/help/2041148702652965)
- [Event Deduplication Guide](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)

## Changelog

### 2024-01-XX: CAPI-Only Implementation

**Changes**:
- Removed browser pixel tracking from `trackPixelPurchase()` function
- Removed all client-side Facebook Pixel tracking from purchase flows
- Removed API fallback processing
- Added defensive logging
- Ensured webhook is single source of truth
- Updated to use Conversions API (CAPI) exclusively

**Impact**:
- Eliminated duplicate events
- Improved revenue accuracy
- Better match quality
- Aligned with Meta best practices
- Single source of truth (server-side only)

### 2024-01-XX: Duplicate Tracking Fix

**Changes**:
- Removed all client-side Facebook Pixel tracking
- Removed API fallback processing
- Added defensive logging
- Ensured webhook is single source of truth

**Impact**:
- Eliminated duplicate events
- Improved revenue accuracy
- Better match quality
- Aligned with Meta best practices

