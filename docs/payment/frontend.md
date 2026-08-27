# Payment — Frontend

## Remove card is shown on EVERY saved card, including the default

`SettingsRedesignPayment.tsx` used to render the Remove action only when `!isDefault`. A member whose **only** card is the default therefore had no way to remove it — there was no second row to reveal the action. Reported from production 2026-08-03.

Remove is now always rendered. The safety lives where it belongs, in two independent places:

- **The dialog** picks its warning from `getPaymentMethodDeleteFlowKind` ([`payment-method-delete-flow.ts`](../../src/utils/payment/payment-method-delete-flow.ts)): `simple` (not the billing card) → `billing-reassign` (billing card, others remain — the backend auto-promotes a replacement) → `billing-last` (billing card, nothing left → renewals stop; only this kind requires a consent checkbox).
- **The API** independently refuses to drop a last billing card without `?confirmBillingRisk=1`, returning `409 REQUIRES_BILLING_RISK_CONFIRMATION`, which the tab re-prompts on. UI and API do not trust each other.

**Copy rule:** these messages are capped at 130 characters and must carry no vendor/internal jargon — say what changes and what it costs, nothing more. Members dismiss walls of text, and the consequence *is* the point of the dialog. Guarded by `npm run test:payment-method-delete-flow`.

## Components

| Component | Purpose |
|---|---|
| [src/components/payment/PaymentSuccessHandler.tsx](../../src/components/payment/PaymentSuccessHandler.tsx) | Post-confirmation success UI / redirect logic. Consumed by checkout flows that need a success page after the Payment Element confirms. |
| [src/components/payment/StripeInlineCardSetupForm.tsx](../../src/components/payment/StripeInlineCardSetupForm.tsx) | Inline form for adding a saved card via Setup Intent (no charge). Consumed by `my-account` payment methods management. |

> _TODO: enumerate any additional components added under `src/components/payment/` since this doc was written._

The `<Elements>` provider (Stripe.js root) is loaded by the consumers — typically via `useElementsOptions` or a context provider in the parent route group. The browser SDK loader is at [src/lib/stripe-client.ts](../../src/lib/stripe-client.ts) (in the [billing-stripe](../billing-stripe/) domain).

### `LazyMembershipModal` — the ONLY sanctioned way to mount `MembershipModal`

[`LazyMembershipModal.tsx`](../../src/components/modals/MembershipModal/LazyMembershipModal.tsx) wraps `MembershipModal` (`./index`) in a `next/dynamic({ ssr: false })` load PLUS a render-gate: it renders `null` until the first `isOpen === true`, then keeps the real modal mounted for the rest of the session (so close animation / internal step state behave like the always-mounted original). This exists because `dynamic()` alone is not enough — see [shared-ui/gotchas.md](../shared-ui/gotchas.md) "rendering a `dynamic()` component while closed still downloads its chunk." Without the render-gate, every guest who lands on a page with a `<MembershipModal>` mount point downloaded the ~7k-line payment chunk (Stripe/embla/zoom libs included) whether or not they ever opened it — the 2026-07 perf audit finding that motivated this wrapper.

**Every call site imports `LazyMembershipModal`, never `MembershipModal/index` directly** (the one exception is the dev-only `src/components/dev/ModalsGalleryClient.tsx`, which intentionally always renders the modal gallery). Import it as:

```tsx
import MembershipModal from "@/components/modals/MembershipModal/LazyMembershipModal";
```

— keeping the local name `MembershipModal` so JSX at call sites is unchanged. `MembershipModalProps` is exported from `MembershipModal/index.tsx` and re-used via `import type` in the wrapper (erased at build, does not pull the heavy chunk).

## Hooks

| Hook | Returns | Source |
|---|---|---|
| `usePaymentIntent()` | client_secret + state for a charge-now flow | [src/hooks/usePaymentIntent.ts](../../src/hooks/usePaymentIntent.ts) |
| `useSetupIntent()` | client_secret + state for a save-card flow | [src/hooks/useSetupIntent.ts](../../src/hooks/useSetupIntent.ts) |
| `use3DSRedirectHandler()` | Reconciles payment status after a 3DS redirect from `payment_intent_client_secret`, and on `succeeded` signs the buyer in from proof of payment — see [3DS session establishment](#3ds-session-establishment) | [src/hooks/use3DSRedirectHandler.ts](../../src/hooks/use3DSRedirectHandler.ts) |
| `useSavedPaymentMethods()` | Lists user's saved methods, supports set-default + delete | [src/hooks/useSavedPaymentMethods.ts](../../src/hooks/useSavedPaymentMethods.ts) |
| `usePaymentStatus(paymentIntentId, options)` | Polls `/api/payment-status/[paymentIntentId]` until `processed === true` or 90s timeout. Returns `PaymentStatusResponse` — see [api.md](./api.md#get-apipayment-statuspaymentintentid--completed-branch-fields). | [src/hooks/queries/usePaymentQueries.ts](../../src/hooks/queries/usePaymentQueries.ts) |

The `PaymentStatusResponse.data` shape on `usePaymentStatus` includes three optional resubscribe-banner fields populated by the route's `loadResubscribeContext()` helper:

```ts
// Resubscribe carry-over context for the success-page banner. Only
// populated on completed payments; `wasRecentResubscribe` is true only if
// the user's `subscription.lastResubscribedAt` is within the route's
// 10-minute banner window (RESUBSCRIBE_BANNER_WINDOW_MS).
wasRecentResubscribe?: boolean;
lastMonthAccumulatedEntries?: number;
entriesGranted?: number;
```

> _TODO: verify each hook's exact API (mutation vs query, query keys, return shape) — pull from source when refreshing._

## 3DS session establishment

A 3DS/SCA buyer is bounced to their bank and back, and Stripe's redirect destroys all in-page React state — including the `guestUserData` bridge the non-3DS flows use to carry a guest into profile setup. Nothing on the landing page could identify them, so they finished **paying** and stayed **logged out**. Fixed 2026-08-27; the failure and its blast radius are in [gotchas.md](./gotchas.md#resolved--a-3ds-buyer-finished-paying-and-stayed-logged-out-2026-08-27), the design in [2026-08-25 mobile verification and SMS login](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).

[`use3DSRedirectHandler`](../../src/hooks/use3DSRedirectHandler.ts) now calls its module-local `establishSessionFromPayment(clientSecret)` when the retrieved intent reports `succeeded`: `POST` [`/api/auth/session-from-payment`](../../src/app/api/auth/session-from-payment/route.ts), then `signIn("auto-login", { token })` with the bridge token it returns. The route belongs to [auth](../auth/) ([api.md](../auth/api.md)) — it takes the client secret and nothing else, derives the user from the PaymentIntent's customer, and requires `status === "succeeded"`.

Three properties are load-bearing. Keep them if you touch this function:

- **Fire-and-forget.** Invoked as `void establishSessionFromPayment(...)`. `paymentStatus` is already `succeeded` by then and must not wait on, or be changed by, the sign-in.
- **Silent on every failure.** No `setError`, no toast, no `ErrorReport`. The money moved — a sign-in hiccup rendered as a payment error would tell a buyer their successful payment failed. Worst case is the pre-fix behaviour (success page, logged out), and the email / SMS sign-in paths stay open. Encoded as [R13](./rules.md#r13).
- **`202` is retried; everything else is terminal.** `202 { pending: true }` is the webhook race — a one-time buyer who never registered has no `User` until the Stripe webhook creates one. The loop re-POSTs on `[0, 1500, 3000, 5000]` ms, then stops. Any other non-`ok` status (403 secret mismatch, 409 intent not `succeeded` / no customer, 429, 500) and any thrown fetch return immediately — retrying cannot change them.

**Scope note.** Only the redirect landings use this route. The three in-modal purchase paths in [`MembershipModal/index.tsx`](../../src/components/modals/MembershipModal/index.tsx) still `POST /api/auth/auto-login`. Migrating them is mechanical and was deliberately left out of this change so a fault in a brand-new route could not break the purchase path that already works — once `session-from-payment` is proven in production, delete `auto-login` and point all four call sites at it.

## State conventions

- **Never store payment-method details in component state** beyond Stripe's PM id. Card data lives in Stripe.
- **TanStack Query** for `useSavedPaymentMethods` and similar reads.
- **No client-side derivation of "is paid"** — wait for the server-side webhook to update state, or call `/api/stripe/verify-payment-complete` after a 3DS redirect.

## Where checkout flows live

This domain provides the *plumbing* (intents, hooks, components). The actual checkout pages live in:
- `src/app/(site)/checkout/**` — main checkout flow ([cart-shop-products](../cart-shop-products/))
- `src/app/(site)/upsell-success/**` — post-cancel upsell ([upsell](../upsell/))
- `src/app/(site)/major-draw/**`, `mini-draws/**` — draw-purchase checkout ([draws](../draws/))
- `src/app/(site)/my-account/**` — saved-payment-method management ([dashboard-account](../dashboard-account/))

## Stripe utilities

| Utility | Purpose |
|---|---|
| [src/utils/payment/stripe/payment-error-detection.ts](../../src/utils/payment/stripe/payment-error-detection.ts) | Classify a Stripe error as recoverable / retryable / non-recoverable; pick a recovery strategy. Also exports `isStripeCardError(error)` — duck-typed check for a *thrown* Stripe card error (`type === "StripeCardError"` \|\| `rawType === "card_error"`), used by `/api/stripe/**` route catch blocks to return the 400 "Payment failed" shape instead of a generic 500 — and `extractPaymentErrorCodes(error)` → `{ code, declineCode }` from any client error shape (raw Stripe error, plain 400 body, ApiError `.data`, axios `.response.data`). The internal `extractResponseBody()` makes `extractErrorMessage` / `extractErrorCode` / `categorizeError` probe ApiError `.data` too (previously only axios `.response.data` was probed, so ApiError decline info was invisible to this pipeline); `categorizeError` also probes `.data` for the `requiresDifferentPaymentMethod` / `failureReason` / `failureCode` flags. |
| [src/utils/payment/stripe/payment-error-messages.ts](../../src/utils/payment/stripe/payment-error-messages.ts) | Map raw Stripe errors to user-friendly title + message for toasts. Hosts the `DECLINE_CODE_GUIDANCE` map (decline_code / card error code → short, direct guidance: 1–2 sentences, one next step) + `getCardDeclineGuidance(declineCode, errorCode)`. `formatPaymentError()` returns decline-specific title/message when the error carries a code/decline_code — unless the errorType is `stripe_excessive_retry` / `invoice_collection_blocked` / setup- or payment-intent recovery, which keep priority. Sensitive codes (`lost_card`, `stolen_card`, `pickup_card`, `fraudulent`) are intentionally NOT mapped — they get the generic "Your card was declined. Try a different card, or contact your bank." per Stripe guidance never to reveal those reasons. Test: `npm run test:decline-guidance`. |
| [src/utils/payment/stripe/is-stripe-noise-error.ts](../../src/utils/payment/stripe/is-stripe-noise-error.ts) | Predicate: `true` when the error is Stripe.js client-side noise — incomplete / invalid card fields, validation errors, wallet (Apple Pay / Google Pay) cancellations / payment_exceptions. Handles both Stripe error objects and bare strings. Used to skip auto-logging these to `ErrorReport`. See [error-reporting gotchas](../error-reporting/gotchas.md#stripejs-client-side-validation-noise). |
| [src/utils/payment/stripe/error-handled-marker.ts](../../src/utils/payment/stripe/error-handled-marker.ts) | `markErrorHandled(err)` / `isErrorHandled(err)` — tags an Error as "already processed by an inner handler" so outer try/catch blocks in `MembershipModal.handleSubmit` (and similar long async functions) can skip a second `handlePaymentError` call. Prevents duplicate toasts and duplicate auto-log attempts. |
| [src/utils/payment/stripe/setup-intent-recovery.ts](../../src/utils/payment/stripe/setup-intent-recovery.ts) | Recover from `setup_intent_unexpected_state` (already-succeeded SI). |
| [src/utils/payment/stripe/payment-intent-recovery.ts](../../src/utils/payment/stripe/payment-intent-recovery.ts) | Recover from `payment_intent_unexpected_state`. |
