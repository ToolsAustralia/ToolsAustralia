# Admin — Gotchas

## Admin sign-out must clear support-chat client storage (2026-06-24)

`AdminSidebar.tsx` `handleSignOut` now calls `clearSupportChatStorage()` before `signOut()` per the org rule: per-user localStorage must be wiped at sign-out to prevent chat `conversationId` from leaking to the next user on a shared device.

## Affiliate "Set Password" reuses the existing PUT route (2026-06-19)

The affiliate detail modal ([`AffiliateDetailModal.tsx`](../../src/components/admin/AffiliateDetailModal.tsx)) has a dedicated **Set Password** footer button + nested modal, mirroring the user modal's "Set Password" (`UserDetailModal`). It does **not** add a new endpoint — it `PUT`s `{ password }` to the existing `PUT /api/admin/affiliate/[id]` (the edit form's Password field uses the same route). Both are gated by `affiliates.edit`. A 6-char minimum is enforced **server-side** in the route (client validation is bypassable). The affiliate is not emailed — this is the direct-set analog of the user `admin_set_password` action (affiliates have no reset-email flow; they sign in with username + password at the portal).

## Never surface `trialing` as a subscription status in admin

`SubscriptionHistoryStatusBadge` ([`AdminBadge.tsx`](../../src/components/admin/ui/AdminBadge.tsx)) renders a membership-history row's `status` raw, so a `trialing` row would literally show "trialing". We never sell a real free trial — `trialing` only ever means a paid, **active** member whose billing date was anchored/reanchored via Stripe `trial_end` (join-25-27→24 and the past-due reanchor). The badge maps `trialing → "active"`; the current-state badge (`renderSubscriptionStateBadge`) already shows "Active" via `isActive`. Do not render the raw `trialing` string anywhere admin-facing. See `docs/PAST_DUE_REANCHOR.md`.

## Ad-spend snapshots: a failed Facebook fetch PRESERVES the prior value (never wipes)

The dashboard ad-spend / ROAS / CAC numbers come from `DashboardStatsDailySnapshot` rows written by [`DashboardStatsSnapshotWriter`](../../src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts) (daily cron + backfill). Each day's Facebook spend is fetched live via [`facebookAdChannelProvider`](../../src/services/admin/dashboard-stats/adChannelProviders.ts).

**Why it matters:** the snapshot cron rewrites a **90-day sliding window** every run ([`SLIDING_WINDOW_DAYS = 90`](../../src/app/api/cron/dashboard-stats-daily-snapshot/route.ts), at 14:00 & 15:00 UTC). Before this guard, the writer did `if (metrics) adChannelsMap.set(...)` then `$set` the **whole** `adChannels` map — so a failed fetch omitted Facebook and the `$set` wiped it. On **2026-06-11** the marketing token expired ~26 min before the 15:00 UTC run; that single run silently zeroed Facebook spend for the entire trailing 90 days (~$283k). See [tracking/gotchas.md](../tracking/gotchas.md) for the token side and the backfill repair.

**The guard (do not regress it):** `fetchForDay` returns a discriminated `AdChannelFetchResult`:
- `ok` → write the metrics,
- `empty` → legitimately no data (future day / zero spend) → write the channel as absent ($0),
- `error` → fetch FAILED (expired/invalid token, missing config, API/network error).

On any `error`, the writer loads the prior snapshot and calls the pure [`mergeAdChannels`](../../src/services/admin/dashboard-stats/adChannelProviders.ts) helper, which **preserves the prior stored value** instead of overwriting with nothing (and logs a loud `console.error`). So an expired token can never again wipe correct history — worst case a day's spend goes *stale*, not *zero*. Regression test: `npm run test:merge-ad-channels`.

When adding a new ad channel, return `error` (not `empty`) for any fetch failure or missing-config path, or you reintroduce the wipe. The live reader ([`DashboardStatsSnapshotReader`](../../src/services/admin/dashboard-stats/DashboardStatsSnapshotReader.ts)) treats `empty` and `error` identically (skip) because a live read is transient and has no prior to preserve.

## ClickableUserDisplay needs a dark-aware base text colour

[`ClickableUserDisplay`](../../src/components/admin/ClickableUserDisplay.tsx) (the clickable user name/email used across admin tables that opens the User Detail modal) treats a caller-supplied `className` as the **entire** typography token set (so a default `text-sm` isn't merged and Tailwind doesn't pick the wrong size winner). The side effect: callers passing a *size-only* className (e.g. `text-2xs sm:text-xs`) — or a light-only colour like `text-gray-900` — left the text with no `dark:` variant → **black text on the dark admin background**. Fix: the component now applies a `baseTextColor = "text-gray-900 dark:text-gray-100"` in the `cn()` base of both the button and span branches, and the subtext uses `text-gray-500 dark:text-gray-400`. `cn` is `twMerge`-based, so an explicit caller colour still wins for the same variant while the `dark:` fallback is preserved. When adding any always-on text colour, pair it with its `dark:` variant.

## "Edit Entries" never writes `entriesBySource.membership = totalEntries`

The admin major-draw participation form ([`src/components/admin/UserDetailModal.tsx`](../../src/components/admin/UserDetailModal.tsx) "Edit Entries" tab) sends only `{ drawId, totalEntries }` per row to [`syncMajorDrawParticipation`](../../src/features/admin/users/server/mutations.ts). The mutation **must not** force-set `entriesBySource.membership` to `participation.totalEntries` — the previous implementation did, and on every save it silently wiped the source breakdown.

Concrete failure (the Cody case): a refund left a user with `{ total: 800, membership: 0, upsell: 800 }`; an admin opened the user, pressed Save without changing anything, and the row became `{ total: 800, membership: 800, upsell: 800 }` (sum 1600 ≠ total 800).

Current behavior:
- **Existing entry**: only `totalEntries` and `lastUpdatedDate` are updated. The existing `entriesBySource` is preserved exactly.
- **New entry** (no previous row): initialized with `{ membership: totalEntries }` because that's the only signal the form gives us.

If a future workflow needs to adjust a per-source count, extend `majorDrawParticipationSchema` to accept a per-source payload before changing this code.

## Charge-past-due mutex is acquired atomically (no check-then-set race)

The bulk charge endpoint ([`src/app/api/admin/invoices/charge-past-due/route.ts`](../../src/app/api/admin/invoices/charge-past-due/route.ts)) guards against concurrent runs with the single-row `ChargeJobLock`. Acquisition is a **single atomic `findOneAndUpdate`** whose filter matches only an **unlocked or expired** lock (`$or: [{ isLocked: { $ne: true } }, { lockedUntil: { $lte: now } }]`) with `upsert: true`. If the row exists and is still held, the filter misses, the upsert tries to insert a duplicate `_id` → **E11000**, which is caught and returned as `409 Operation in progress`.

Do **not** revert this to the old `findById` → check `isLocked` → `create/save` shape: that is a TOCTOU race where two admins can each read "unlocked" and both acquire. The lock is **released** elsewhere via `ChargeJobLock.findByIdAndUpdate(..., { isLocked: false })` (job finalize, error path, orphan sweep) — those are independent of acquisition and unchanged. **The atomic lock is the ONLY concurrency guard on this endpoint**: the per-admin and global rate limiters that used to sit in front of it were removed in commit `45c759eb` (2026-02-27), so a lock regression here is not belt-and-braces — it is the whole defense. (Permission + the typed `CHARGE` confirmation still gate entry, but neither prevents two concurrent runs.)

## Middleware vs handler gating

Common mistake: assuming `/api/admin/**` is gated by middleware. NOT TRUE. Middleware excludes `/api`. Each handler must `requireAdmin(session)` itself.

Symptom: a missing `requireAdmin()` in a route handler doesn't fail in dev (you're logged in as admin); it only fails when a malicious user discovers the unprotected endpoint.

## Audit drift

If admin path doesn't write the audit row that user path writes, analytics drift between cancel actors. The shared-service pattern ([P4](./patterns.md#p4-shared-service-for-user--admin-paths)) prevents this.

## Past-due cancel race

Cancelling a past-due subscription always immediate-cancels (no period to preserve). Make sure the admin UI surfaces this — admin checks "cancel at period end," but the service ignores the option for past-due. The UI should warn / explain.

## Modal stacking in admin

Multiple admin modals (UserDetail + ChargePastDue + ErrorReport) can stack. Coordinate via `useModalPriorityStore`.

## Sanitised log echoes

If admin UI shows raw Stripe responses, card data leaks into screenshots / shared screens. Always sanitise before display.

## `invoices.pay()` does not guarantee the invoice is paid

`stripe.invoices.pay()` can return without throwing even when the PaymentIntent ends up in `requires_confirmation` — the charge is never attempted, `latest_charge` is `null`, and the invoice stays `open`. This happens especially when the invoice already had a PI from a prior finalization attempt (common in Force Charge and stranded-recovery flows).

**Never** check `paidInvoice.status === "paid"` on the response alone and log success. Instead:

1. After `invoices.pay()`, extract the PI id via `extractPaymentIntentId` and `stripe.paymentIntents.retrieve()`.
2. Call `decidePostPayAction(invoice, pi)` from `src/server/admin/chargePastDuePostPayPolicy.ts`.
3. If `needs_confirm`, call `stripe.paymentIntents.confirm({ off_session: true })`, re-fetch the invoice, and re-decide.
4. Only `decision.kind === "success"` should produce a `status: "success"` log row.

`payOpenInvoiceAsPastDueAdmin` in `chargePastDueShared.ts` implements this pattern. Any new code that calls `stripe.invoices.pay()` should follow the same pattern or delegate through that function.

## Subscription draft invoices CANNOT be deleted — finalize→void instead

`stripe.invoices.del(id)` throws `StripeInvalidRequestError: You can't delete invoices created by subscriptions` (HTTP 400) for any draft invoice that belongs to a subscription. Only standalone (non-subscription) drafts are deletable. The stranded-recovery superseded-draft cleanup (`recoverStrandedBulk.ts` step 4) originally called `invoices.del()` and every call failed in prod (the drafts it targets are always subscription drafts).

**The Stripe-supported disposal of a subscription draft is finalize → void** (a draft can't be voided directly — `voidInvoice` requires `open`/`uncollectible`). Recovery now does, per superseded draft:

```ts
await stripe.invoices.finalizeInvoice(draftId, { auto_advance: false }, { idempotencyKey });
await stripe.invoices.voidInvoice(draftId, undefined, { idempotencyKey });
```

`auto_advance: false` is critical — it guarantees Stripe never attempts a charge between finalize and void. (Held `pause_collection[behavior]=keep_as_draft` invoices already carry `auto_advance:false`; we set it explicitly anyway.) Voiding writes off the superseded cycle, exactly like voiding a stale open.

**Impact of the old bug was cosmetic, not a double-charge:** the `del` calls were best-effort (caught + logged), so recovery still finalized + paid the current draft. The superseded drafts just lingered as drafts — and because they keep `auto_advance:false` and unsetting `pause_collection` "only affects future invoices," they never auto-charge. Any drafts left behind by a pre-fix run are harmless clutter; a future recovery run on that member voids them.

## Stripe API 2025-04-01+ period field migration

`current_period_start` and `current_period_end` were removed from the Subscription root in Stripe API version `2025-04-01` (Basil). They now live on each `subscription.items.data[*]` instead.

**Affected function:** `checkForceChargeEligibility` in `src/server/admin/forceChargePastDue.ts`

The fix reads from `subscription.items.data[0]` first (new API) and falls back to the subscription root (old API). Any code that casts a subscription object and reads `.current_period_start` / `.current_period_end` directly will silently get `undefined` on the new API — guard against both locations.

For a shared helper that abstracts this, see `src/utils/payment/stripe/subscription-period.ts` (`getSubscriptionPeriodEnd`).

## Past-Due Charge History lists BOTH charge and recovery runs

The "Bulk Runs" table (and its summary succeeded-count + revenue) shows ALL `ChargeJobRun`s — both normal past-due **charge** runs (`kind: "charge"`) and stranded-invoice **recovery** runs (`kind: "recover"`). They used to be split (recovery hidden, surfaced only in the Recover Stranded panel), but a recovery run IS a bulk run: its `totals` share the same shape (`succeeded` = members recovered, `revenueCents` = amount collected), so they fold into one charge-performance view. Each row carries `kind` and the table badges **Recovery** vs **Charge**; `buildRunsFilter` ([`chargePastDueHistory.ts`](../../src/services/admin/chargePastDueHistory.ts)) no longer excludes `kind: "recover"`. **Lockstep:** the Norm mirror (`/v1/charge-past-due/runs[/{runId}]`) also exposes `kind` — keep the Zod schema (`src/lib/internal-norm/schemas/charge-past-due.ts`), the routes, the rebuilt manifest, and `docs/internal-norm/norm-context.md` in sync (a missing field is a runtime 500).

## Recover-Stranded runs in 30-member batches (Vercel 300s cap)

Each recoverable member makes ~5–7 **serial** Stripe round-trips (void stale opens, finalize+void superseded drafts, finalize the current draft, retrieve customer, pay, retrieve PI), so the whole `runStrandedRecovery` loop must fit Vercel's `maxDuration = 300`s. `MAX_LIMIT` is **30** (`DEFAULT_LIMIT = 20`) — larger batches timed out: at ~5s/member, 100 members blew past 300s, Vercel killed the process and returned an HTML error page, and the browser's bare `res.json()` threw `Unexpected token 'A'`. **A timeout leaves a partial run:** the `ChargeJobRun` stays `running` and the `ChargeJobLock` self-releases only after its 30-min TTL (the `finally` that releases it doesn't run on a hard kill), so an immediate re-click returns 409 — wait ~30s. The run is **idempotent** (a paid draft is no longer a draft, so recovered members drop from the next live scan; void/finalize/pay use Stripe idempotency keys), so drain a larger backlog by re-clicking Recover in 30-member batches. `RecoverStrandedPanel` now parses the response defensively (`res.text()` → `JSON.parse` in try/catch + `res.ok` guard) so a timeout shows a real message instead of the parser error.

**"Blocked (no draft)"** in the panel is the `BLOCKED_NO_DRAFT` classification — a past-due member whose old open invoices are dead but who has **no current-cycle draft** to finalize+pay, so there's nothing to rebill (the run skips them). It's an invoice-state label, NOT a card decline, NOT a Stripe Radar block, and has **zero** connection to the card allowlist. Remedy: wait for Stripe to cut the next-cycle draft (then they become recoverable), or cancel the sub. (Separately: a paying member's *soft* decline — `do_not_honor` / `insufficient_funds` / `transaction_not_allowed` — IS auto-allowlisted by the `payment_intent.payment_failed` webhook, but fraud/permanent codes like `lost_card` / `stolen_card` / `expired_card` are auto-skipped. Allowlisting bypasses Radar / issuer auto-block; it does not revive a genuinely dead card.)

## AEST date filters: `endDate` is **exclusive**, not inclusive

The past-due charge history endpoints (`/api/admin/charge-past-due/runs`, `/api/admin/charge-past-due/manual-retries`) interpret `YYYY-MM-DD` query strings as **Australia/Sydney calendar days**, not UTC dates. The two helpers in [`src/services/admin/chargePastDueHistory.ts`](../../src/services/admin/chargePastDueHistory.ts) drive this:

- `parseAestDayStartUtc("2026-05-06")` → UTC instant of `2026-05-06T00:00:00+10:00` (or `+11:00` in AEDT). Used as `$gte` (inclusive lower bound).
- `parseAestDayEndExclusiveUtc("2026-05-06")` → UTC instant of `2026-05-07T00:00:00` AEST. Used as **`$lt`** (exclusive upper bound), so the entire AEST `May 6` day is included regardless of DST transitions.

**The pitfall:** anyone copying this filter pattern into a new endpoint must also use `$lt` (not `$lte`) and the next-day-AEST instant — using `$lte` against `parseAestDayStartUtc(endDate)` silently excludes everything that happened *on* the end day. The Mongo filter builders in `chargePastDueHistory.ts` (`buildRunsFilter`, `buildManualRetriesFilter`) get this right; new admin date-range queries should reuse those helpers rather than reinvent date parsing.

## DrawSelect caps at 100 records

`useAdminMajorDrawsList` and `useAdminMiniDrawsList` request `limit=100`
from the admin history/list endpoints. If a user's draw participation
references an older draw that falls outside the most recent 100 records,
the `DrawSelect` trigger renders an amber warning with the last 4 chars
of the ObjectId ("Unknown draw …a3f2") rather than the draw name.

The card header falls back to `Major Draw {N}` / `Mini Draw {N}` in this
case. The form still saves correctly because the stored `drawId` is
untouched — only the visible label is degraded.

If this starts happening in normal admin flows (not just historical
archaeology), raise the cap or add server-side search to both endpoints.

## `errorCode` vs `declineCode` — prefer the specific one

Stripe surfaces two related fields on a card decline:

- `error.code` (persisted as `errorCode` on `InvoiceChargeLog`) — generic bucket like `card_declined`, `expired_card`, `incorrect_cvc`.
- `error.decline_code` (persisted as `declineCode`) — the specific reason inside the `card_declined` bucket: `do_not_honor`, `insufficient_funds`, `lost_card`, `stolen_card`, `pickup_card`, etc.

Most failed live attempts arrive with `errorCode === "card_declined"` and the actionable detail in `declineCode`. The `extractStripeErrorFields` helper in [`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts) extracts both, and all four `InvoiceChargeLog.create` save sites in `payOpenInvoiceAsPastDueAdmin` persist them. The `PostPayDecision.failed` variant in [`chargePastDuePostPayPolicy.ts`](../../src/server/admin/chargePastDuePostPayPolicy.ts) also carries an optional `declineCode` (sourced from `paymentIntent.last_payment_error?.decline_code` in the `requires_payment_method` branch).

**UI rule:** display `declineCode ?? errorCode ?? errorMessage`. Both `PastDueChargeHistory.tsx` and `PastDueChargeHistoryDrawer.tsx` follow this precedence; new admin views over `InvoiceChargeLog` should too.
