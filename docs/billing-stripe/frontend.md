# Billing-Stripe — Frontend

_N/A — this domain has no frontend surface._

UI for Stripe interactions lives in:
- [payment](../payment/) — Payment Element, Setup Intent, saved payment methods, 3DS redirect handling
- [subscription](../subscription/) — membership cancel/upgrade/downgrade UI
- [admin](../admin/) — admin Charge Past Due modal, payment-event reverser UI

The browser-side Stripe SDK loader lives at [src/lib/stripe-client.ts](../../src/lib/stripe-client.ts) and is consumed by the [payment](../payment/) domain — not directly by any UI in this folder.

See [architecture.md](./architecture.md) for the server-side responsibilities of this domain.
