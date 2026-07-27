# Draws — Gotchas

## Mini-draw copy: "Mini Pack" (never "entries"/"entry pack"), free-entry framing (2026-07-08)

Mini-draw customer copy must sell the **pack**, not entries — the canonical product name is **"Mini Pack"** (`upsellPackages.ts` `displayName`), and entries are a **free inclusion**. Fixed the hero ("Entries start from $1" → "Mini packs start from $1"; "Per Entry" → "Per Pack"), `MiniDrawTabs` ("Purchase entry packages" / "entries can be purchased" → "mini pack"), `HowMiniDrawsWork`, and `MiniDrawEntrySheet` ("entry pack" → "mini pack"). Never price entries per unit and never say "buy entries". This is the site-wide legal rule — see **CLAUDE.md §11** (game-of-chance trade promotion; entries never sold; no odds/chance/gambling framing).

## Mini-draw entries auth = NextAuth session, not a bearer token (2026-06-19)

`/api/mini-draws/entries` (GET/POST/PUT) used a private `getUserFromToken` that read `Authorization: Bearer <token>`. It now authorizes via `requireAuthenticatedUserDoc()` (NextAuth `getServerSession`, in [api-auth.ts](../../src/lib/api-auth.ts)), and the mutating POST/PUT call `requireSameOrigin(request)` for CSRF. Clients send no `Authorization` header — the session cookie is auto-attached. Part of the JWT/auth remediation; see [docs/auth/jwt-auth-remediation-spec.md](../auth/jwt-auth-remediation-spec.md).

## Renewal entry-loss under billing spikes (`addToMajorDraw` swallow) + the reconciler

During synchronized renewal billing spikes (anchor-day billing fires dozens of `invoice.paid` webhooks at once), the draw-credit in `addToMajorDraw` ([`payment-processing.ts`](../../src/utils/payment/payment-processing.ts)) could transiently fail and was **silently swallowed**, leaving the renewal's `data.grants.drawGrants` empty and the member missing/short on the active draw — while their `accumulatedEntries`/`lastMonthAccumulatedEntries` updated. It was invisible (0 `ErrorReport`s; `stripewebhookqueue` showed `succeeded`, because the swallow was *below* the queue layer). May 2026: 60 active members under-credited by 25,235 entries.

Two defenses now exist:
1. **Hardened `addToMajorDraw`** — atomic single-op credit (no full-array reload), `matchedCount` upsert (also kills duplicate rows), and an `ErrorReport` instead of the silent swallow. **No application-level retry** — `$inc`/`$push` aren't idempotent, so an app-retry would double-credit on a lost-ack write; the driver's `retryWrites` covers safe retries and the reconciler covers hard failures. See `docs/payment/gotchas.md`.
2. **Reconciler** [`reconcileActiveMajorDrawEntries`](../../src/utils/draws/reconcile-major-draw-entries.ts), run by the `reconcile-major-draw-entries` cron (daily 16:30 UTC, after the billing-spike window). **Authoritative basis:** correct draw membership = `data.entries` of the member's LATEST in-window membership `BenefitsGranted` event — **NOT** `subscription.lastMonthAccumulatedEntries`, which drifts ahead of the real grant and false-positives. Heals only when: latest renewal has empty `drawGrants` + sub active + renewal not refunded + draw < grant. Idempotent (re-reads before writing), so it never double-credits. The standalone `scripts/fix-major-draw-renewal-entries.ts` (dry-run by default) is the manual equivalent.

**Known scalability ceiling (future work):** all entries still live in one `MajorDraw.entries[]` array, so an extreme synchronized spike still contends on a single document. The hardening shrinks per-op cost + the failure window and the cron guarantees eventual correctness, but the scalable end-state is to spread the load — drain renewals through `stripewebhookqueue` with bounded concurrency, and/or store entries as separate documents (one per user-per-draw) instead of one big array. Audit health any time with `npx tsx scripts/verify-major-draw-entries.ts --dry-run`.

**Read-path amplification (fixed).** Distinct from the write contention above: the hot `/api/major-draw` poll used to load the entire `entries[]` array **twice per request** (un-projected, un-`.lean()`) just to read one user's row plus the participant count — multi-MB of egress + Mongoose hydration per poll that grew monotonically as the draw filled. Now:
- [`getUserMajorDrawStats`](../../src/utils/database/queries/major-draw-queries.ts) projects **only the caller's entry** via `MajorDraw.findById(id, { entries: { $elemMatch: { userId } } }).lean()` (uses the `{'entries.userId': 1}` index).
- [`getCurrentMajorDrawForDisplay`](../../src/utils/draws/major-draw-helpers.ts) excludes the array entirely (`.select("-entries")`) — it is a display/metadata read, and its other callers (SSR `getCurrentMajorDrawServer`, admin `getCurrentAndLastDrawRanges`) never used `entries`.
- Participant count comes from a server-side `$size` ([`getMajorDrawParticipantCount`](../../src/utils/database/queries/major-draw-queries.ts)), so the array never crosses the wire.

The cross-draw **past-draws** path [`getUserAllMajorDrawEntries`](../../src/utils/database/queries/major-draw-queries.ts) (behind `/api/major-draw/user-entries`, used by `useUserMajorDrawEntries`) is now projected the same way — a positional `$` projection + `.lean()` returns only the caller's element from each matched draw, instead of loading every draw's full array.

The single-document **write** contention + 16 MB BSON ceiling above remains the future work. Four helpers still scan full arrays but are **off any live path** (zero callers verified across `src/`) and so were intentionally left as-is: `getUserCurrentMajorDrawStats`, `getUserTotalAccumulatedEntries` (reached only by the unused `validateMajorDrawConsistency` migration helper), `getUserMajorDrawEntries`, and `userHasMajorDrawEntries`. Project them the same way **before** wiring any of them into a live route. Also note `getCurrentMajorDrawForDisplay` returns `Omit<IMajorDraw, "entries">` — `entries` is genuinely absent at runtime on those docs (no array default is applied to deselected paths), and saving one would throw in the model's pre-save hook.

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

**2026-07-07 (Streak P2):** two keys added — **`streak`** (Membership Streak auto-grants; load-bearing because `DrawGrantService` writes via `.save()`, the strictest drop path) and **`promo-link`** (pre-existing drift: it was summed by `major-draw-queries` and seeded by `addToMajorDraw` but absent from the schema). The full consumer checklist when adding a source key: MajorDraw schema + TS interface → both summations in `major-draw-queries.ts` (note `streak` is returned as its own `streakEntries`, NOT folded into `oneTimeEntries`) → `freshEntriesBySource` in `payment-processing.ts` → the fresh-row shape in `DrawGrantService` → `MajorDrawSourceType` in `remove-draw-entries.ts` → reversal source in `RedemptionService.unredeemMilestoneRedemption` (streak-months issuances reverse from `streak`).



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

## Mini-draw view-tracking Klaviyo keys are snake_case

[`MiniDrawViewTracking`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) calls `trackKlaviyoViewContent` with `product_id` / `product_name` — not the camelCase equivalents. The shape is enforced by `KlaviyoEventParams` in [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts). See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) for the full property-naming contract.

## Mini-draw-success Purchase pixel: per-mount ref is NOT enough dedup (2026-07-08)

[`MiniDrawSuccessClient.tsx`](../../src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx)'s browser Purchase fire is guarded by `shouldSuppressPurchasePixel` / `markPurchasePixelFired` ([purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts)) **in addition to** its `firedRef` — the guard suppresses only re-fires older than 46h (younger ones are merged by Meta and recover a swallowed first fire). Do not remove the localStorage guard: the ref only survives one mount, and Meta's event_id dedup lasts ~48h — a revisit of the success URL >48h after purchase (history, restored tab) re-fired a fully-valued Purchase that Meta counted as a new conversion, inflating reported ROAS. The key (`purchasePixelFired_${paymentIntentId}`) is deliberately NOT cleared on sign-out (no user data, and clearing reintroduces the re-fire) and self-prunes after 30 days.

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## /winners and /draw-results are ISR (revalidate 300) as of 2026-07-19

Both pages ran live Mongo queries per request for data that changes only when a draw completes. They are now static with a 5-minute revalidate (marketing CSP route class — see docs/security-csp/architecture.md). If you add per-request/server-session logic to these pages they silently flip to dynamic AND break the CSP route-class invariant — client-fetch instead.

## WinnersTestimony carousel: index-based, no scroll track (2026-07-23 redesign)

**Superseded by the 2026-07-23 "speech bubble" redesign.** The mobile carousel no longer uses a horizontal scroll-snap track, so the old rAF-throttled `onScroll` + cached-offset active-dot tracking (`addRAFScrollListener` / `addThrottledResize`) is **gone**. The carousel is now purely **index-based**: `idx` state selects `stories[idx]`, prev/next wrap with `(idx ± 1 + n) % n`, dots jump to an index, and the single card is re-keyed by id so the CSS `wt-swap` entrance animation replays as the "swap" (no per-frame measurement to throttle). Desktop is an auto-fitting CSS grid (no carousel). If you reintroduce a scrollable track, restore the rAF-throttle pattern — don't read child geometry on every scroll event.
