# Upsell — Gotchas

## Cancellation upsell — `cancellation-upsell` is a real source key now

[`/api/cancellation-upsell/redeem`](../../src/app/api/cancellation-upsell/redeem/route.ts) writes `entriesBySource."cancellation-upsell"` on the active major draw. Before that key was added to the [MajorDraw schema enum](../../src/models/MajorDraw.ts) (see `docs/draws/gotchas.md`), Mongoose strict mode silently dropped the source write — `user.accumulatedEntries` was bumped by 100, but no draw row reflected it.

If you change the schema's `entries.entriesBySource` keys, make sure both this route and `removeMajorDrawEntries`'s `MajorDrawSourceType` union ([`src/utils/draws/remove-draw-entries.ts`](../../src/utils/draws/remove-draw-entries.ts)) stay in sync. There is no test that enforces this — keep the three files mentally linked.

The route also emits `[cancellation-upsell] …` `console.log` lines that are visible in `next dev` (stripped from prod). Use them when reproducing locally with `stripe listen`.



## Purchase pixel re-fires after Meta's ~48h dedup window (fixed 2026-07-08)

`UpsellSuccessClient.tsx` used to guard the browser Purchase fire with only a per-mount `firedRef`. Meta deduplicates identical `event_id`s for ~48h, so a refresh was harmless — but reopening the same `/upsell-success?payment_intent=...` URL (history, restored tab) **more than 48h after purchase** re-fired a fully-valued Purchase that Meta counted as a brand-new conversion, inflating Meta-reported ROAS. Now guarded persistently via `shouldSuppressPurchasePixel` / `markPurchasePixelFired` ([src/utils/tracking/purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts), localStorage key `purchasePixelFired_${paymentIntentId}` holding the FIRST-fire time). The guard is window-aware: re-fires younger than 46h stay allowed (Meta merges them; they recover a silently swallowed first fire), only older re-fires — the ones Meta would count as new — are suppressed. The flag is deliberately **not** cleared on sign-out (no user data; clearing would reintroduce the re-fire), and storage failures (e.g. Safari private mode) degrade to the pre-guard behavior with Meta's 48h dedup as fallback. If you add a new success page that fires Purchase, use the same guard.

## Image manifest staleness

(Migrated from `docs/UPSELL_IMAGE_SELECTOR.md` — _TODO: read root file and merge._)

Brief: if you add an image but forget to run `npm run build:upsell-manifest`, the manifest is stale. `prebuild`/`predev` regenerate, so this only bites in non-standard run scripts.

## Resolved — the hero fell back to an asset that never existed (2026-08-04)

`resolveUpsellImage` used to end with `return { src: "/images/upsells/_fallback.webp" }`, and that
file was **not in the repo** — `public/images/upsells/` shipped only a 0-byte `_fallback.gitkeep`,
which is what a directory gets when it is created empty and the "real placeholder later" never
happens. Unlike the variant and default rungs, that terminal rung was **not** manifest-gated: it was
returned unconditionally, including on the early return for an unknown `offerId`.

So any offer falling through both real rungs requested a 404, Next's image optimizer then answered
`400` (*"…isn't a valid image… received null"*), and the customer got **bare alt text where the hero
should be** — at the exact moment they were being asked to buy. Frame-verified in an e2e failure
screenshot.

**The fix is the code, not the asset.** Adding a real `_fallback.webp` was the first attempt and was
rejected: artwork exists only for the multipliers actually in use (membership runs at 5x and 10x; the
others are follow-ups), so a global placeholder stands in for art that was never meant to exist — it
hides the gap rather than handling it.

Instead the terminal rung returns **`null`**, `ResolvedUpsellImage["src"]` is `string | null`, and
`OfferHero` returns `null` when there is no artwork. The offer renders with **no hero at all** rather
than a broken one; blank is the intended outcome, and the title, price and CTA carry the layout.

Guarded by `testResolvedSrcAlwaysExists` in `npm run test:upsell-images`, which asserts every
non-null `src` names a file the manifest knows about — so a path to a missing asset cannot come back
silently. While adding it, two tests in that suite turned out to be **defined but never called**
(`testUnknownOfferFallsBack`'s sibling and the effective-multiplier case); both are registered now.

See `rules.md` R6.

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

## Promo DOES stack on the upsell category multiplier (ratified 2026-07-22)

`calculateUpsellEntriesForOffer` / `calculateUpsellEntriesFromContext` compute
`promoMultiplier × categoryMultiplier × baseEntries` — a 10× membership promo makes the
Apprentice membership upsell grant 3 × 10 × 10 = **300** entries. A comment in
`src/app/api/upsell/purchase/route.ts` (and its log line) claimed "promo does not stack"
— the OPPOSITE of the code's behavior. Surfaced by the e2e full-journey spec's exact-count
assertion; the owner ratified stacking as intended (the `membership/*-50x.webp` /
`*-100x.webp` artwork variants exist precisely for the stacked 5×/10× promo cases). The
stale comment is fixed; if stacking policy ever changes, `full-journey.spec.ts`'s
`upsellEntries = 3 × 10 × promo` expectation is the tripwire.

## The upsell TRACKER is deleted (2026-08-27)

Not to be confused with upsell *purchases*, which are live and unaffected (2,290 users have
one). What is gone is the engagement-tracking layer that was never switched on.

`UpsellManager.tsx` was imported nowhere in the app. It was the only caller of
`POST /api/upsell/track`, which was the only writer of `User.upsellStats`. So the whole chain
ran zero times in production: measured 2026-08-26, **0 of 56,360 users had
`upsellStats.totalShown > 0`**. Five permanent zeros that read like measured data, and which
were published to Klaviyo as five profile properties until those were retired.

Deleted:

| | |
|---|---|
| `src/components/modals/UpsellManager.tsx` | the unmounted component |
| `src/app/api/upsell/track/` | its only endpoint |
| `useUpsellManager`, `useTrackUpsellEvent`, `useUpsellTracking` | the tracking hooks |
| `UpsellManagerProps` | its props type |
| `User.upsellStats` | interface + schema + all three initialisation sites |

`useUpsellTracking` was doubly dead — it called `/api/upsell/tracking/${offerId}`, a route that
has never existed.

**Kept deliberately:** `usePurchaseUpsell` (5 consumers) and `useUpsellPrefetch` (2 consumers)
are live. `UpsellOffer` and `SAMPLE_UPSELL_OFFERS` stay in `types/upsell.ts` — the dev modal
gallery uses them.

**Also flagged, not done:** `useUpsellOffers`, `useUpsellAnalytics`, `useAcceptUpsellOffer` and
`useDismissUpsellOffer` now have zero consumers (their only caller was `useUpsellManager`).
They are unrelated dead code, not part of the tracker, so they were left alone.

Stored residue is stripped by `npm run migrate:remove-upsell-stats` (`:dry` first). Reviving
upsell funnel data means building a tracker that is actually mounted.

## The retention offer silently lost 373 members' entries (fixed 2026-08-26)

`POST /api/cancellation-upsell/redeem` grants a one-time 100-entry retention offer to a member
part-way through cancelling. It used to do two writes **in the wrong order**:

1. `$inc accumulatedEntries: 100` and set `cancellationUpsellRedeemed: true`
2. a bespoke local `addToMajorDraw()` that resolved the draw with
   `MajorDraw.findOne({ isActive: true })` and **returned silently** when that found nothing

So during any draw-transition window the member's counter rose, the endpoint replied
*"100 free entries successfully added to your account"*, and **no draw ever received the
entries**. Nothing logged at error level; nothing failed.

Measured against production on 2026-08-26:

| | |
|---|---|
| members who redeemed the offer | 590 |
| received their draw entries | 217 |
| **never received them** | **373** |
| entries promised and not delivered | **37,300** |

Affected redemptions run **2025-12 → 2026-06** and then stop, matching the window in which the
legacy `isActive` boolean was unreliable. It is the same window in which the December–May
draws carry `entriesBySource`-vs-`totalEntries` drift.

**The fix — draw first, counter second.** The route now calls
[`DrawGrantService.grantMonthlyCouponEntries`](src/services/redeemables/DrawGrantService.ts),
the canonical grant path, which resolves the target draw via `getTargetMajorDraw` (transitions
if needed, reads `status` not `isActive`, routes around a frozen draw) and reports whether the
entries landed. Only on `landed` does the route touch `accumulatedEntries` or burn the
one-time offer. On `not_written` it returns **503** with a retryable message and the offer stays
available. The bespoke `addToMajorDraw` is deleted — business logic does not belong in a route
handler.

That service's own docblock already stated the contract this route was breaking: *"Callers that
grant a PAID entitlement must treat anything but 'landed' as 'not delivered' and compensate."*

**A third answer, added 2026-08-27: `unconfirmed`.** `grantMonthlyCouponEntries` now returns a
three-state `DrawGrantOutcome` instead of a boolean (and never throws) — see
`docs/rewards-redeemables/gotchas.md` "…and then compensation itself became a double-grant door".
The distinction matters here too: when the draw write cannot be proven either way, the entries may
already be in the live draw, so this route must **not** answer "your offer is still available" — that
sentence invites a retry that would grant the same 100 entries a second time. It answers **500** with
copy telling the member not to try again and logs `REDEEM UNCONFIRMED` with the reason. The offer is
deliberately left unburned: a human decides, off that log line.

**Fixed forward only.** The 373 affected members were NOT retroactively granted — the draws
they redeemed against (Dec–May) are completed and their winners already drawn. List them any
time with `npm run find:missing-retention-entries -- --prod [--csv]`.

Ordering is pinned by `npm run test:retention-grant-order`.
