# Upsell — Backend

## Helpers

| File | Role |
|---|---|
| [src/utils/upsell/upsell-image-selector.ts](../../src/utils/upsell/upsell-image-selector.ts) | Pick hero image for an offer (consumes the generated manifest) |
| [src/utils/upsell/original-purchase-pm.ts](../../src/utils/upsell/original-purchase-pm.ts) | Reuse original purchase's saved payment method when available |
| [src/generated/upsellImageManifest.ts](../../src/generated/upsellImageManifest.ts) | **Generated** — do not edit manually |

## Generation script

[scripts/build-upsell-image-manifest.ts](../../scripts/build-upsell-image-manifest.ts) — scans the upsell image directories and writes the static manifest. Runs in `prebuild` and `predev` per `package.json`. CLAUDE.md mandates this runs before `dev`/`build`.

## Eligibility

`cancellation-upsell-eligibility.ts` lives under [src/utils/redeemables/](../../src/utils/redeemables/) (in [rewards-redeemables](../rewards-redeemables/)) — uses redeemable / subscription history to decide who sees the cancel-upsell offer.
