# Draws — Backend

## Helpers ([src/utils/draws/](../../src/utils/draws/))

| File | Purpose |
|---|---|
| `major-draw-helpers.ts` | `getTargetMajorDraw()` — picks the active major draw for an action; calls transition service first. |
| `major-draw-transition-service.ts` | The single authority for `queued → active → frozen → completed` transitions. Idempotent, debounced, never-throws. |
| `major-draw-gate-http.ts` | HTTP-layer guard that blocks API actions on a frozen/completed draw. |
| `major-draw-strip-schedule.ts` | Strip-schedule helpers (visual schedule on the draw page) — _TODO: clarify exact role._ |
| `mini-draw-helpers.ts` | Mini-draw-equivalent of major-draw-helpers (target selection, eligibility). |
| `remove-draw-entries.ts` | Reverser used during refund processing — removes entries written by a successful payment. |

## Cross-domain helpers

| File | Purpose |
|---|---|
| [src/utils/giveaway-eligibility.ts](../../src/utils/giveaway-eligibility.ts) | Determines eligibility for any giveaway/draw (membership status, blacklist, etc). |
| [src/utils/winner-name-formatter.ts](../../src/utils/winner-name-formatter.ts) | Public-safe winner display formatting (first-name + last-initial). |
| [src/utils/winners.ts](../../src/utils/winners.ts) | Winner-selection / listing helpers. |
| [src/lib/purchaseCooldown.ts](../../src/lib/purchaseCooldown.ts) | Anti-spam: rapid-fire purchase throttling. |

## Transition service contract

```ts
interface TransitionResult {
  completed: number;   // count of draws transitioned
  activated: number;
  frozen: number;
  skipped: boolean;    // true if debounced
  error?: string;      // populated on failure (non-throwing)
}

// Three call sites:
// 1. /api/cron/major-draw-transition  (daily 1:30 UTC)
// 2. /api/stripe/webhook               (before payment processing)
// 3. major-draw-helpers.ts             (top of getTargetMajorDraw)
```

All ops use `updateMany` with `maxTimeMS: 5000` and idempotent filters.

## Cron jobs

`/api/cron/major-draw-transition` runs daily at 1:30 PM UTC. Beyond status transitions, it also:
- Resets Klaviyo segment metadata for new cycle
- Creates the next month's draw record
- Cleanup of stale/incomplete records

> _TODO: read the cron route handler and document its full set of side effects._

## Reverser integration

When a payment is refunded, [src/utils/draws/remove-draw-entries.ts](../../src/utils/draws/remove-draw-entries.ts) is called by the [payment](../payment/) reverser orchestration to undo `TicketEntry` rows written by the original grant. See [billing-stripe ledger symmetry](../billing-stripe/rules.md#ledger-symmetry).
