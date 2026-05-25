# Draws — Gotchas

## Renewal entry-loss under billing spikes (`addToMajorDraw` swallow) + the reconciler

During synchronized renewal billing spikes (anchor-day billing fires dozens of `invoice.paid` webhooks at once), the draw-credit in `addToMajorDraw` ([`payment-processing.ts`](../../src/utils/payment/payment-processing.ts)) could transiently fail and was **silently swallowed**, leaving the renewal's `data.grants.drawGrants` empty and the member missing/short on the active draw — while their `accumulatedEntries`/`lastMonthAccumulatedEntries` updated. It was invisible (0 `ErrorReport`s; `stripewebhookqueue` showed `succeeded`, because the swallow was *below* the queue layer). May 2026: 60 active members under-credited by 25,235 entries.

Two defenses now exist:
1. **Hardened `addToMajorDraw`** — atomic single-op credit (no full-array reload), `matchedCount` upsert (also kills duplicate rows), bounded retry, and an `ErrorReport` instead of the silent swallow. See `docs/payment/gotchas.md`.
2. **Reconciler** [`reconcileActiveMajorDrawEntries`](../../src/utils/draws/reconcile-major-draw-entries.ts), run by the `reconcile-major-draw-entries` cron (daily 16:30 UTC, after the billing-spike window). **Authoritative basis:** correct draw membership = `data.entries` of the member's LATEST in-window membership `BenefitsGranted` event — **NOT** `subscription.lastMonthAccumulatedEntries`, which drifts ahead of the real grant and false-positives. Heals only when: latest renewal has empty `drawGrants` + sub active + renewal not refunded + draw < grant. Idempotent (re-reads before writing), so it never double-credits. The standalone `scripts/fix-major-draw-renewal-entries.ts` (dry-run by default) is the manual equivalent.

## Refund reversal must pass `drawId` to `removeMajorDrawEntries`

[`removeMajorDrawEntries`](../../src/utils/draws/remove-draw-entries.ts) accepts an **optional** `drawId` parameter. **Always pass it** when the caller knows which draw the entries originally went to — the refund ledger does (every `BenefitsGranted` event with `data.grants.drawGrants[].drawId`). Omitting `drawId` falls back to the legacy multi-draw walk: the function will query *every* major draw containing this user and consume `sourceType` entries from the oldest forward until the refund amount is satisfied.

That fallback caused silent historical corruption: a refund of one month's renewal would over-remove `membership` entries from a *previous* month's draw if the user's current-draw row didn't hold enough membership entries to cover the refund (e.g. because the current row's entries were partly from a `bonus-entry-promo` or `cancellation-upsell` source).

**Concrete failure pattern** — user with entries in April Draw `{mem: 400, upsell: 800}` and May Draw `{mem: 440}`; refund of the May renewal called `removeMajorDrawEntries(userId, 440, "membership")` without a drawId; April was iterated first; 400 of the 440 came out of April's membership counter (now 0), leaving April's `totalEntries` 400 less than its `entriesBySource` sum. See `docs/payment/gotchas.md` for the refund-side detail.

**Legacy callers without drawId** (intentional, still walk-based):
- [`RedemptionService.reverseBonusEntries`](../../src/services/redeemables/RedemptionService.ts) — bonus-entry redemptions don't store the originating draw.
- [`refund-ledger-reversal.ts` legacy fallback](../../src/utils/payment/refund-ledger-reversal.ts) — used only for `BenefitsGranted` events that predate the `drawGrants` ledger.

Both log a `[refund-reversal] WARNING: legacy multi-draw walk active` line so they can be audited.

## `entriesBySource` must include every source key the schema lists

The MajorDraw schema's `entries.entriesBySource` is a fixed enum. Mongoose strict mode silently drops `$inc` and `$push` writes that reference keys not in the enum. If you add a new entry source (e.g. a new redemption type or retention offer), **add the key to [`src/models/MajorDraw.ts`](../../src/models/MajorDraw.ts) first**, otherwise the entries grant to `user.accumulatedEntries` but vanish from the major-draw breakdown.

The `cancellation-upsell` key was added to fix exactly this — entries from `/api/cancellation-upsell/redeem` had been silently dropped from the breakdown for any prior redemption.



## Major-draw transitions

(Migrated content from `docs/MAJOR_DRAW_TRANSITIONS.md`.)

### Debouncing is per-instance, not distributed

The 5-second debounce window is per-lambda-instance. In a high-traffic burst, multiple lambdas may all run the transition simultaneously. That's intentional and acceptable because:
- Operations are idempotent
- Cron is the authoritative fallback at 1:30 UTC daily
- `updateMany` is atomic

If you ever need stricter coordination (e.g. for an exactly-once side-effect), introduce a distributed lock (Redis or MongoDB lease document). Don't try to make the in-memory debouncer distributed.

### Why parallel `updateMany` is safe

Three operations run in `Promise.all`:
1. Complete (active|frozen → completed)
2. Activate (queued → active)
3. Freeze (active → frozen)

These have **disjoint filter conditions**, so even if interleaved, they can't conflict. A `queued` row can't suddenly become `frozen` mid-way; it has to pass through `active` first, and the activate filter won't match a row already moved to `active` by another op (idempotent filters use the *current* state).

### Connection pool exhaustion

Without debouncing, a Stripe webhook burst (multiple events arriving quickly) could call the transition service many times in a second, each spawning their own connection-pool usage. The 5s debounce caps this.

If you see Atlas connection-pool warnings around webhook events, check whether the debouncer is in effect or has been bypassed.

## Eligibility

### Anchor day matters here

Subscription members who renew on the 24th have ≥3 days before the major-draw window freezes. If you change the anchor logic, draw eligibility timing changes too. See [subscription R11-R13](../subscription/rules.md).

### Accumulator preserved across cancel

`User.subscription.lastMonthAccumulatedEntries` survives cancellation so resubscribers don't lose accumulated entries. The cancel service preserves it; the resubscribe flow consumes it. See [subscription R3](../subscription/rules.md#r3-lastmonthaccumulatedentries-is-preserved-across-cancel).

## Mini-draw participation

`User.miniDrawParticipation[]` is denormalized for fast UI queries (which mini-draws is this user in?). It's kept in sync by:
- Mini-draw entry purchase webhook
- Refund reversal (`remove-draw-entries.ts`)

If you write directly to `TicketEntry` for a mini-draw, also update `User.miniDrawParticipation` — or use the helpers that handle both.

## Winner declaration

> _TODO: locate the winner-declaration logic and document edge cases (tied winners, withdrawn entries, etc.)._

## Strip schedule

`major-draw-strip-schedule.ts` exists for the visual draw-strip UI. _TODO: document its exact role._

## Cron failure

If the daily cron fails, transitions can lag. Monitor: webhooks will still trigger transitions on each call, but if no traffic + no cron, draws can stay in stale states for days. Atlas profiler comments help spot which call site last ran transitions.

## `/api/major-draw` & `/api/mini-draws` embed per-user data — don't public-cache them

Both routes return per-user fields (`userStats` on major-draw, `hasActiveMembership` on mini-draws) derived from the session cookie, alongside the public draw data. They must not be cached as `public` keyed by URL only — a shared/browser cache will serve a guest copy (`userStats: null` → **0 entries**) to a logged-in user, which is exactly the "entries show 0 until reload" bug. Both now route their `Cache-Control` through [`userScopedCacheControl`](../../src/utils/security/cache-control.ts) (`private, no-store` when authenticated; `public …` + `Vary: Cookie` for guests). See [security-csp/rules.md R7](../security-csp/rules.md). Reproduces only on staging/production (dev is `no-store`).
