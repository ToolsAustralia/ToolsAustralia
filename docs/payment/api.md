# Payment — API

## Domain-owned routes

| Method | Path | Purpose |
|---|---|---|
| _TODO: enumerate_ | `/api/payment-intent/**` | Read PI status / metadata |
| _TODO: enumerate_ | `/api/payment-status/**` | Higher-level "did this payment succeed for purpose X?" |

> _TODO: read [src/app/api/payment-intent/](../../src/app/api/payment-intent/) and [src/app/api/payment-status/](../../src/app/api/payment-status/) and document each handler's auth/req/res._

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
