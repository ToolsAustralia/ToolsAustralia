# Payment — Frontend

## Components

| Component | Purpose |
|---|---|
| [src/components/payment/PaymentSuccessHandler.tsx](../../src/components/payment/PaymentSuccessHandler.tsx) | Post-confirmation success UI / redirect logic. Consumed by checkout flows that need a success page after the Payment Element confirms. |
| [src/components/payment/StripeInlineCardSetupForm.tsx](../../src/components/payment/StripeInlineCardSetupForm.tsx) | Inline form for adding a saved card via Setup Intent (no charge). Consumed by `my-account` payment methods management. |

> _TODO: enumerate any additional components added under `src/components/payment/` since this doc was written._

The `<Elements>` provider (Stripe.js root) is loaded by the consumers — typically via `useElementsOptions` or a context provider in the parent route group. The browser SDK loader is at [src/lib/stripe-client.ts](../../src/lib/stripe-client.ts) (in the [billing-stripe](../billing-stripe/) domain).

## Hooks

| Hook | Returns | Source |
|---|---|---|
| `usePaymentIntent()` | client_secret + state for a charge-now flow | [src/hooks/usePaymentIntent.ts](../../src/hooks/usePaymentIntent.ts) |
| `useSetupIntent()` | client_secret + state for a save-card flow | [src/hooks/useSetupIntent.ts](../../src/hooks/useSetupIntent.ts) |
| `use3DSRedirectHandler()` | Detects PI/SI id in URL and reconciles status after a 3DS redirect | [src/hooks/use3DSRedirectHandler.ts](../../src/hooks/use3DSRedirectHandler.ts) |
| `useSavedPaymentMethods()` | Lists user's saved methods, supports set-default + delete | [src/hooks/useSavedPaymentMethods.ts](../../src/hooks/useSavedPaymentMethods.ts) |

> _TODO: verify each hook's exact API (mutation vs query, query keys, return shape) — pull from source when refreshing._

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
| [src/utils/payment/stripe/payment-error-detection.ts](../../src/utils/payment/stripe/payment-error-detection.ts) | Classify a Stripe error as recoverable / retryable / non-recoverable; pick a recovery strategy. |
| [src/utils/payment/stripe/payment-error-messages.ts](../../src/utils/payment/stripe/payment-error-messages.ts) | Map raw Stripe errors to user-friendly title + message for toasts. |
| [src/utils/payment/stripe/is-stripe-noise-error.ts](../../src/utils/payment/stripe/is-stripe-noise-error.ts) | Predicate: `true` when the error is Stripe.js client-side noise — incomplete / invalid card fields, validation errors, wallet (Apple Pay / Google Pay) cancellations / payment_exceptions. Handles both Stripe error objects and bare strings. Used to skip auto-logging these to `ErrorReport`. See [error-reporting gotchas](../error-reporting/gotchas.md#stripejs-client-side-validation-noise). |
| [src/utils/payment/stripe/error-handled-marker.ts](../../src/utils/payment/stripe/error-handled-marker.ts) | `markErrorHandled(err)` / `isErrorHandled(err)` — tags an Error as "already processed by an inner handler" so outer try/catch blocks in `MembershipModal.handleSubmit` (and similar long async functions) can skip a second `handlePaymentError` call. Prevents duplicate toasts and duplicate auto-log attempts. |
| [src/utils/payment/stripe/setup-intent-recovery.ts](../../src/utils/payment/stripe/setup-intent-recovery.ts) | Recover from `setup_intent_unexpected_state` (already-succeeded SI). |
| [src/utils/payment/stripe/payment-intent-recovery.ts](../../src/utils/payment/stripe/payment-intent-recovery.ts) | Recover from `payment_intent_unexpected_state`. |
