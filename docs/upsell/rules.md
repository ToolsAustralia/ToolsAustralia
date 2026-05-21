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

## R5. Upsell entries stack the active promo with the category multiplier

```
upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries
```

The active promo factor is the one that applied to the **original trigger purchase** (read from `originalPurchaseContext.promoMultiplier`). It comes from the canonical resolver (Scheduled > Toggle > Alternating > 1×). No promo → factor of `1`.

Mini upsells have a fixed `1×` category multiplier (no admin knob), so the formula reduces to `activePromoMultiplier × baseEntries` for the mini category.

Sub-1 / NaN / negative promo values are clamped to `1` by the calculator — never trust caller-provided inputs.
