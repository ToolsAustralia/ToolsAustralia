# Billing-Stripe domain

The Stripe surface — webhook, payment events ledger, billing helpers, and the ~25 `/api/stripe/*` route handlers that drive subscription, payment, and refund flows.

## Index

- [architecture.md](./architecture.md) — webhook flow, ledger model, refund symmetry
- [frontend.md](./frontend.md) — N/A (no UI in this domain — see [payment](../payment/) and [subscription](../subscription/))
- [backend.md](./backend.md) — `lib/stripe.ts`, anchor billing, webhook router, charge-past-due
- [api.md](./api.md) — full route inventory under `/api/stripe/**` and `/api/invoice/**`
- [rules.md](./rules.md) — idempotency, ledger symmetry, expand pitfalls
- [patterns.md](./patterns.md) — webhook retry safety, idempotency keys, sanitised logging
- [gotchas.md](./gotchas.md) — past-due charge race conditions, dispute handling, refund partial-skip
- [models.md](./models.md) — `PaymentEvent`, `ProcessedStripeEvent`, `InvoiceChargeLog`
- [testing.md](./testing.md) — `npm run test:anchor-billing`, `npm run test:stripe-collection-pause`

## Related domains

- **[subscription](../subscription/)** — owns the membership lifecycle that this domain's webhook updates.
- **[payment](../payment/)** — Payment Intent / Setup Intent / saved-payment-methods flows; uses `lib/stripe-client.ts` from this domain.
- **[admin](../admin/)** — admin-side payment-event reverser and charge-past-due UI.
