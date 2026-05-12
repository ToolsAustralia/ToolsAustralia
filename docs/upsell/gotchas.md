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

## Promo multiplier conflicts

Multiple multipliers (alternating + code-based) can apply to upsell entries. The resolution rule lives in [src/utils/payment/upsell-promo-multiplier.ts](../../src/utils/payment/upsell-promo-multiplier.ts) — read it before adding new multiplier sources.

> _TODO: document the exact precedence._
