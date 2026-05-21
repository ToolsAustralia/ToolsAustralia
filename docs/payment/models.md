# Payment — Models

This domain doesn't own its own Mongo collections. State is split across:

| Collection | Owner | Used for |
|---|---|---|
| `User.savedPaymentMethods` (subdoc) | [auth](../auth/) | List of Stripe PM ids per user (id-only). |
| `User.subscription` (subdoc) | [subscription](../subscription/) | Subscription state. |
| `PaymentEvent` | [billing-stripe](../billing-stripe/) | Ledger of grants/refunds — **the** source of truth for "what this payment unlocked." |
| `ProcessedStripeEvent` | [billing-stripe](../billing-stripe/) | Webhook dedupe lock. |
| `InvoiceChargeLog` | [billing-stripe](../billing-stripe/) | Past-due charge audit trail. |

Payment-domain helpers READ all of these and WRITE through services in their owning domain (e.g. `payment-processing.ts` writes to `PaymentEvent`).

When adding a new payment-related field, place it on the most appropriate existing collection — don't create a new "payment" collection unless absolutely needed. The ledger pattern in `PaymentEvent.data.grants` is extensible without schema migrations.
