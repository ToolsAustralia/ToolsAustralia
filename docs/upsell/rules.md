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

## R5. Upsell entries use the category multiplier, not the promo multiplier

`upsellEntries = upsellCategoryMultiplier × baseEntries`. The promo multiplier is **not** a factor in upsell entry math. `upsell-promo-multiplier.ts` is read-only context for the hero image selector — never use its output to scale entry grants.

Admin can raise the category multiplier knob (`UpsellMultiplierConfig`) to increase upsell generosity during promo periods.
