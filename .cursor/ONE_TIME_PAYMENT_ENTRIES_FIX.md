# One-Time Payment Entries Not Granted - Critical Fix

## Issue Summary

**Problem**: Users making one-time purchases are not receiving entries, making the website appear like a scam.

**Root Cause**: 
1. PaymentIntent update fails silently when PaymentIntent is already "succeeded" (wallet payments confirm immediately)
2. Webhook can't find user because:
   - `customerId: null` (PaymentIntent has no customer)
   - `userEmail: 'guest'` (metadata still has "guest" email)
   - Charge and payment method also have no customer
   - No fallback to check charge `billing_details.email`

**Error Pattern**:
```
❌ User not found for payment intent: pi_xxx
{
  customerId: null,
  userEmail: 'guest',
  metadata: { userId: 'guest', userEmail: 'guest', ... }
}
```

## Fixes Applied

### Fix 1: PaymentIntent Update Error Handling ✅

**File**: `src/app/api/stripe/create-one-time-purchase/route.ts` (lines 421-456)

**Problem**: PaymentIntent update fails when already "succeeded" (wallet payments), leaving metadata as "guest".

**Solution**: 
- Wrapped PaymentIntent update in try-catch
- If customer update fails (PaymentIntent already succeeded), update metadata only
- Metadata can be updated even on succeeded PaymentIntents
- Logs warning and continues - webhook will use charge billing_details fallback

**Code**:
```typescript
try {
  await stripe.paymentIntents.update(existingPaymentIntent.id, {
    customer: customer.id,
    description: membershipPackage.name,
    metadata: updatedMetadata,
  });
} catch (updateError: any) {
  // If customer update fails, at least update metadata
  if (errorCode.includes("succeeded") || errorMessage.includes("cannot be modified")) {
    await stripe.paymentIntents.update(existingPaymentIntent.id, {
      metadata: updatedMetadata,
    });
  }
}
```

### Fix 2: Webhook Charge Billing Details Fallback ✅

**File**: `src/app/api/stripe/webhook/route.ts` (lines 303-341)

**Problem**: When PaymentIntent has no customer and metadata has "guest", webhook can't find or create user.

**Solution**:
- Added fallback to check charge `billing_details.email`
- Charge always has user's email even if customer is null
- Use charge email to find existing user OR create new account
- Create account using charge email instead of "guest" when `isNewUser: "true"` flag exists

**Flow**:
1. Check if charge has `billing_details.email`
2. Try to find user by email
3. If not found AND metadata has `isNewUser: "true"`, create account using charge email
4. Update PaymentIntent metadata with correct user info

### Fix 3: Recovery Flow Null Check ✅

**File**: `src/components/modals/MembershipModal.tsx` (lines 2280-2284, 2387-2391)

**Problem**: If user closes modal during recovery, `cardFormRef.current` could be null, causing error.

**Solution**: Added null check before retrying `confirmSetup()` in both recovery locations.

**Code**:
```typescript
if (!cardFormRef.current) {
  throw new Error("Payment form was closed. Please try again.");
}
const retryResult = await cardFormRef.current.confirmSetup();
```

## How It Works Now

### Scenario 1: PaymentIntent Update Succeeds (Normal Flow)
1. User completes payment → PaymentIntent becomes "succeeded"
2. `create-one-time-purchase` updates PaymentIntent with customer and metadata ✅
3. Webhook finds user by customer ID ✅
4. Entries granted ✅

### Scenario 2: PaymentIntent Update Fails (Wallet Payments)
1. User completes payment → PaymentIntent becomes "succeeded" immediately
2. `create-one-time-purchase` tries to update → fails (already succeeded)
3. Falls back to updating metadata only ✅
4. Webhook can't find user by customer (null) → checks charge billing_details.email ✅
5. Finds or creates user using charge email ✅
6. Entries granted ✅

### Scenario 3: User Closes Modal During Recovery
1. Recovery flow starts → creates new PaymentIntent
2. User closes modal → `cardFormRef.current` becomes null
3. Null check prevents error ✅
4. User sees clear error message ✅

## Testing Checklist

- [ ] One-time purchase with card → entries granted
- [ ] One-time purchase with Apple Pay → entries granted
- [ ] One-time purchase with Google Pay → entries granted
- [ ] New user (guest) → account created → entries granted
- [ ] Existing user → entries granted
- [ ] Recovery flow → user closes modal → no error
- [ ] Check Vercel logs for successful user creation from charge email

## Expected Behavior After Fix

1. **All one-time purchases grant entries** - regardless of payment method
2. **Users are found or created** - even when PaymentIntent has no customer
3. **No more "User not found" errors** - webhook has multiple fallback strategies
4. **Recovery flow is robust** - handles modal closure gracefully

## Monitoring

After deployment, check Vercel logs for:
- `✅ Found user by charge billing email` - Fallback working
- `✅ Created new user account from charge billing email` - Account creation working
- `⚠️ PaymentIntent already succeeded - updating metadata only` - Expected for wallet payments
- No more `❌ User not found for payment intent` errors

## Related Files

- `src/app/api/stripe/create-one-time-purchase/route.ts` - PaymentIntent update error handling
- `src/app/api/stripe/webhook/route.ts` - Charge billing_details fallback
- `src/components/modals/MembershipModal.tsx` - Recovery flow null check
- `src/utils/payment/account-manager.ts` - Account creation from metadata
