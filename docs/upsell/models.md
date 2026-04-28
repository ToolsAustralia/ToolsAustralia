# Upsell — Models

This domain doesn't own its own collections.

Reads/writes via:
- **[billing-stripe](../billing-stripe/)** — `PaymentEvent.data.grants` ledger records upsell-granted entries
- **[draws](../draws/)** — `TicketEntry` rows for granted draw entries
- **[rewards-redeemables](../rewards-redeemables/)** — eligibility helper

The "config" for upsell offers (which packages, prices, copy) lives in [src/data/upsellPackages.ts](../../src/data/upsellPackages.ts) — static data, not Mongo.
