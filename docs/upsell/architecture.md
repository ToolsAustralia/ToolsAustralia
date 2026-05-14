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

## Full mapping (22 records — canonical source: spec §3)

### Category counts

| `upsellCategory` | Count | Default multiplier | Trigger packs |
|---|---|---|---|
| `"membership"` | 3 | 10× | `tradie-subscription`, `foreman-subscription`, `boss-subscription` |
| `"one-time"` | 6 | 2× | `apprentice-pack` … `vip-pack` |
| `"additional"` | 5 | 2× | `additional-tradie-pack` … `additional-vip-pack` |
| `"mini"` | 8 | none (1:1) | `mini-pack-1/2/3`, `additional-*-pack-mini` |

### Membership upsells (10× default)

| Trigger | Upsell ID | Upsell shows | Default upsell entries | Price |
|---|---|---|---|---|
| `tradie-subscription` | `membership-upsell-tradie` | Apprentice Pack | 30 free | $9.99 |
| `foreman-subscription` | `membership-upsell-foreman` | Tradie Pack | 150 free | $19.99 |
| `boss-subscription` | `membership-upsell-boss` | Foreman Pack | 300 free | $39.99 |

Note: the upsell references the **next tier down** pack (Tradie sub → Apprentice Pack shape).

### No migration for Mini Pack 4–8

`mini-pack-4` … `mini-pack-8` source records are flagged `isActive: false` in [src/data/miniDrawPackages.ts](../../src/data/miniDrawPackages.ts). Their Stripe products and historical order records are **retained unchanged** — only future purchases use the new `additional-*-pack-mini` IDs. See `backend.md` for the new mini-scoped IDs.

## Entry calculation formula

Upsell entries are calculated server-side at purchase time by `calculateUpsellEntriesForOffer` in [src/utils/payment/upsell-entries-calculator.ts](../../src/utils/payment/upsell-entries-calculator.ts):

```
upsellEntries = upsellCategoryMultiplier × baseEntries(baseTemplatePackageId)
```

- **Membership / one-time / additional** upsells: multiplier comes from `UpsellMultiplierConfig` (looked up via `getUpsellMultiplier(category)`), base entries from `membershipPackages`.
- **Mini** upsells: `baseEntries` unchanged (1:1); `getUpsellMultiplier` is never called.
- **Active promo multipliers do NOT stack** into upsell entries. The promo system governs package purchases; upsells have their own admin-configured multiplier.

The `UpsellMultiplierConfig` admin row stores three values: `membership`, `oneTime`, `additional` (defaults: 10, 2, 2).

## Stripe description convention

Each upsell record carries a `stripeDescription` field that flows into the payment-intent at creation time. Finance, receipts, and webhook payloads use these to distinguish upsell revenue from base-pack revenue without needing separate Stripe Products.

| Suffix | Context |
|---|---|
| *(none — base name only)* | Regular pack purchase |
| ` — Membership Bonus` | Membership upsell |
| ` — Upsell` | One-time / Additional upsell |
| ` — Mini Draw` | Mini-scoped Additional pack purchase |
| ` — Mini Draw Upsell` | Mini-scoped Additional pack upsell |

No new Stripe Products are created in code for upsells — descriptions pass through at payment-intent creation time only. See [billing-stripe/backend.md](../billing-stripe/backend.md#upsell-stripe-descriptions) for the code path.

## Tracking ID convention

```
{category}-upsell-{tier}
  category  ∈ { membership, onetime, additional, mini }
  tier      = base-pack identity (apprentice | tradie | foreman | boss | power | vip
                                  | additional-tradie | … | 1 | 2 | 3)
```

By convention `trackingId` equals the record's `id`.

## Promo multiplier integration (display only)

[src/utils/payment/upsell-promo-multiplier.ts](../../src/utils/payment/upsell-promo-multiplier.ts) (in [payment](../payment/)) resolves the promo multiplier for hero image selection (e.g. `10x-tradie-package.webp`). It is **not** used in the entry-count calculation.

## Cross-domain integration

- **[rewards-redeemables](../rewards-redeemables/)** — `cancellation-upsell-eligibility.ts` lives there but governs upsell offer visibility
- **[promo](../promo/)** — multipliers apply to hero image selection only, not to entry grants
- **[payment](../payment/)** — Payment Intent flow + ledger + `upsell-entries-calculator.ts`
