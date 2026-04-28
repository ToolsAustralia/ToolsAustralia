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

## Promo multiplier integration

[src/utils/payment/upsell-promo-multiplier.ts](../../src/utils/payment/upsell-promo-multiplier.ts) (in [payment](../payment/)) applies promo multipliers to upsell entries. Lives in payment but reads upsell-domain config.

## Cross-domain integration

- **[rewards-redeemables](../rewards-redeemables/)** — `cancellation-upsell-eligibility.ts` lives there but governs upsell offer visibility
- **[promo](../promo/)** — multipliers may apply to upsell entries
- **[payment](../payment/)** — Payment Intent flow + ledger
