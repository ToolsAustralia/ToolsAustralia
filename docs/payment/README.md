# Payment domain

Payment Intents, Setup Intents, saved payment methods, 3DS handling, and the rich `utils/payment/` helper layer that sits between the [billing-stripe](../billing-stripe/) Stripe boundary and the [subscription](../subscription/) / [upsell](../upsell/) / [draws](../draws/) flows.

## Index

- [architecture.md](./architecture.md) — Payment Intent vs Setup Intent flows, 3DS redirect handling, ledger writes
- [frontend.md](./frontend.md) — `<PaymentElement>` host components, hooks (`usePaymentIntent`, `useSetupIntent`, `use3DSRedirectHandler`, `useSavedPaymentMethods`)
- [backend.md](./backend.md) — `utils/payment/*` helper inventory, payment-processing.ts ledger writer, refund reversers
- [api.md](./api.md) — `/api/payment-intent/**` and `/api/payment-status/**` route reference
- [rules.md](./rules.md) — PCI compliance, ledger symmetry, 3DS-must-not-bypass
- [patterns.md](./patterns.md) — payment-method id-only storage, ledger grants pattern, reverser modules
- [gotchas.md](./gotchas.md) — confirmation-method fix, default PM string vs object, attribution edge cases
- [models.md](./models.md) — _N/A — this domain doesn't own its own models. Reads `User.savedPaymentMethods` (auth) and writes via [billing-stripe](../billing-stripe/) `PaymentEvent`._
- [testing.md](./testing.md) — `__tests__/` suites under `utils/payment/`

## Related domains

- **[billing-stripe](../billing-stripe/)** — Stripe SDK, webhook router, `PaymentEvent` ledger consumed by this domain.
- **[subscription](../subscription/)** — uses payment domain for new subs and renewal pay-now.
- **[upsell](../upsell/)**, **[draws](../draws/)**, **[cart-shop-products](../cart-shop-products/)** — all consume Payment Intents from this domain.
