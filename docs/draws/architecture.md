# Draws — Architecture

## Two draw types

| Type | Cycle | Models | Routes |
|---|---|---|---|
| **Major Draw** | Monthly (28th–27th) | `MajorDraw`, `MonthlyEntryCampaign`, `SegmentSnapshot` | `/api/major-draw/**`, `/major-draw/page` |
| **Mini Draw** | Per-product (varies) | `MiniDraw` | `/api/mini-draw/**`, `/mini-draws/[id]` |

Shared: `TicketEntry` (entries into a draw), `Winner` (drawn results).

## Major draw lifecycle

```
queued ─►(activationDate hits)─► active ─►(freezeEntriesAt hits)─► frozen ─►(drawDate hits)─► completed
```

Status transitions are managed by [`major-draw-transition-service.ts`](../../src/utils/draws/major-draw-transition-service.ts) — the **single authority** that handles `queued → active → frozen → completed`.

(Migrated from `docs/MAJOR_DRAW_TRANSITIONS.md`.)

### Three call sites for the transition service

1. **Cron** — `/api/cron/major-draw-transition` runs daily at 1:30 PM UTC. Authoritative fallback. Also handles Klaviyo resets, new-draw creation, cleanup.
2. **Webhook** — `/api/stripe/webhook` calls it before `getTargetMajorDraw()` so payment-processing sees fresh statuses.
3. **Helper** — `getTargetMajorDraw()` itself calls it at the top, debounced.

### Three atomic ops in parallel

1. **Complete**: `active|frozen → completed` when `drawDate <= now`.
2. **Activate**: `queued → active` when `activationDate <= now`.
3. **Freeze**: `active → frozen` when `freezeEntriesAt <= now` AND `drawDate > now`.

All use `updateMany` with timeout protection (`maxTimeMS: 5000`), idempotent filters, observable query comments for Atlas profiling.

### Debouncing

5-second per-lambda-instance window. Skips if called within last 5s. Acceptable because:
- Operations are idempotent
- Cron is authoritative fallback
- Parallel `updateMany` is safe
- Prevents connection-pool exhaustion in traffic spikes

(Future enhancement: Redis lock or MongoDB lease document for distributed coordination.)

### Connection health checks

1. `mongoose.connection.readyState === 1` (fast, no network).
2. `db.admin().ping()` (throttled to once per 30s — expensive in serverless).

### Never-throw contract

Service returns `TransitionResult` objects, never throws. Errors degrade gracefully.

## Mini-draw lifecycle

Per-product: each `MiniDraw` represents a product giveaway tied to a specific package or product purchase. Has its own activation/draw dates, but doesn't follow the major monthly cadence.

User participation tracked on `User.miniDrawParticipation[]` (subdoc) — see [models.md](./models.md).

## Eligibility & purchase cooldown

`getTargetMajorDraw()` decides which active draw a purchase enters. The choice depends on:
- Current draw status
- Time-windows (activation, freeze, draw)
- Anchor day rule for subscriptions (see [subscription rules R11-R13](../subscription/rules.md#billing-anchor-24th))

Purchase cooldown: [src/lib/purchaseCooldown.ts](../../src/lib/purchaseCooldown.ts) prevents rapid-fire purchases from gaming entry counts.

## Segment snapshots

`SegmentSnapshot` captures point-in-time membership tier distributions for analytics — used for retro reporting on who was in which segment when a draw was decided.

## Winner selection

> _TODO: locate and document the winner-selection logic — likely in `utils/winners.ts` and/or a script under `scripts/`._

`utils/winner-name-formatter.ts` is purely presentation (e.g. "John D." for privacy on public pages).

## Public results pages

- `/draw-results/` — Draw Results & Winners (redesigned 2026-06-10): hero + register (all/major/mini) + wall + how-chosen + CTA; SSRs the unified winners feed via `getAllWinners()`. See [frontend.md](./frontend.md#draw-results--winners-page-redesigned-2026-06-10).
- `/winners/` — winner gallery
- `/major-draw/` — current major draw + countdown
- `/mini-draws/[id]/` — a specific mini draw + countdown

All read from the public-safe formatted data (no PII beyond first-name + last-initial).

## Per-draw revenue is DERIVED, not stored (2026-07-30)

`MajorDraw` has no revenue field and is not getting one. The admin draws pages show
per-draw revenue in eight places (ribbon stat, both KPI strips, a table column, a
per-entry sub-line, group meta lines, the inspector, a sort option); all of it comes from
[`src/services/admin/drawRevenue.ts`](../../src/services/admin/drawRevenue.ts), computed
from `PaymentEvent` at read time.

### The window rule

A draw's revenue must cover exactly the payments whose **entries** landed in that draw, or
the money figure contradicts the entry count printed beside it. Entry routing is decided by
[`getTargetMajorDraw`](../../src/utils/draws/major-draw-helpers.ts): a payment created
*before* the active draw's `freezeEntriesAt` enters that draw; at or after it, the entry is
deferred to the next queued draw. So the matching window is:

```
[ previousDraw.freezeEntriesAt , thisDraw.freezeEntriesAt )
```

**Chained off the previous freeze — not off this draw's own `activationDate`.** Between one
draw freezing (say the 27th at 20:00) and the next activating (the 28th at 00:00) there is a
**gap period**, and `getTargetMajorDraw` sends gap-period payments to the next queued draw.
An activation-based window would drop that money on the floor. The chained window absorbs it,
and the windows come out contiguous by construction.

Boundary handling:

| Case | Behaviour |
|---|---|
| Earliest draw in the set (no predecessor) | Falls back to its own `activationDate`; with neither, opens at the epoch |
| `freezeEntriesAt` missing (legacy rows) | Falls back to `drawDate` |
| No usable end boundary at all | The draw is **dropped**, not given an Invalid Date window |
| `start >= end` | Degenerate — skipped |
| End boundary | **Exclusive.** A payment at the freeze instant belongs to the next draw, mirroring `getTargetMajorDraw` |

### Lockstep requirement

**If the entry-routing rule in `getTargetMajorDraw` changes, this window must change with
it.** Nothing enforces that — the two would silently diverge and the admin would see revenue
that disagrees with the entry count. `npm run test:draw-revenue` pins the boundary semantics
(20 assertions, pure, no DB), so at least the intended rule is executable.

### Units and refunds

`PaymentEvent.data.price` is in **dollars** (application convention). Refunds are netted by
excluding the **whole** `BenefitsGranted` row when a `RefundProcessed` exists for the same
`paymentIntentId` — done by `fetchNetBenefitsGrantedWithMatch`, which is also why
`RefundProcessed.refundAmount` (in **cents**) never reaches a sum here.

### Cost

One aggregation per request, not one per draw. The windows are contiguous, so a single
`[earliest.start, latest.end)` fetch covers the whole set and the bucketing is in-memory via
binary search. Do not call `getRevenueByDraw` inside a row loop.
