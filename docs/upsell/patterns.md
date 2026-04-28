# Upsell — Patterns

## P1. Build-time manifest for static assets

Image manifest is generated at build (`prebuild` script). Code reads `src/generated/upsellImageManifest.ts` as a static import. Avoids runtime fs scans.

This pattern is general: when you have a finite set of static assets that need to be enumerated at runtime, generate the manifest at build.

## P2. Original-PM reuse for follow-on purchases

When a user makes an upsell purchase soon after their original transaction, reuse the same `paymentMethodId` to skip 3DS / re-auth. `original-purchase-pm.ts` enforces the rules around this.

## P3. Eligibility colocated with rewards

`cancellation-upsell-eligibility.ts` lives under [redeemables](../rewards-redeemables/) because it consumes redeemable history. The decision-data and the decision-helper live together.
