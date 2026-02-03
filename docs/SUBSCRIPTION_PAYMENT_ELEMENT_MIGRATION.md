# Subscription Flow: Payment Element + Invoice PaymentIntent Migration

**Date**: February 2026  
**Status**: Implemented  
**Overview**: The subscription flow was migrated from "SetupIntent + server confirm" to Stripe best-practice **Payment Element + invoice PaymentIntent** (Option A). The first subscription charge is always confirmed on the client via `stripe.confirmPayment()`; the backend never calls `paymentIntents.confirm()` for the first charge; webhooks remain the source of truth.

---

## 1. Architecture Summary

### Before (deprecated for subscriptions)

- User reached payment step → frontend created **SetupIntent** → Payment Element showed with SetupIntent (no amount, limited wallets) → user entered card → frontend confirmed SetupIntent → got `paymentMethodId` → frontend called **create-subscription** with `paymentMethodId` → backend attached payment method, created subscription, returned invoice PaymentIntent `clientSecret` → frontend or backend confirmed payment → webhook activated.

### After (Option A – current)

- User reaches payment step (subscription plan selected) → frontend calls **create-subscription** (or **create-subscription-existing-user**) **without** `paymentMethodId` → backend creates customer + subscription **without** `default_payment_method` → Stripe creates invoice + PaymentIntent (`requires_payment_method`) → backend returns invoice PaymentIntent **client_secret** (and `subscriptionId`, `userId` for new user) → frontend shows **Payment Element with that client_secret only** (no SetupIntent) → user enters card or wallet → user clicks Purchase → frontend calls **`stripe.confirmPayment()`** only (no call to confirm-subscription-payment) → on success: in-modal success flow or redirect to `/checkout/success` for 3DS → **invoice.payment_succeeded** webhook grants benefits and activates subscription.

### Key invariants

- Payment Element **always** uses the **invoice PaymentIntent** `client_secret` for subscriptions (never SetupIntent).
- **Only** the frontend confirms the first subscription payment (`stripe.confirmPayment()`).
- Backend **never** calls `paymentIntents.confirm()` or `invoices.pay()` for the first subscription charge.
- Webhook remains the single source of truth for benefits and subscription activation.

### Hard rule

- **Do not create or reuse SetupIntent for subscription first payment under any condition.** Subscription first payment uses only the invoice PaymentIntent created by the subscription; the frontend never calls create-setup-intent for the subscription flow.

---

## 2. Backend Changes

### 2.1 `src/app/api/stripe/create-subscription/route.ts`

| Change | Description |
|--------|-------------|
| **paymentMethodId optional** | When omitted, no payment method is attached; subscription is created with `payment_behavior: "default_incomplete"` and no `default_payment_method`. |
| **No manual PaymentIntent** | If Stripe does not attach a PaymentIntent to the invoice, the API returns `503` with a retry-friendly message instead of creating a standalone PaymentIntent. |
| **confirmation_secret** | Uses `expand: ["latest_invoice.confirmation_secret"]` and returns `invoicePaymentIntentClientSecret` from `subscription.latest_invoice.confirmation_secret` (handles both string and `{ client_secret }` object). |
| **subscriptionRequestId** | Accepted in body and used as Stripe idempotency key for `subscriptions.create()`. |
| **cancelPreviousSubscriptionId** | Optional. When user switches package, frontend sends the previous incomplete subscription id; backend cancels it (only if incomplete and customer email matches request email) before creating the new subscription. |
| **Metadata** | Subscription metadata includes `subscriptionRequestId`, `userId`, `planId`, `packageId`, and CAPI fields (`capi_client_ip`, `capi_user_agent`, `capi_fbc`, `capi_fbp`) from `extractRequestContext`. |
| **Rate limiting** | Throttle by IP; return `429` when exceeded. |
| **Error handling** | "Payment method cannot be reused" only when client sent a payment method and it could not be used (`hasPaymentMethod && !canUsePaymentMethod`). |

### 2.2 `src/app/api/stripe/create-subscription-existing-user/route.ts`

| Change | Description |
|--------|-------------|
| **paymentMethodId optional** | Same as create-subscription; when omitted, subscription is created without default payment method. |
| **No manual PaymentIntent** | Same as create-subscription; returns `503` if no client secret from Stripe. |
| **confirmation_secret** | Same expand and client secret extraction as create-subscription. |
| **cancelPreviousSubscriptionId** | Optional. When provided, backend cancels that subscription only if it is incomplete and belongs to the current user's Stripe customer. |
| **CAPI** | Uses `extractRequestContext` and includes CAPI fields in subscription metadata (aligned with new-user flow). |
| **Rate limiting** | Same pattern as create-subscription. |

### 2.3 `src/app/api/stripe/confirm-subscription-payment/route.ts`

- **First charge**: Backend must **never** call `paymentIntents.confirm()` or `invoices.pay()` for the first subscription charge. The route is not used for the initial subscription payment; confirmation is client-only via `stripe.confirmPayment()`.
- Kept for any future non–first-charge use (e.g. retry with saved card).

### 2.4 `src/app/api/stripe/webhook/route.ts`

| Change | Description |
|--------|-------------|
| **CAPI from subscription** | When handling subscription-related events, if CAPI context is not in invoice metadata, it falls back to **subscription metadata** so CAPI is available for both new-user and existing-user subscription purchases. |
| **Payment method** | Payment method is saved to the user **only** in `invoice.payment_succeeded` (not in create-subscription or before payment succeeds). |
| **invoice.payment_succeeded** | Remains the canonical handler for granting subscription benefits and activating the subscription. |
| **payment_intent.succeeded** | Continues to skip subscription payments to avoid duplicate benefit granting. |

---

## 3. Frontend Changes

### 3.1 `src/components/modals/MembershipModal.tsx`

| Change | Description |
|--------|-------------|
| **No SetupIntent for subscription** | When the selected plan is a subscription (`activePlan?.period === "mo"`), the modal never calls create-setup-intent; it only uses the invoice PaymentIntent client secret from create-subscription / create-subscription-existing-user. |
| **Create subscription without paymentMethodId** | On step 2 with a subscription plan, the modal calls create-subscription (guest) or create-subscription-existing-user (logged-in) **once**, with **no** `paymentMethodId`, passing `subscriptionRequestId` (UUID). |
| **sessionStorage** | Persists `subscriptionId`, `invoicePaymentIntentClientSecret`, `subscriptionRequestId`, `packageId`, and `ts` under a single key. On reload, if data is present, not stale, and `packageId` matches current plan, the stored client secret is reused and create-subscription is not called again. |
| **Package / plan switch** | When the user changes package before paying, the previous subscription id is stored in `previousSubscriptionToCancelRef` and sent as `cancelPreviousSubscriptionId` on the next create-subscription call. Local state and sessionStorage for the old subscription are cleared so a new subscription is created for the new package. |
| **subscriptionPackageIdRef** | Tracks the package id of the currently created subscription; used to detect plan changes and clear state when the user selects a different package. |
| **Success flow (no 3DS)** | After successful `stripe.confirmPayment()` (no redirect), the modal calls `handlePaymentSuccess(successData)` for the in-modal success experience (message, auto-login for new users, upsell). No redirect to `/checkout/success` in the no-3DS case. |
| **3DS** | When Stripe redirects to the return URL, the user lands on `/checkout/success` with `payment_intent_client_secret`; that page uses `use3DSRedirectHandler` to verify status. |
| **isCreatingSubscription** | New state; set true while create-subscription/create-subscription-existing-user is in progress and passed to `PaymentMethodSelector` so a loading UI (gear spinner) is shown until the Payment Element can mount. |

### 3.2 `src/components/modals/PaymentMethodSelector.tsx`

| Change | Description |
|--------|-------------|
| **Subscription = PaymentIntent only** | When the parent passes `paymentIntentClientSecret` and `intentType: "payment"`, the Payment Element is rendered with that client secret only (no SetupIntent). |
| **confirmStripeIntent** | Ref method name (replaces confirmSetup conceptually for payment intents); for `intentType === "payment"` it calls `stripe.confirmPayment({ elements, clientSecret, confirmParams: { payment_method_data: { billing_details }, return_url }, redirect: "if_required" })`. |
| **clientSecret normalization** | `clientSecretForElements` ensures the value passed to Elements is always a string (handles API or sessionStorage returning an object with `client_secret`). |
| **isCreatingSubscription** | New prop; combined with `isCreatingSetupIntent` and `isCreatingPaymentIntent` into `isCreatingIntent`. When true, a loading state is shown instead of the Payment Element. |
| **Loading state** | When the invoice PaymentIntent is not yet available (`isCreatingIntent` true), shows a **gear spinner** (`Cog` from lucide-react, `text-red-600 animate-spin`) and copy: "Preparing secure checkout..." and "Loading your payment form. This only takes a moment." (same for guest and authenticated users). |

### 3.3 `src/hooks/use3DSRedirectHandler.ts`

- **No Elements dependency** | The hook no longer uses `useStripe()` (which requires an `<Elements>` provider). It uses `loadStripe()` from `@stripe/stripe-js` inside a `useEffect` when a client secret is present, so the checkout success page can verify PaymentIntent status after 3DS redirect without being wrapped in `<Elements>`.

### 3.4 `src/hooks/useStripeSubscription.ts`

- **SubscriptionData / ExistingUserSubscriptionData** | Both interfaces include optional `cancelPreviousSubscriptionId?: string` for plan-switch cancellation. The hook passes the request body through to the API unchanged, so this field is sent when provided by the modal.

---

## 4. Idempotency and State

- **subscriptionRequestId** (UUID from frontend) is sent with create-subscription and create-subscription-existing-user and used as the Stripe idempotency key for `subscriptions.create()`, preventing duplicate subscriptions on refresh, back button, or retry.
- **sessionStorage** holds subscription checkout state; optional staleness (e.g. 60 minutes) can be used to force a new create-subscription if desired.
- **One subscription per checkout** | Create-subscription is called once per flow; reuse is via sessionStorage when the same package and non-stale data are present.

---

## 5. What Was Removed or Avoided

- **SetupIntent for subscription** | No create-setup-intent call when the selected plan is a subscription; no `setupIntentClientSecret` passed to PaymentMethodSelector for subscription.
- **confirm-subscription-payment for first charge** | No frontend call to confirm-subscription-payment after create-subscription; no backend confirmation of the invoice PaymentIntent or invoice pay for the first charge.
- **Manual PaymentIntent creation** | Backend does not create a standalone PaymentIntent when Stripe has not attached one to the invoice; it returns `503` and a retry message instead.
- **Saving payment method before success** | Payment method is saved to the user only in the `invoice.payment_succeeded` webhook handler, not in create-subscription or before payment succeeds.

---

## 6. File Reference

| File | Role |
|------|------|
| `src/app/api/stripe/create-subscription/route.ts` | New-user subscription creation; optional `cancelPreviousSubscriptionId`; returns invoice PaymentIntent client secret only from Stripe. |
| `src/app/api/stripe/create-subscription-existing-user/route.ts` | Existing-user subscription creation; same client-secret and cancel-previous behavior; CAPI in metadata. |
| `src/app/api/stripe/confirm-subscription-payment/route.ts` | Not used for first charge; no server-side confirm for initial subscription payment. |
| `src/app/api/stripe/webhook/route.ts` | CAPI fallback from subscription metadata; payment method saved only in `invoice.payment_succeeded`. |
| `src/components/modals/MembershipModal.tsx` | Subscription flow: no SetupIntent; create-subscription without paymentMethodId; sessionStorage + packageId; plan switch via cancelPreviousSubscriptionId; isCreatingSubscription loading state; in-modal success for non-3DS. |
| `src/components/modals/PaymentMethodSelector.tsx` | Payment Element with invoice PaymentIntent only for subscription; confirmStripeIntent; clientSecret normalization; isCreatingSubscription; gear spinner loading UI. |
| `src/hooks/use3DSRedirectHandler.ts` | Uses loadStripe() directly so success page works without Elements provider. |
| `src/hooks/useStripeSubscription.ts` | Types and passthrough for cancelPreviousSubscriptionId. |
| `src/app/api/stripe/cancel-incomplete-subscription/route.ts` | Existing route; plan-switch cancellation is implemented via `cancelPreviousSubscriptionId` on create-subscription routes instead of a separate call from the modal. |

---

## 7. Related Documentation

- **SUBSCRIPTION_FLOW_ASSESSMENT.md** (root) – Earlier flow description; superseded by this migration for the subscription path.
- **docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md** – PaymentElement and confirmation_method (manual vs automatic).
- **docs/PAYMENT_ERROR_HANDLING_AND_RECOVERY.md** – Payment error handling and recovery.
