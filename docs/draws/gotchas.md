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

## The purchase gate failed CLOSED on an API error (2026-08-03)

`useMajorDrawPurchaseGate` computed:

```ts
const gatesClosed = currentMajorDraw?.status !== "active";
```

An **errored** `useCurrentMajorDraw` query leaves `currentMajorDraw` as `undefined`, and
`undefined !== "active"` is `true` — so any `/api/major-draw` outage reported the gates shut to
**every visitor**, opened `GateClosedModal`, and blocked all new entry purchases. A revenue path
failing closed on our own infrastructure error.

The 2026-05-29 fix documented in that file's header covered the **loading** race (it defers the
action while `isMajorDrawLoading` and replays it once data resolves). It did not cover the
**error** case, where `isLoading` is already `false` and `data` never arrives.

Fix: `gatesClosed = !isError && !isMajorDrawLoading && currentMajorDraw?.status !== "active"`.

**Both guards are needed, and the second was missed on the first pass.** The deferral in
`whenGatesOpenElseGateModal` only protects callers that go THROUGH it. `MembershipModal` reads the
raw `gatesClosed` flag in an effect that fires the moment the modal opens (`if (!gatesClosed …)
return; handleClose(); openGateClosedModal();`), so while the query was still in flight it closed
itself and raised the gate modal anyway. Verified live against a simulated outage: with `!isError`
alone the gate modal still appeared; with both guards the purchase modal opens as it should.

**Why failing OPEN is the correct default here, not a loosened guard.** The client gate is a UX
affordance, not the security boundary: `/api/stripe/create-payment-intent` independently calls
`enforceMajorDrawOpenForNewPurchasesOr403()` and rejects a closed-gate purchase with a 403. So
when the client guesses wrong the worst outcome is a server rejection the user can act on —
versus silently blocking every paying customer during an outage. A genuinely closed gate still
reports closed, because a **successful** response carrying `null` (no active draw) or a
non-active status keeps `gatesClosed` true, which is what shows the between-draws modal.

**The transferable lesson:** `data?.field !== VALUE` conflates three distinct states — *loaded and
not matching*, *still loading*, and *failed to load*. Any gate written that way fails closed on
error by construction. When the guarded action is revenue- or access-critical, decide explicitly
what an unknown state should do, and check whether the server already enforces the rule (if it
does, the client should almost always fail open).

Not to be confused with `FloatingCountdownBanner`, which reads the same field but gates its whole
render on `isReady` (set only once `currentMajorDraw` exists) — so an outage *hides* that banner
rather than showing "GATES CLOSED". Two components, same expression, opposite failure modes.

## The mini-pack money path wrote optimistic state to a user id that does not exist (2026-08-03)

`useMiniDrawPurchase` built every user-scoped cache key from the string literal `"current-user"`:

```ts
queryClient.setQueryData(queryKeys.users.account("current-user"), …)
queryClient.invalidateQueries({ queryKey: queryKeys.miniDraws.userEntries("current-user") })
```

`queryKeys.users.account(userId)` and `miniDraws.userEntries(userId)` are keyed by the **real session
id** — the one `UserContext`, `useMyAccountData` and `useUserMiniDrawEntries` read with. So every
one of those calls created (or cancelled/invalidated) a key **no query subscribes to**: the
optimistic entry bump never appeared, the `isProcessing` flag never showed, and the post-webhook
invalidation never refetched. A no-op that looked like working code, because `setQueryData` on an
unknown key silently succeeds. The keys are now built from `session.user.id`, and `handlePurchase`
bails to the login modal when that id is absent — without it the user-scoped writes below it cannot
be keyed at all.

Two more failures were hiding behind the dead keys:

**The rollback snapshots were function locals.** `previousMiniDraw` / `previousUserAccount` were
`const`s inside `handlePurchase`, but the failure paths that need them —
`handlePaymentProcessingError`, `handlePaymentProcessingTimeout`, and the failed branch of the
polling callback — fire **after** `handlePurchase` has returned, once `PaymentProcessingScreen` is
driving. They had nothing to restore, so a visibly failed or timed-out payment kept the inflated
entry count and a stuck `isProcessing: true` for the rest of the session. The snapshot now lives in
`optimisticSnapshotRef` (cleared on `miniDrawId` change so it can never restore another draw's
state, and cleared on confirmed success so nothing can undo a granted pack), and a single
`rollbackOptimisticPurchase()` serves every failure path.

**Only the detail key was invalidated.** The card grid behind the sheet reads the mini-draw **list**,
so refreshing `miniDraws.detail(id)` alone left the grid's fill bar and the "top mini draws"
ordering computed from pre-purchase totals. The post-webhook invalidation now uses the namespace
root `queryKeys.miniDraws.all` (`["mini-draws"]`), which prefix-matches detail/list/entries/activity/
user-entries in one call, plus the shared `usePurchaseInvalidation(userId)` helper that
`useEnterMiniDraw` and `usePurchaseUpsell` already use for the account/dashboard/major-draw/orders/
rewards slices a granted pack moves.

**The transferable lesson:** a placeholder id in a cache key is invisible — no type error, no
runtime error, no failed request. If a hook writes to a user-scoped key, the id must come from the
same source the *readers* use, and optimistic state that outlives the function that created it must
be stored where the later callbacks can reach it (a ref), not in a closure local.

## `/api/major-draw/completed` 500'd on `MissingSchemaError: model "User"` (2026-08-03)

The route `.populate("userId", …)` / `.populate("selectedBy", …)` on `Winner`, whose schema declares
those paths as `ref: "User"`. Mongoose resolves a `ref` by **name at populate time**, so the `User`
model has to already be registered on the connection — but nothing in this route's import graph
(`MajorDraw`, `Winner`, `connectDB`) pulls `src/models/User.ts` in. On a warm instance some other
route had usually registered it first; on a **cold** serverless instance it had not, and the populate
threw `MissingSchemaError: Schema hasn't been registered for model "User"`, which the handler's
catch turned into a generic `500 Failed to fetch completed major draws`. Logged in production.

Fix is the side-effect import `import "@/models/User";` — deliberately unused in the code, so keep
the comment above it or a lint/format pass will read it as dead and remove it.

**The transferable lesson:** a `ref:` string is a runtime lookup, not a compile-time dependency —
`tsc` cannot see it, and the bug only reproduces on a cold start, so it will not show up in local
dev. Any route that populates a ref must import every referenced model itself rather than relying on
another route having loaded it.

## Prize images are product shots on white — `cover` crops them, and a scrim greys them (2026-08-13)

The redesign handoff specified `object-fit: cover` plus a
`linear-gradient(180deg, transparent 45%, rgba(0,0,0,.45) 100%)` scrim on the mini-draw card
image. Both were correct against the prototype's imagery and wrong against production's: the
handoff itself flags its sample shots as **placeholder only** — real images come from
`miniDraw.prize.images` in Mongo, and those are studio product shots on a white background.

What that combination did on the live grid:

- **`cover` cropped the product.** A tall tool chest lost its top and bottom, and the Mitutoyo
  dial indicator was reduced to a slice of the dial with the stem cut off. The one thing a
  browse card exists to show — what you might win — was the thing being cropped away.
- **The scrim greyed the lower half of every photo.** Over a white background a 45%-black
  gradient reads as haze or a dirty print, not depth. It only ever existed to make a white
  logo overlay legible, and that overlay is gone.

Now: `object-contain` with padding, on a **white** container (`bg-white`, not `#FBFBFC` —
against a near-white photo background the 1-step-off grey shows as a visible rectangle seam
inside the card), and no scrim. Applies to all three `MiniDrawCard` view modes, the detail
gallery slide, and the quick-enter sheet's 52px thumbnail.

Two knock-on fixes that the change forced, both worth keeping in mind for any overlay that
moves from "on a photo" to "on white":

1. The brand chip was `bg-white/[.94]` with no border — legible only because of the scrim
   behind it. It now carries `ring-1 ring-black/[0.06]` + `shadow-sm`.
2. The compact card's entries strip was `bg-black/60`. Over white that computes to
   `rgb(102,102,102)`, which is **~3.9:1** against white 9.5px text — under the 4.5:1 floor.
   Raised to `black/75` (~7:1).

**Lesson: a fidelity spec written against placeholder imagery is a spec about the placeholder.**
Check any `cover`/scrim instruction against the real asset class before shipping it.
