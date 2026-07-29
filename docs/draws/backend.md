# Draws — Backend

## Helpers ([src/utils/draws/](../../src/utils/draws/))

| File | Purpose |
|---|---|
| `major-draw-helpers.ts` | `getTargetMajorDraw()` — picks the active major draw for an action; calls transition service first. |
| `major-draw-transition-service.ts` | The single authority for `queued → active → frozen → completed` transitions. Idempotent, debounced, never-throws. |
| `major-draw-gate-http.ts` | HTTP-layer guard `enforceMajorDrawOpenForNewPurchasesOr403`. Returns 403 `GATES_CLOSED` whenever no draw has `status: "active"` — covers the 8:00–8:30 PM freeze, the 8:30 PM → 12:00 AM gap, and any other moment without an active draw. Wired into six purchase endpoints: `/api/upsell/purchase`, `/api/stripe/create-payment-intent`, `/api/stripe/create-subscription[-existing-user]`, `/api/stripe/create-one-time-purchase[-existing-user]`, `/api/stripe/upgrade-subscription-payment`. See [rules R3a](./rules.md#r3a-new-entry-purchases-require-status-active--the-blackout-covers-freeze-and-gap). |
| `major-draw-strip-schedule.ts` | Strip-schedule helpers (visual schedule on the draw page) — _TODO: clarify exact role._ |
| `mini-draw-helpers.ts` | Mini-draw-equivalent of major-draw-helpers (target selection, eligibility). |
| `remove-draw-entries.ts` | Reverser used during refund processing — removes entries written by a successful payment. |
| `has-membership-grant-this-draw.ts` | `hasMembershipGrantInCurrentDrawPeriod(userId)` — see below. |

## `has-membership-grant-this-draw` helper

[src/utils/draws/has-membership-grant-this-draw.ts](../../src/utils/draws/has-membership-grant-this-draw.ts) exports a single async helper consumed by the subscription upgrade flow:

```ts
hasMembershipGrantInCurrentDrawPeriod(userId: Types.ObjectId | string): Promise<boolean>
```

**Procedure:** load the `MajorDraw` with `status === "active"`, locate the user's row in `draw.entries[]`, and return `(entry?.entriesBySource?.membership ?? 0) > 0`. Returns `false` when no draw is active (between draws) or when the user has no row yet.

**Failure mode:** fails open — any thrown error (DB outage, malformed cursor, etc.) is logged via `console.error` and the helper returns `false`. That defaults the caller to the more generous Mode A upgrade branch (see [subscription/rules.md R3a](../subscription/rules.md#r3a-upgrade-entries-stack-lastmonthaccumulated-unless-a-membership-grant-already-landed-this-draw)).

**Sole caller (today):** `handleInvoicePaymentSucceeded` in [src/services/stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts) — used only on the `isUpgrade` branch to pick between Mode A (stack `lastMonthAccumulated`) and Mode B (legacy `newBase × promo`) of `calculateUpgradeEntries`. See [billing-stripe/architecture.md](../billing-stripe/architecture.md#upgrade-entries--mode-a--mode-b) for the routing diagram.

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

## Winner notification email

`POST /api/major-draw/select-winner` (weighted random selection) sends a **SendGrid winner email to the winning member only** after the Winner doc is committed, alongside the existing Klaviyo `Major Draw Won` event. It calls `emailService.sendWinnerEmail(winner.email, { firstName, prizeName, winnersUrl })` (`prizeName` from `majorDraw.prize?.name`/draw name; the gold CTA is "See the Winners' Hall of Fame" → `winnersUrl` = `/winners`). Best-effort: wrapped in try/catch so a mail failure never fails the selection. The admin "record gov-app winner" path does the same — see [admin/backend.md](../admin/backend.md). Template + sender live in [email](../email/architecture.md).

## Resolved attribution metadata (mini-draw purchase)

[src/app/api/mini-draw/purchase/route.ts](../../src/app/api/mini-draw/purchase/route.ts) resolves attribution at the top of `POST` via `resolveAttributionAtEdge(request)` (from [src/services/attribution/resolveAtEdge.ts](../../src/services/attribution/resolveAtEdge.ts)) and passes the resulting `metadata` into both `handleOneClickPurchase` and `handlePaymentIntentCreation` as `resolvedAttrMetadata`. Each sub-handler spreads `...(resolvedAttrMetadata ?? {})` into its PaymentIntent metadata object alongside `buildAttributionMetadata(attribution)`. This ensures all mini-draw PaymentIntents carry resolved attribution regardless of payment path.

The same `POST` also builds `requestContext` as `{ ...extractRequestContext(request), ...extractTikTokContext(request) }` and both sub-handlers write the ad-platform click ids into PaymentIntent metadata: `capi_fbc`/`capi_fbp` (Meta) and `capi_ttclid`/`capi_ttp` (TikTok, added 2026-07-29). The Stripe webhook has no cookies, so this metadata is the only way the server-side Purchase event gets a click id — see [docs/tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md](../tracking/TIKTOK_EVENTS_API_IMPLEMENTATION.md). Both sub-handlers take `requestContext` as a positional param typed to include `ttclid`/`ttp`; keep the two in step if a third payment path is added.
