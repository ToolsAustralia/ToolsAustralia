# Upsell — Rules

## R1. Image manifest must be fresh

[src/generated/upsellImageManifest.ts](../../src/generated/upsellImageManifest.ts) is generated. NEVER edit manually. If you add/change images, regenerate:

```bash
npm run build:upsell-manifest
```

`prebuild` and `predev` scripts run this automatically. If the script fails, `dev` and `build` will not start.

## R2. Eligibility computed server-side

The cancel-upsell offer must be gated server-side via `cancellation-upsell-eligibility.ts`. Don't decide eligibility on the client — users could enumerate offers they shouldn't see.

## R3. Original PM reuse only when consented

`original-purchase-pm.ts` reuses the saved card from the user's original purchase when available. This must only happen for the same user and within Stripe's saved-PM rules — don't reuse a card across users.

## R4. PCI compliance carries over

All [payment](../payment/rules.md) PCI rules apply. PM ids only, no card data persisted in upsell-related rows.

## R5. Promo multiplier applied at grant time

Multipliers from [promo](../promo/) flow through `upsell-promo-multiplier.ts` at the moment of grant — don't try to apply them client-side as a display tweak.
