# Upsell — Architecture

## Flow

```
Cancellation flow → cancellation-upsell-eligibility decides offer →
   ↓ (if eligible)
   Cancellation upsell modal shown → user accepts → /api/cancellation-upsell
   ↓
   PaymentIntent created → Payment Element → 3DS if needed
   ↓
   Webhook payment_intent.succeeded → processPaymentBenefits writes BenefitsGranted
   ↓
   Upsell-success page (/upsell-success/) confirms purchase
```

## Helpers ([src/utils/upsell/](../../src/utils/upsell/))

| File | Role |
|---|---|
| `upsell-image-selector.ts` | Pick the right hero image for an upsell offer |
| `original-purchase-pm.ts` | Reuse the original purchase's payment method when available (avoids re-auth) |

## Image manifest

[scripts/build-upsell-image-manifest.ts](../../scripts/build-upsell-image-manifest.ts) generates [src/generated/upsellImageManifest.ts](../../src/generated/upsellImageManifest.ts) — a static manifest of upsell hero images. Runs on `prebuild` / `predev` (per CLAUDE.md):

```bash
npm run build:upsell-manifest
```

If you add/change files in the upsell image directories, the script must succeed before `dev` or `build` will start.

## Entry calculation formula (Task 3.3)

Upsell entries are calculated server-side at purchase time by `calculateUpsellEntriesForOffer` in [src/utils/payment/upsell-entries-calculator.ts](../../src/utils/payment/upsell-entries-calculator.ts):

```
upsellEntries = upsellCategoryMultiplier × baseEntries(baseTemplatePackageId)
```

- **Membership / one-time / additional** upsells: multiplier comes from `UpsellMultiplierConfig` (looked up via `getUpsellMultiplier(category)`), base entries from `membershipPackages`.
- **Mini** upsells: `baseEntries` unchanged (1:1); `getUpsellMultiplier` is never called.
- **Active promo multipliers do NOT stack** into upsell entries. The promo system governs package purchases; upsells have their own admin-configured multiplier.

The `UpsellMultiplierConfig` admin row stores three values: `membership`, `oneTime`, `additional` (defaults: 10, 2, 2).

## Promo multiplier integration (display only)

[src/utils/payment/upsell-promo-multiplier.ts](../../src/utils/payment/upsell-promo-multiplier.ts) (in [payment](../payment/)) resolves the promo multiplier for hero image selection (e.g. `10x-tradie-package.webp`). It is **not** used in the entry-count calculation.

## Cross-domain integration

- **[rewards-redeemables](../rewards-redeemables/)** — `cancellation-upsell-eligibility.ts` lives there but governs upsell offer visibility
- **[promo](../promo/)** — multipliers apply to hero image selection only, not to entry grants
- **[payment](../payment/)** — Payment Intent flow + ledger + `upsell-entries-calculator.ts`
