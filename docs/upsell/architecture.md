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

## Hero image resolution chain

`resolveUpsellImage({ offerId, multiplier })` walks three rungs, under `/images/upsells/`:

| # | Path | Manifest-gated? |
|---|---|---|
| 1 | `{category}/{stem}-{N}x.webp` — variant for the **effective** multiplier (`activePromo × categoryMultiplier`) | yes |
| 2 | `{category}/{stem}.webp` — default for this upsell | yes |
| 3 | `null` — no artwork; the caller renders no image | n/a |

Rungs 1–2 only return a path when `UPSELL_IMAGE_MANIFEST` proves the file exists on disk, which is why an unknown effective multiplier (e.g. `3 × 2 = 6`, outside `PROMO_MULTIPLIERS`) can be accepted optimistically and simply fall through.

Rung 3 returns **`null`**, not a path. That is deliberate: artwork only exists for the multipliers actually in use (membership runs at 5x/10x; the rest are follow-ups), so there is nothing honest for a terminal rung to point at. A path to a file that is not on disk 404s, Next's image optimizer then answers `400`, and the modal renders bare alt text — which is exactly what shipped. `src` is therefore `string | null`, and **callers must render no image when it is null** (`OfferHero` returns `null`). An offer with no artwork is a normal state, not an error. See `rules.md` R6 and `gotchas.md`.

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
upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries(baseTemplatePackageId)
```

**Factors:**
- `activePromoMultiplier` — the promo that applied to the **original trigger purchase**, taken from `originalPurchaseContext.promoMultiplier` (recorded at trigger purchase time). Resolves canonically via [PromoMultiplierResolverService](../../src/services/admin/PromoMultiplierResolverService.ts) (Scheduled > Toggle > Alternating > 1×). When no promo applies, the factor is `1×`.
- `upsellCategoryMultiplier` — admin-configured value from `UpsellMultiplierConfig`, looked up via `getUpsellMultiplier(category)`. Defaults: `membership=10`, `oneTime=2`, `additional=2`. Mini upsells use a fixed `1×` (no admin knob). A sibling helper `getUpsellMultiplierConfig()` returns the full row (`{ membership, oneTime, additional, updatedAt }`) and is what the admin GET handler and the Norm `upsell-multipliers.list` tool both call.
- `baseEntries` — the upsell record's `baseTemplatePackageId` resolved against the static data:
  - membership / one-time / additional → `membershipPackages` (`entriesPerMonth` for subscriptions, `totalEntries` for one-time packs)
  - mini → `miniDrawPackages` (`originalEntries ?? entries`)

**Worked example.** Active promo: membership `5×`. Admin Membership upsell multiplier: `10×`. User buys Tradie subscription and accepts the Apprentice Pack upsell:

```
activePromoMultiplier (5)  ×  upsellCategoryMultiplier (10)  ×  baseEntries (3)  =  150 free entries
```

The 5× promo also applied to the Tradie subscription's own entries (`15 × 5 = 75`); the upsell stacks on top of the same promo.

**Edge cases handled by the calculator:**
- `activePromoMultiplier` is missing, `0`, negative, or `NaN` → clamped to `1` (treated as no promo).
- Unknown `offerId` → returns `0` (caller treats as no upsell granted).
- Mini upsell category → `categoryMultiplier` is bypassed (fixed at `1`); formula reduces to `activePromoMultiplier × baseEntries`.

**Scalability of the model:**
- Adding a new upsell category requires only: extending `UpsellCategory` union in [UpsellMultiplierConfig.ts](../../src/models/UpsellMultiplierConfig.ts), adding the new field with an enum-validated multiplier default, wiring it into `getUpsellMultiplier(category)` resolver, and adding rows for the new category in `upsellPackages.ts`. The formula is universal — no calculator change needed.
- Adding new active-promo sources (e.g., a coupon system) plugs into `PromoMultiplierResolverService` and automatically flows into the upsell formula through `originalPurchaseContext.promoMultiplier`.
- Adding new promo multiplier values: extend `PROMO_MULTIPLIERS` in [src/types/promo-multiplier.ts](../../src/types/promo-multiplier.ts) — Zod schema and Mongoose enums derive from this constant.

## Stripe description convention

Each upsell record carries a `stripeDescription` field that flows into the payment-intent at creation time. Finance, receipts, and webhook payloads use these to distinguish upsell revenue from base-pack revenue without needing separate Stripe Products.

| Suffix | Context |
|---|---|
| *(none — base name only)* | Regular pack purchase |
| ` — Membership Upsell` | Membership upsell |
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
