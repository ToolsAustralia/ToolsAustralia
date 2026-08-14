# Admin — Gotchas

## The Advertising card's "Yesterday" understated TikTok — a cron ORDERING bug (2026-08-11)

**Symptom:** the overview Advertising card showed TikTok ROAS·PLATFORM `0.10x` ($386.82 spend, $40.00 revenue) for AEST 2026-08-10, while TikTok Ads Manager showed `0.219` ($410.93 / $90.00). Days *before* that matched exactly.

**It was not the sync, and not a metric mismatch.** The stored `TikTokAdInsightsDaily` rows for that day are exactly right — $410.93 / $90.00 / 3 purchases / ROAS 0.2190, matching TikTok per ad set, and agreeing to 0.3% with TikTok's own `complete_payment_roas` (rounding). The derivation `value_per_complete_payment × complete_payment` is sound.

**The card reads the SNAPSHOT, not the insights.** `DashboardStatsService` builds the Advertising rows from `snapshotRead.adChannels`, and that snapshot for 2026-08-10 was written at 15:01 UTC — while `sync-tiktok-ads` does not complete that day until **02:45 UTC the following day**. TikTok keeps attributing conversions for hours after midnight (7-day-click / 1-day-view), so the snapshot froze a partial figure.

**Why it stayed invisible:** the snapshot writes a 90-day sliding window, so every older day gets re-derived on later runs and looks perfect. Only the *freshest* day — the one "Yesterday" points at, and the one people actually read — was ever wrong.

**Fix:** a third `dashboard-stats-daily-snapshot` fire at `20 3 * * *`, after `sync-tiktok-ads` (02:45 UTC). See [infrastructure/api.md](../infrastructure/api.md#apicronsync-tiktok-ads-2026-07-16--nightly-tiktok-ad-insights-sync) for the invariant.

**The general lesson:** any daily snapshot that captures a third-party ad platform must run *after* that platform's sync for the day it is recording — and a platform whose data arrives late will look correct in history while being wrong at the edge. When a spend/ROAS figure disagrees with the platform's UI, check the **snapshot's `updatedAt` against the insight rows' `syncedAt`** before suspecting the metric mapping.

## Auto-mounted admin widgets must permission-gate their fetches (2026-07-09)

A widget that fetches on mount through the shared `apiGet`/`apiRequest` wrapper (`src/lib/queries.ts`) against a `requirePermission(...)`-guarded route will fire a **guaranteed 403** for every staff role that lacks that permission — the Overview renders for anyone with `overview.view`, but its cards may need *other* permissions (e.g. `TopDrawsCard` → `/api/admin/mini-draw/list` → `miniDraws.view`). Until 2026-07-09 the wrapper treated 403 as an auth failure and **force-signed-out** the viewer, so an Ads Manager staffer was auto-logged-out seconds after every login. The wrapper is fixed (403 no longer signs out — see [client-state/gotchas.md](../client-state/gotchas.md)), but the rule stands: when adding a card/widget that auto-fetches a permission-guarded route, gate it with `usePermissions().has(<the route's permission>)` — disable the query and render a quiet no-access state instead of firing a request you know will 403. `TopDrawsCard.tsx` is the reference.

## "Cobber availability" pause toggle in the Chatbot tab (2026-07-08)

`ChatbotCostManagement.tsx` gained a **Cobber availability (Live / Paused)** control (the `Power` card, above Budget status). Paused = admin (DB) kill switch on → the chat bubble is hidden site-wide **and** the generative path is blocked server-side. It reads a **dedicated** `useChatbotSettings()` GET (`{ activeProvider, killSwitch, killSwitchEnvForced }`) and writes via `useSetChatKillSwitch()` (`PATCH /api/admin/chatbot-settings { killSwitch }`) — **not** the cost-analytics `config.killSwitch` (which is env-only and was retired from the old badge). When `killSwitchEnvForced` (the `CHAT_KILL_SWITCH` env break-glass is set), the toggle is locked with an amber note — env wins over the DB toggle. Only `overview.view` is required (same low bar as the provider switch). Full mechanics live in [docs/ai-chatbot/gotchas.md](../ai-chatbot/gotchas.md). Not mirrored to Norm (chatbot on/off config isn't useful to the external assistant).

**Location (2026-07-08):** this tab moved from the **Analytics** group ("Chatbot Cost", id `chatbot-cost`) to the **Team** group, below Norm — now **Admin → Team → Chatbot** (id `chatbot`, URL `/admin/chatbot`). The cost-analytics backend (`/api/admin/chatbot-cost`, `useChatbotCostAnalytics`, the `["admin","chatbot-cost"]` query key) kept its name — only the sidebar tab id/label moved. `overview.view` gate unchanged, so Chatbot can show under Team to a viewer who lacks `settings.view` (Staff/Roles/Norm hidden).

## Admin sign-out clears support-chat client storage via `totalSignOut` (2026-06-24, updated 2026-07-07)

`AdminSidebar.tsx` `handleSignOut` calls `totalSignOut()` ([`src/utils/auth/total-sign-out.ts`](../../src/utils/auth/total-sign-out.ts)). Its `clearUserScopedClientStorage()` wipes per-user localStorage **including support-chat history / `conversationId`**, which it clears by delegating to the chat module's own `clearSupportChatStorage()` (single source of truth for the chat key list). This satisfies the org rule (per-user storage wiped at sign-out so chat can't leak to the next user on a shared device) with one canonical helper instead of a per-call-site clear — the site `Header` and the settings page sign-out the same way.

## Activity-log feed used offset pagination over a live top-growing list → duplicate rows (2026-07)

The admin "Recent activity" feed (`ActivityCard`, subtitle "Live event stream") and the full `ActivityLogManagement` page rendered the **same user's signup/purchase twice**. The database had **no duplicates** (verified) — it was purely a pagination bug.

**Root cause:** `getActivityLog` ([`ActivityLogService.ts`](../../src/services/admin/ActivityLogService.ts)) used **numeric offset pagination** (`page` / `(page-1)*limit` slice) over a live, top-growing, time-sorted list. New site-wide activity inserted at the **top** between page fetches shifted every row **down**, so page N+1's offset re-included rows already shown on page N. The infinite-scroll client (`data.pages.flatMap(...)`) rendered both copies.

**Fix (don't regress):** offset was replaced with **keyset (cursor) pagination** on a deterministic `(timestamp DESC, id DESC)` total order:

- `getActivityLog` now takes `{ cursor?: string | null, limit, typeFilter?, searchTerm? }` — **no `page`**. It returns `pagination: { limit, total, nextCursor: string | null, hasMore }`. `total` (full filtered count) is kept; `page` / `totalPages` are **gone**.
- Two exported pure helpers do the work: `compareActivitiesNewestFirst(a, b)` (timestamp DESC, then id DESC) and `paginateActivitiesByCursor(sorted, cursor, limit)` → `{ rows, nextCursor, hasMore }`. Cursor format is `"<timestampMs>:<id>"`.
- **Keyset invariant:** because the boundary is the cursor's *position in the sort order* (not a numeric offset), paginating with a page's cursor returns the **same window even after newer rows are prepended** → consecutive pages can't overlap (no dup rows) nor gap.
- Route `GET /api/admin/activity-log` takes `cursor` (not `page`). The client hook `useActivityLogInfinite` threads `pagination.nextCursor` into `getNextPageParam`.

Fenced by `npm run test:activity-log-keyset` ([`src/services/admin/__tests__/activity-log-keyset.test.ts`](../../src/services/admin/__tests__/activity-log-keyset.test.ts)). **Distinct** from `getRecentActivities` (`dashboardSlices.ts`) — a separate, non-cursor legacy slice; do not conflate them. Any new feed built over a live, top-inserting list should keyset-paginate, never offset.

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

## Bulk charge is CHUNKED — don't charge inside the start request

The bulk charge endpoint ([`charge-past-due/route.ts`](../../src/app/api/admin/invoices/charge-past-due/route.ts)) no longer charges in one request. The legacy single-shot loop charged all ~800 invoices inline and overran Vercel's 300s cap — runs got killed mid-flight, stuck `running`, with money half-collected. The job is now split: `start` only snapshots the worklist (one Stripe list pass, **no charging**) into `ChargeJobWorklist`; the client then drives `chunk` requests (~30 invoices each, comfortably under 300s) until `done`. **Do not** add charging back into `start`, and don't size a chunk past `MAX_CHUNK_SIZE = 60`. (`start` does do one piece of non-charge work post-snapshot: a best-effort Phase 0 allowlist sweep — see [backend.md](./backend.md) and [billing-stripe/gotchas.md](../billing-stripe/gotchas.md#past-due-bulk-charge-hitting-blocked-card-failures-phase-b5-sweep) — which never charges Stripe and never blocks the run.)

Two consequences worth remembering:
- **Totals are recomputed from `InvoiceChargeLog` rows every chunk**, never from in-memory counters — so a tab close / crash / orphan-sweep abort still reports the real succeeded/failed/skipped/revenue, not 0/0/0. The orphan sweep (`sweepOrphanRuns`) and the standalone ops script `scripts/fix-stuck-charge-jobs.ts` ([infrastructure](../infrastructure/)) both recompute the same way before marking a stuck `running` run `aborted`.
- **Progress/resumability is derived from which worklist invoices already have a log row** for the run, so a killed chunk resumes from the unlogged remainder. Double-charge safety still comes from `payOpenInvoiceAsPastDueAdmin` (30s debounce, 6h recent-attempt lock) plus the **run-scoped** idempotency key `admin-charge-${invoiceId}-run-${runId}` — stable within a run (a resumed chunk re-touching an invoice dedupes to one charge) but fresh across runs. The chunk worker calls that primitive with the run-scoped key.

## Past-due charge keys MUST vary across runs — Stripe replays a stable key for 24h ($0 incident)

**Incident 2026-06-29:** a bulk charge run reported **668/668 "failed", $0 collected, 54s** — but Stripe showed **no actual charge attempts**. Root cause: the bulk path paid every invoice with a **static** `admin-charge-${invoiceId}` Stripe idempotency key. Stripe **retains an idempotency key for 24h and replays the cached response for any reuse within that window — without re-charging** (response header `idempotent-replayed: true`). The daily run lands <24h after the prior one, so **656/668** invoices replayed the previous run's decline. Confirmed three ways: the `idempotent-replayed: true` header on 656 rows, the invoice `attempt_count` staying at 1, and the success rate correlating exactly with whether the inter-run gap crossed 24h.

The aggravating factor: the DB "recently attempted" skip window is only **6h** (`RECENT_ATTEMPT_WINDOW_HOURS`), while Stripe's idempotency retention is **24h**. In the 6h–24h gap the code's own guard says "go ahead and charge" but Stripe silently replays — producing a misleading `failed` with no real attempt instead of a clean `skipped`.

**Fix (don't regress):** `payOpenInvoiceAsPastDueAdmin` now takes a **required** `idempotencyKey` — there is no stable default to fall into. Each caller scopes the key to its dedupe unit:
- Bulk daily run → `buildBulkChargeIdempotencyKey(invoiceId, runId)` (fresh each run, stable within a run for resume safety).
- Per-user "Charge" click → `buildOneOffChargeIdempotencyKey(invoiceId)` — bucketed to a 30s window (`admin-charge-${invoiceId}-once-${floor(now/30s)}`). A deliberate retry 30s+ later is a fresh attempt, but two **concurrent** submits of the same click (double-click / proxy retry) share the bucket so Stripe dedupes them to one charge. This path has **no ChargeJobLock** and the 30s DB debounce is non-atomic, so the bucketed key — not the debounce — is the real concurrent-double-charge guard. (Do **not** revert it to a per-request random token: that loses the concurrent dedupe.)
- Force Charge → `buildForceChargeIdempotencyKey(invoiceId, triggeredBy, attempt)` (per-attempt).
- Recovery pay step → `buildAdminChargeIdempotencyKey(newInvoiceId)` — the ONLY place a stable key is correct, because recovery pays a brand-new invoice each time.

Never reach for a bare `admin-charge-${invoiceId}` on a path that re-charges the **same** invoice across runs/clicks. Regression-guarded by `npm run test:past-due-idempotency-keys` (asserts the bulk key differs across runs). See [CHARGE_PAST_DUE_CUSTOMERS.md](../CHARGE_PAST_DUE_CUSTOMERS.md).

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

Each recoverable member makes ~5–7 **serial** Stripe round-trips (void stale opens, finalize+void superseded drafts, finalize the current draft, retrieve customer, pay, retrieve PI), so the whole `runStrandedRecovery` loop must fit Vercel's `maxDuration = 300`s. The route's `MAX_LIMIT` is **30** (`DEFAULT_LIMIT = 20`) — larger batches timed out: at ~5s/member, 100 members blew past 300s, Vercel killed the process and returned an HTML error page, and the browser's bare `res.json()` threw `Unexpected token 'A'`. **A timeout leaves a partial run:** the `ChargeJobRun` stays `running` and the `ChargeJobLock` self-releases only after its 30-min TTL (the `finally` that releases it doesn't run on a hard kill), so an immediate re-click returns 409 — wait ~30s. The run is **idempotent** (a paid draft is no longer a draft, so recovered members drop from the next live scan; void/finalize/pay use Stripe idempotency keys). `RecoverStrandedPanel` now **auto-loops** these 30-member batches client-side (no re-clicking — `MAX_ITERATIONS = 60` ceiling, stops when a batch attempts nothing or the admin clicks Stop) and parses each response defensively (`res.text()` → `JSON.parse` in try/catch + `res.ok` guard) so a timeout shows a real message instead of the parser error.

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

**UI rule:** display `declineCode ?? errorCode ?? errorMessage`. Both `PastDueChargeHistory.tsx` and `PastDueChargeHistoryDrawer.tsx` follow this precedence; new admin views over `InvoiceChargeLog` should too. For *counting* declines, do not re-implement the precedence — import `declineCodeOf` / `countsAsDecline` / `summariseDeclineRows` from [`src/utils/admin/chargeDeclineReasons.ts`](../../src/utils/admin/chargeDeclineReasons.ts) (see the next section for why).

## Persisted `ChargeJobRun.totals` may predate today's skip buckets — normalize on read

`noHeldDraft` and `awaitingRetry` were added to the skip breakdown on **2026-07-20**. Runs finalized before that have a `totals.skipped` subdocument with **no such keys**, and old runs are immutable history — they are never rewritten.

That was a live **500** on the Norm mirror: `NormChargePastDueRunsListSchema` declares both buckets as required `z.number()`, so a single legacy run anywhere on the page made `GET /v1/charge-past-due/runs` return `response_schema_invalid`. `tsc` cannot see it (the Mongoose type says the fields exist), and the admin UI never hit it because the drawer recomputes its skip breakdown client-side from the run's rows. Found by `npm run norm:smoke` on 2026-07-31, against a run from 2026-05-07.

**Rule: never hand a persisted `totals` straight to a consumer.** `listChargeRuns` and `getChargeRunDetail` both pass it through [`normalizeRunTotals`](../../src/server/admin/charge-past-due-totals.ts), which back-fills any missing field from `emptyTotals` (a missing bucket genuinely means zero). Normalizing at the read boundary beats migrating the collection. When you add a new bucket, add it to `emptyTotals` and `skipReasonToBucket` — `normalizeRunTotals` then covers every historical run for free. Regression-guarded by `npm run test:past-due-history`.

**And run `npm run norm:smoke` after touching anything a Norm route returns** — this class of bug is invisible to `tsc`, lint, and the unit tests. It needs a live server (`npm run dev`) plus `NORM_BEARER_TOKEN` / `NORM_SIGNING_SECRET` in `.env.local`. In Git Bash, prefix with `MSYS_NO_PATHCONV=1` or the leading `/api/...` path argument gets rewritten to a Windows path and the request never reaches the server.

## Counting declines: two views, one classifier, and the `newInvoiceId` discriminator

The run drawer and the server-side decline summary once each implemented the decline-code precedence separately, and drifted. Measured on the 28–31 Jul 2026 runs: the drawer reported **`unknown 206`** as the single largest "decline reason" on the 30 Jul run, while the server summary reported those same rows as **nothing at all**. Neither number was real.

The cause is that a bulk recovery writes **one run-tagged summary row** against the ORIGINAL worklist invoice id, carrying `result.recovery.bulk` and **no decline code**. Whether that row is the member's only record depends on the branch:

| Recovery branch | Coded pay row elsewhere? | Summary row has `newInvoiceId`? | Must be counted? |
|---|---|---|---|
| Held draft → finalize → pay | **Yes**, on the NEW invoice | Yes | **No** — counting both double-counts one member |
| `no_held_draft` → mint + re-bill | **No**, none exists anywhere | No | **Yes** — it IS the decline |

So **presence of `result.recovery.newInvoiceId` is the exact "does a coded twin exist?" test.** The old server filter excluded *every* `result.recovery.bulk` row, which correctly de-duped the first case but silently hid **237 real re-bill declines** ($8,440 of invoices) in the second. Both views now share [`chargeDeclineReasons.ts`](../../src/utils/admin/chargeDeclineReasons.ts): `countsAsDecline` for the client, `MONGO_DECLINE_MATCH` for the aggregation, with a test asserting the two agree on every recovery shape (`npm run test:past-due-history`).

Two consequences for anyone editing this area:

- **Never bucket by parsing `errorMessage`.** Codeless recovery outcomes now carry a *synthetic* `errorCode` written at save time — `rebill_not_settled` (minted cycle didn't settle — a real card decline Stripe gives us no code for) and `recovery_error` (unexpected throw in the recovery flow). Add new ones to `RECOVERY_DECLINE_CODES` + `RECOVERY_DECLINE_LABELS`, never to a regex.
- **Only set `newInvoiceId` on a summary row when a coded row genuinely exists on that invoice.** It is load-bearing for the count, not decoration — `summarizeBulkRecoveryOutcome`'s mid-flight branch deliberately omits it.

**Lockstep:** `getChargeRunDetail` projects `result.recovery.{bulk,step,newInvoiceId}` (provenance only — never the whole `result` blob, which holds the full sanitized Stripe error). The Norm mirror `/v1/charge-past-due/runs/{runId}` exposes the same `recovery` object so Norm doesn't inherit the double-count; keep the Zod schema, the route mapping, and `docs/internal-norm/norm-context.md` in sync.

## `payment_intent_unexpected_state` is a routing signal, not a card decline

`stripe.invoices.pay(id, { payment_method })` can reject with `payment_intent_unexpected_state` (HTTP 400, `stripe-should-retry: false`). **No charge reaches the issuer.** Over 28–31 Jul 2026 this happened **245 times** (1,950 all-time) and did not self-heal — 238 of the 245 members were still `past_due` afterwards.

What actually happens, verified against production Stripe:

1. The invoice is stranded (`status: open`, `attempt_count ≥ 1`, `next_payment_attempt: null`) and **is** recovery-eligible.
2. It is nonetheless routed to `pay`, because `decideBulkChargeAction` gate 4 sees a stale `invoice_payment` still reading `status: "open"` (its PaymentIntent had been sitting reusable for ~10 days).
3. `invoices.pay` **cancels that PaymentIntent while processing our request** and then rejects the `payment_method` update on it. The Stripe request id that returns our 400 is the same request that emits `payment_intent.canceled` — confirmed 17/17 on the 31 Jul cohort.
4. That cancellation flips the last `open` invoice_payment to `canceled`, so the **next day's** run finally routes the same invoice to `recover`. The correspondence was exact: **5→5, 209→209, 14→14** across three consecutive days.

**Inspecting PaymentIntent status before the call cannot prevent this** — the PI is live at classify time; our own call kills it. So the fix is post-hoc: `payOpenInvoiceAsPastDueAdmin` accepts `deferUnpayableToCaller`, and on this error with `next_payment_attempt == null` it returns `skipReason: "stranded_needs_recovery"` **without writing a log row**, letting the bulk job run `recoverWorklistItem` in the same run. Classification lives in the pure `classifyPayFailureRoute` (`chargePastDuePostPayPolicy.ts`, tested by `npm run test:charge-past-due-post-pay`).

Rules when touching this:

- **Only the bulk job sets `deferUnpayableToCaller`.** It must write exactly ONE run-tagged row per worklist item (the chunk loop's `remaining` and the run totals both key on it), so the pay attempt and the follow-up recovery can never both log. Every other caller keeps the historical `failed` row.
- **`next_payment_attempt != null` still means stand down**, not recover — Stripe owns the invoice and recovery would void one it is about to retry.
- This changes **when**, not **who**: these members reached recovery a day later regardless, so the re-anchoring population is unchanged.

## A platform that SPENT money with zero return used to vanish from the Advertising card (fixed 2026-07-29)

`DashboardStatsService` built `attributedRevenue` by skipping any platform whose attributed revenue, conversions and renewal revenue were all zero — **without checking ad spend**. So a channel that spent real money and returned nothing was dropped from the per-platform table entirely.

That produced a silent contradiction: the headline **Ad Spend KPI counted the spend** (it sums the `adChannels` map directly) while the **Advertising card omitted the row**, and `computeBlendedRoas` — which iterates `attributedRevenue` — lost that spend from its denominator too. The dashboard showed money spent in one place and no trace of it in another.

Caught on localhost, where the dev DB has ad spend but little attributed revenue: the headline read **$20,945.78** while the table listed only `direct`. It is not a dev-only bug — any production window where attribution has a gap (or a channel genuinely converts nothing) hits it, and **the worst-performing channel is exactly the one that disappears**.

The skip test now includes `spend > 0`. Pinned by `npm run test:advertising-card-model` ("spend-with-no-return still renders"). When adding a new reason a row should exist, extend that condition — never assume revenue implies presence.

## Sorting the mini-draw grid would have corrupted the lineup order (2026-08-13)

Caught while adding sort to `/admin/mini-draws`, and it applies to any drag-ordered
list that also offers filters.

`handleDragEnd` finds both indices in the **full** `miniDraws` array and
`handleSaveOrder` posts `miniDraws.map(_id)` — the whole lineup. The grid, however,
renders `filteredMiniDraws`. So the thing you drag and the thing you save are two
different arrays, and they only agree when the view is unfiltered and unsorted.

Sort by "Most entries", drag card A above card B, hit Save, and you write a
`displayOrder` derived from positions in the display-ordered array while looking at
an entry-ordered one — a scrambled customer-facing lineup, with no error and nothing
to undo it. (The same hazard already existed with search + status filters, just less
reachably.)

**The fix is to make the two arrays identical whenever reordering is possible**, not
to make the drag handler filter-aware:

- `filteredMiniDraws` returns unsorted rows whenever `isReorderMode` — so a sort
  picked *during* reorder can't take effect either.
- Entering reorder mode clears search, status, brand and sort, with a toast saying
  so. Resetting beats disabling the Reorder button: it is one click and there is
  nothing to undo.
- The sort/brand dropdowns are hidden entirely while reordering.

**General rule: a drag-to-reorder list must render exactly the array it writes.** If
a view can filter or sort it, reordering has to be gated on that view being the
identity view.
