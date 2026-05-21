# Upsell — Gotchas

## Cancellation upsell — `cancellation-upsell` is a real source key now

[`/api/cancellation-upsell/redeem`](../../src/app/api/cancellation-upsell/redeem/route.ts) writes `entriesBySource."cancellation-upsell"` on the active major draw. Before that key was added to the [MajorDraw schema enum](../../src/models/MajorDraw.ts) (see `docs/draws/gotchas.md`), Mongoose strict mode silently dropped the source write — `user.accumulatedEntries` was bumped by 100, but no draw row reflected it.

If you change the schema's `entries.entriesBySource` keys, make sure both this route and `removeMajorDrawEntries`'s `MajorDrawSourceType` union ([`src/utils/draws/remove-draw-entries.ts`](../../src/utils/draws/remove-draw-entries.ts)) stay in sync. There is no test that enforces this — keep the three files mentally linked.

The route also emits `[cancellation-upsell] …` `console.log` lines that are visible in `next dev` (stripped from prod). Use them when reproducing locally with `stripe listen`.



## Image manifest staleness

(Migrated from `docs/UPSELL_IMAGE_SELECTOR.md` — _TODO: read root file and merge._)

Brief: if you add an image but forget to run `npm run build:upsell-manifest`, the manifest is stale. `prebuild`/`predev` regenerate, so this only bites in non-standard run scripts.

## Eligibility ↔ display drift

Eligibility is server-side; if a deploy changes eligibility but a user has the old client cached, they may see / not see the offer briefly until the next page load. Acceptable — the server-side check at submit time prevents abuse.

## Original-PM reuse and saved-PM lifecycle

If the user deletes their original PM between original purchase and upsell offer, `original-purchase-pm.ts` falls back to prompting for a new card. Don't error.

## Promo multipliers STACK with upsell multipliers

Upsell entry counts use:

```
upsellEntries = activePromoMultiplier × upsellCategoryMultiplier × baseEntries
```

The active promo (Scheduled > Toggle > Alternating, resolved via [PromoMultiplierResolverService](../../src/services/admin/PromoMultiplierResolverService.ts)) **stacks** with the admin-configured `UpsellMultiplierConfig` value. The promo factor comes from `originalPurchaseContext.promoMultiplier` (recorded at trigger-purchase time) so the user always sees a coherent stack tied to their own purchase.

**Historical note (2026-05-15 revision).** Prior to this date the formula was `categoryMultiplier × baseEntries` (no stacking). The system was changed to stack on the user's request so promo seasons amplify upsell value naturally — admins no longer need to manually raise the category knob during a promo. If you see old code or docs claiming "promo multipliers do NOT stack into upsells," update them.

**Mini upsells.** Mini upsells have a hardcoded `1×` category multiplier (no admin knob), so the formula reduces to `activePromoMultiplier × baseEntries` — they still benefit from the mini-packages promo when one is active.

**`upsell-promo-multiplier.ts`.** That helper is used both for **hero image selection** (which `Nx-*.webp` variant to load) **and** as the `activePromoMultiplier` factor inside the calculator. Different name, same source.
