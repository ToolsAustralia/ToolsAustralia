# Draws — Gotchas

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
