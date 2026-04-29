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

- `/draw-results/` — past major draws
- `/winners/` — winner gallery
- `/major-draw/` — current major draw + countdown
- `/mini-draws/[id]/` — a specific mini draw + countdown

All read from the public-safe formatted data (no PII beyond first-name + last-initial).
