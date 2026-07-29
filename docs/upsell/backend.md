# Upsell — Backend

## Static catalog ([src/data/upsellPackages.ts](../../src/data/upsellPackages.ts))

22 records covering four `upsellCategory` values:

| `upsellCategory` | Count | id pattern | Triggers on |
|---|---|---|---|
| `"membership"` | 3 | `membership-upsell-{tier}` | `triggersOnPackageIds: ["tradie-subscription" / "foreman-subscription" / "boss-subscription"]` |
| `"one-time"` | 6 | `onetime-upsell-{tier}` | the matching one-time pack id |
| `"additional"` | 5 | `additional-upsell-{tier}` | the matching additional-* pack id |
| `"mini"` | 8 | `mini-upsell-{1-3}` / `mini-upsell-additional-{tier}` | the matching mini-pack / additional-*-pack-mini id |

Key fields added in Phase 3 of the upsell-remap refactor:

| Field | Purpose |
|---|---|
| `trackingId` | Distinct analytics/tracking id — by convention equals `id` |
| `upsellCategory` | Replaces old `category`; drives per-category multiplier resolution in Task 3.3 |
| `baseTemplatePackageId` | Internal id of the base pack whose inclusions this upsell mirrors |
| `stripeDescription` | Shown in Stripe Dashboard as the product description on payment-intent creation |

The three membership records are declared inline; one-time, additional, and mini records are produced by the `buildOneTimeUpsellRecords()`, `buildAdditionalUpsellRecords()`, and `buildMiniUpsellRecords()` builders from typed tier tables (`ONE_TIME_TIERS`, `ADDITIONAL_TIERS`, `MINI_TIERS`).

## Helpers

| File | Role |
|---|---|
| [src/utils/upsell/upsell-image-selector.ts](../../src/utils/upsell/upsell-image-selector.ts) | Pick hero image for an offer (consumes the generated manifest) |
| [src/utils/upsell/original-purchase-pm.ts](../../src/utils/upsell/original-purchase-pm.ts) | Reuse original purchase's saved payment method when available |
| [src/generated/upsellImageManifest.ts](../../src/generated/upsellImageManifest.ts) | **Generated** — do not edit manually |

## Generation script

[scripts/build-upsell-image-manifest.ts](../../scripts/build-upsell-image-manifest.ts) — scans the upsell image directories and writes the static manifest. Runs in `prebuild` and `predev` per `package.json`. CLAUDE.md mandates this runs before `dev`/`build`.

## Mini Pack 4–8 — no migration

`mini-pack-4` … `mini-pack-8` records in [src/data/miniDrawPackages.ts](../../src/data/miniDrawPackages.ts) are flagged `isActive: false`. Their Stripe products, historical orders, and existing `TicketEntry` rows are left untouched — old data is still queryable for historical reads. New mini-draw purchases for the equivalent tier use the new `additional-*-pack-mini` IDs declared in the static catalog.

## Eligibility

`cancellation-upsell-eligibility.ts` lives under [src/utils/redeemables/](../../src/utils/redeemables/) (in [rewards-redeemables](../rewards-redeemables/)) — uses redeemable / subscription history to decide who sees the cancel-upsell offer.

## Resolved attribution metadata

[src/app/api/upsell/purchase/route.ts](../../src/app/api/upsell/purchase/route.ts) resolves attribution at the top of `POST` via `resolveAttributionAtEdge(request)` (from [src/services/attribution/resolveAtEdge.ts](../../src/services/attribution/resolveAtEdge.ts)) and passes the resulting `metadata` into both `handleOneClickPurchase` and `handlePaymentIntentCreation` as `resolvedAttrMetadata`. Each sub-handler spreads `...(resolvedAttrMetadata ?? {})` into its `paymentMetadata` object alongside `buildAttributionMetadata(attribution)`. This ensures all upsell PaymentIntents carry resolved attribution (`attr_platform`, `attr_confidence`, etc.) regardless of payment path.

The same `POST` also builds `requestContext` as `{ ...extractRequestContext(request), ...extractTikTokContext(request) }` and both sub-handlers write the ad-platform click ids into `paymentMetadata`: `capi_fbc`/`capi_fbp` (Meta) and `capi_ttclid`/`capi_ttp` (TikTok, added 2026-07-29). The Stripe webhook has no cookies, so this metadata is the only way the server-side Purchase event gets a click id — see [docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md](../tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md). Both sub-handlers take `requestContext` as a positional param typed to include `ttclid`/`ttp`; keep the two in step if a third payment path is added.
