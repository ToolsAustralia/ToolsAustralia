# Billing-Stripe — API

Full inventory of routes under `/api/stripe/**` and `/api/invoice/**`. Auth and exact request/response shapes are flagged TODO where not yet read; **the route handlers should be the source of truth, not this doc** — refresh when handlers change.

## Routes — Stripe surface

### Subscription lifecycle

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-subscription` | New user signup; uses anchor helper for 25th-27th joiners |
| POST | `/api/stripe/create-subscription-existing-user` | Existing user (re-)subscribing |
| POST | `/api/stripe/renew-subscription` | User retry on a failed renewal invoice; clears pause-collection on success |
| POST | `/api/stripe/cancel-subscription` | User-facing cancel (delegates to subscription/CancelSubscriptionService) |
| POST | `/api/stripe/cancel-incomplete-subscription` | Clean up stuck `incomplete` checkout |
| POST | `/api/stripe/confirm-subscription-payment` | Confirm a Payment Intent for a created subscription |
| POST | `/api/stripe/upgrade-subscription-payment` | Upgrade flow — proration via Payment Intent |
| POST | `/api/stripe/downgrade-subscription` | Downgrade flow — preserves old benefits via `User.subscription.previousSubscription` |
| POST | `/api/stripe/update-auto-renew` | Toggle `cancel_at_period_end` |

### Payment intent / setup intent

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-payment-intent` | One-time charge intent |
| POST | `/api/stripe/create-setup-intent` | Save card without charging |
| POST | `/api/stripe/check-setup-intent-status` | Poll setup-intent status |
| POST | `/api/stripe/cancel-payment-intent` | Cancel a stuck PI |
| POST | `/api/stripe/verify-payment-intent` | Read-only verification of PI state |
| POST | `/api/stripe/verify-payment-complete` | Higher-level "did this purchase succeed?" check |
| POST | `/api/stripe/analyze-payment-intent` | Diagnostics endpoint (dev/support) |

### Saved payment methods

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stripe/payment-methods` | List user's saved methods (Stripe IDs only) |
| DELETE | `/api/stripe/payment-methods/[id]` | Remove a saved method |
| POST | `/api/stripe/payment-methods/[id]/default` | Set default method |
| PUT | `/api/stripe/payment-intent/[id]/payment-method` | Attach method to existing PI |
| POST | `/api/stripe/subscription/update-payment-method` | Change the card on an active sub |

### Other

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-one-time-purchase` | Mini-draw / one-time pack purchase (new user) |
| POST | `/api/stripe/create-one-time-purchase-existing-user` | Same, for existing user |
| POST | `/api/stripe/create-shop-purchase` | Create PI for a shop order — guest or logged-in. Validates cart server-side (`cartValidation.service`), computes totals (`shopTotals.service`), then creates PaymentIntent with `metadata.type = "shop"`. Returns 400 with line-item errors on validation failure. |
| POST | `/api/stripe/pay-failed-invoice` | User pays a specific failed renewal invoice |
| POST | `/api/stripe/webhook` | **THE** webhook receiver; verifies signature, dedupes via `ProcessedStripeEvent`, dispatches. `payment_intent.succeeded` branches on `metadata.type === "shop"` → `finalizeShopOrder` (atomic stock, Order write, SendGrid invoice, Klaviyo, Meta CAPI). Shop branch returns early; non-shop PIs fall through to `handlePaymentSuccess`. |

### Invoice surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/invoice/finalize` | Force-finalize a draft invoice (admin/operational) |

> _TODO: read each handler to fill in exact auth requirements, request/response shapes, and error codes. Currently the routes are inventoried but not fully spec-documented._

## Cross-domain admin routes

These live under `/api/admin/**` (in the [admin](../admin/) domain) but are tightly coupled to Stripe:

| Method | Path | Domain | Purpose |
|---|---|---|---|
| POST | `/api/admin/users/[id]/cancel-subscription` | admin | Admin cancel — same service as user route |
| POST | `/api/admin/users/[id]/charge-past-due` | admin | Single past-due retry |
| POST | `/api/admin/invoices/charge-past-due` | admin | Bulk past-due retry — see [gotchas](./gotchas.md#charge-past-due-runbook) |
| POST | `/api/admin/users/[id]/payment-events/[eventId]/reverse` | admin | Manual refund-reversal replay |
| GET | `/api/admin/payment-events` | admin | List ledger rows for support |

## Consistent response shape

Per CLAUDE.md route conventions, all `/api/stripe/**` handlers should return one of:

```json
{ "success": true, "data": { ... } }
```

```json
{ "success": false, "error": "<message>", "code": "<machine-readable>" }
```

When wrapping a `SubscriptionReferenceError`, map:
- `NO_ACTIVE_SUBSCRIPTION` → 400
- `STRIPE_RETRYABLE` → 503

When a Stripe SDK error reaches the handler, classify before responding (see [patterns.md](./patterns.md)).
