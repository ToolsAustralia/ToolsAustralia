# Payment — API

## Domain-owned routes

| Method | Path | Purpose |
|---|---|---|
| _TODO: enumerate_ | `/api/payment-intent/**` | Read PI status / metadata |
| GET | `/api/payment-status/[paymentIntentId]` | Polled by `usePaymentStatus` after a confirm. Returns `{ success, processed, status: "completed" \| "pending", data }`. On the completed branch the handler also calls `loadResubscribeContext()` to enrich `data` with the resubscribe carry-over banner context — see below. |

### `GET /api/payment-status/[paymentIntentId]` — completed-branch fields

In addition to the standard fields (`paymentIntentId`, `eventType`, `packageType`, `packageId`, `packageName`, `entries`, `points`, `price`, …), the completed `data` payload includes three resubscribe-banner fields read by [`PurchaseSuccessClient`](../cart-shop-products/frontend.md) to render the "Welcome back!" banner:

| Field | Type | Source |
|---|---|---|
| `wasRecentResubscribe` | `boolean` | `true` iff `user.subscription.lastResubscribedAt` is within `RESUBSCRIBE_BANNER_WINDOW_MS` (`10 * 60 * 1000`, named constant in the handler). |
| `lastMonthAccumulatedEntries` | `number` | Post-resubscribe accumulator from the user document. |
| `entriesGranted` | `number` | Reads `paymentEvent.data?.entries` from the already-loaded `BenefitsGranted` `PaymentEvent` (no extra Mongo round-trip). Client computes `previousAccum = lastMonthAccumulatedEntries − entriesGranted`. |

The handler's `loadResubscribeContext()` helper fetches the user with a narrow `.select("subscription.lastResubscribedAt subscription.lastMonthAccumulatedEntries").lean()` and is wrapped in try/catch with `console.warn` — failures degrade gracefully (banner just doesn't show). `findBenefitsGrantedEvent` now also includes `userId` in its `Pick<>` projection so `loadResubscribeContext()` can be called from the same code path.

> _TODO: enumerate [src/app/api/payment-intent/](../../src/app/api/payment-intent/) handlers (auth/req/res)._

## Cross-domain routes used by payment

The actual Payment Intent and Setup Intent creation lives in [billing-stripe](../billing-stripe/api.md):

| Route | Domain | Purpose |
|---|---|---|
| `/api/stripe/create-payment-intent` | billing-stripe | Create PI for one-time charge |
| `/api/stripe/create-setup-intent` | billing-stripe | Create SI for save-card |
| `/api/stripe/check-setup-intent-status` | billing-stripe | Poll SI status |
| `/api/stripe/cancel-payment-intent` | billing-stripe | Cancel a stuck PI |
| `/api/stripe/verify-payment-intent` | billing-stripe | Read-only PI verification |
| `/api/stripe/verify-payment-complete` | billing-stripe | App-level "succeeded?" check after 3DS redirect |
| `/api/stripe/analyze-payment-intent` | billing-stripe | Diagnostics (dev/support) |
| `/api/stripe/payment-methods` | billing-stripe | List user's saved PMs |
| `/api/stripe/payment-methods/[id]` | billing-stripe | Delete a saved PM |
| `/api/stripe/payment-methods/[id]/default` | billing-stripe | Set default PM |
| `/api/stripe/payment-intent/[id]/payment-method` | billing-stripe | Attach PM to PI |
| `/api/stripe/pay-failed-invoice` | billing-stripe | User-facing failed-renewal pay-now |

## Authorization

All payment routes require an authenticated session (NextAuth). Admin-only payment operations (refund replay, payment-event listing) live under `/api/admin/**` in the [admin](../admin/) domain.

3DS return-URL handling: the `return_url` passed to `confirmPayment()` should always be a same-origin path. Cross-origin returns risk losing the session cookie on Safari (third-party cookie restrictions).
