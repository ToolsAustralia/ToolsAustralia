# Billing-Stripe — Gotchas

## Charge past-due — runbook

(Migrated from former `docs/CHARGE_PAST_DUE_CUSTOMERS.md`.)

### Multi-layer protection on the bulk endpoint

`POST /api/admin/invoices/charge-past-due`:

1. Admin-only (`role === "admin"`)
2. Per-admin rate limit: 1 / 5 minutes (disabled in dev)
3. Global rate limit: 1 / 24 hours (prevents Stripe Radar spikes; disabled in dev)
4. Confirmation: must POST `{ "confirmation": "CHARGE" }` exactly
5. Optional global mutex: `ChargeJobLock` (auto-expiry 30 minutes)
6. Time-based DB idempotency: 24h since last `InvoiceChargeLog.attemptedAt` on the invoice — enforced inside [`payOpenInvoiceAsPastDueAdmin`](../../src/server/admin/chargePastDueShared.ts) so both the bulk and per-user (`POST /api/admin/users/[id]/charge-past-due`) routes inherit it. Skipped attempts write a `skipped` log row with `skipReason: "recently_attempted"`.
7. Stripe idempotency keys: `admin-charge-${invoiceId}` — passed as the third arg to `stripe.invoices.pay`. Stripe caches the response for 24h, which matches the DB window: by the time a legitimate next-day retry runs, both have cleared.
8. DB status verification: only invoices whose user has `subscription.status === "past_due"`

### Invoice filter — only charge if ALL true

- Stripe invoice status `"open"` OR `"past_due"`
- Collection method `"charge_automatically"`
- `amount_remaining > 0`
- `default_payment_method` set
- `finalized_at` exists
- Not already paid/uncollectible/void
- User's DB subscription status is `"past_due"`
- Not charged in last 24 hours

### Race condition — DB says past_due, Stripe says paid

Mark as `status: "skipped"`, `skipReason: "already_paid"`. **Don't** treat as failure. This is just DB/Stripe desync that the next webhook will reconcile.

### Permanent-failure error codes (set 24h `canRetryAt`)

- `authentication_required` (3DS)
- `card_declined`
- `expired_card`
- `generic_decline`

`insufficient_funds` is treated as a *temporary* skip — bulk retry skips it, but user-driven retry can still attempt.

### Batch processing tuning

- 15 invoices per batch
- 500ms delay between batches
- `Promise.allSettled()` so individual failures don't kill the batch
- Max 100 invoices per request (Stripe list limit)

### Run audit — drill-in UI

`/admin/past-due-history` shows every bulk run with its triggering admin, lifecycle status, and attempt totals. Clicking a run opens a drawer with per-invoice `InvoiceChargeLog` rows for that run. The **Manual Retries** tab alongside it lists all `InvoiceChargeLog` rows where `chargeRunId === null` (per-user retries). Data is backed by the `ChargeJobRun` collection (see [admin/models.md](../admin/models.md#chargejobrun)) and served by `src/services/admin/chargePastDueHistory.ts`.

### Late re-check — `no_longer_past_due`

`payOpenInvoiceAsPastDueAdmin` re-fetches `subscription.status` from the DB immediately before calling `stripe.invoices.pay`. If the status has flipped from `past_due` to `active` between list-time and charge-time (e.g. a concurrent Stripe webhook already settled the invoice), the attempt is skipped with `skipReason: "no_longer_past_due"` — avoiding a spurious Stripe call and a double-charge attempt. This skip is counted in `ChargeJobRun.totals.skippedBreakdown.noLongerPastDue`.

### Logs

`InvoiceChargeLog` has the full audit trail. Fields:
- ids: `invoiceId`, `customerId`, `userId`, `adminId`
- status: `success | failed | skipped`
- timing: `attemptedAt`, `canRetryAt`, `nextPaymentAttempt`
- payload: `result` (sanitised — no PAN, no full PM objects)

- linkage: `chargeRunId` (ObjectId, nullable) — set to the `ChargeJobRun._id` when the row was produced by a bulk run; `null` for per-user manual retries. Used by the audit UI's "Manual Retries" filter (`chargeRunId: null`).

Indexes: compound unique on `(invoiceId, attemptedAt-day)`; lookups by customer / admin / status / canRetryAt; sparse compound `(chargeRunId, attemptedAt-desc)` for run drill-in.

## Stranded past-due invoices — "this invoice can no longer be paid"

When Stripe's smart retries on a past-due invoice exhaust, the invoice transitions into one of three "open-but-dead" terminal states from the renewal pipeline's perspective:

- `status: "uncollectible"` (Stripe explicitly gave up), or
- `status: "void"` (manually voided, e.g. by a prior failed recovery), or
- `status: "open"` with `attempt_count >= 1 && next_payment_attempt == null` (no scheduled retry left).

In any of these states `stripe.invoices.pay()` rejects with "This invoice can no longer be paid." The only way forward is to void the dead invoice and finalize a fresh held draft on the same subscription (one is generated per missed cycle while `pause_collection: keep_as_draft` is in effect), then pay that.

The admin per-user "Charge past due" button auto-detects this state and routes through the void + re-bill flow. See [docs/admin/backend.md](../admin/backend.md#auto-recovery-wrapper-chargeorrecover) for the `chargeOrRecover` wrapper. The bulk cron job does NOT auto-recover (kept conservative to limit blast radius); admins drain the backlog from the Past-Due Charge History page's run-detail drawer (multi-select stranded rows → Recover Selected) after Phase 3 ships.

## Payment Element migration / confirmation method

(Migrated stub — _TODO: read `docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md` and `docs/SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md` and merge their content here in a refresh pass._)

Brief: the project migrated subscription checkout from confirmCardPayment-style flows to Stripe's Payment Element (single integration that handles cards + Apple Pay + Google Pay etc.). The migration affected `confirm-subscription-payment` and several create-subscription routes. Known fix: confirmation method must be set explicitly on the PI.

## Failed renewal — pay now flow

(Migrated stub — _TODO: read `docs/FAILED_RENEWAL_PAY_NOW.md` and merge here._)

Brief: `/api/stripe/renew-subscription` lets a user retry a failed renewal invoice. On success, `resumeAfterSuccessfulRenewalPayment()` runs — same code path as the webhook's success handler.

## Pause-collection orphans

See [subscription/gotchas.md](../subscription/gotchas.md#pause-collection-orphans) for the full failure modes. Summary: if a renewal succeeds but `resume` doesn't run, the sub stays paused, future cycles stay draft, no billing happens.

Audit: `npx tsx scripts/list-active-paused-subscriptions.ts --limit=200` (CSV to stdout, dry-run by default).

### Paid-invoice clear-pause decision is now centralized

The webhook handler's `shouldClearPauseForCollection` decision (in
`src/services/stripe-webhook-handlers/index.ts`, the paid-invoice path that runs
`resumeAfterSuccessfulRenewalPayment` before `processPaymentBenefits`) no longer
inlines the legacy `||` chain. It delegates the **entire** decision to
`decideClearPause(...)` from `@/services/subscription/pauseCollectionPolicy`
(single source of truth). `shouldClearPauseCollectionAfterPaidInvoice` is no
longer imported here directly — it is still invoked, but only via
`decideClearPause`.

Behavioral impact:

- **Recovery / regular renewal pauses: unchanged.** For any `pauseReason` that is
  not `"retention"` (including undefined), `decideClearPause` reproduces the old
  `shouldClearPauseCollectionAfterPaidInvoice(...) || recordMembershipRecurringAffiliate || subscription.pause_collection != null`
  result exactly. Past-due/unpaid recovery and `subscription_cycle`/
  `_threshold`/`_update` renewals still clear the pause and resume collection.
- **Retention pauses: never cleared by a paid invoice.** If
  `subscription.metadata.pauseReason === "retention"`, `decideClearPause`
  short-circuits to `false` before any legacy condition runs, so a retention
  `pause_30d` survives an incoming paid invoice instead of being silently
  resumed. See [subscription/cancellation-flow.md](../subscription/cancellation-flow.md#pause-collision-phase-3).

## Stripe metadata 500-char cap

Each Stripe metadata value is capped at 500 chars. Exceeding that on **any** key rejects the entire `subscriptions.create` / `paymentIntents.create` / `customers.update` call with `Metadata values can have up to 500 characters`, which surfaces to the user as a generic payment error and blocks checkout.

The most frequent offender is `capi_event_source_url` — Facebook ad referer URLs (long UTMs + `fbclid` + `_aem_` + `brid`) routinely run 500+ chars. All routes building Stripe metadata must run a referer through [`safeEventSourceUrl`](../../src/utils/tracking/event-source-url.ts) before storing it. See [tracking/gotchas.md](../tracking/gotchas.md#stripe-metadata-500-char-cap-on-capi_event_source_url).

If you add a new metadata key that holds user-supplied or URL-derived content, length-check or truncate at the boundary — don't trust upstream values.

## Don't `expand: ['latest_payment_intent']`

On Stripe API `2025-05-28.basil`, this returns:

> `This property cannot be expanded (latest_payment_intent)`

Use `expand: ['payment_intent']` instead.

## Disputes

`charge.dispute.closed` with `status: "lost"` reverses benefits as a full refund — same path as `charge.refunded`. `charge.dispute.funds_withdrawn` reverses provisionally; if the dispute is later won, no automatic re-grant — admin must replay manually via `POST /api/admin/users/[id]/payment-events/[eventId]/...` _TODO: verify exact admin endpoint_.

## Webhook retries

Stripe retries failed deliveries with exponential backoff. The dedupe via `ProcessedStripeEvent` is what makes retries safe. If the dedupe row gets stuck (e.g. crash *between* writing the row and finishing work), the next retry will see the row and skip — manual intervention needed to actually replay. _TODO: document the recovery procedure for that case._

## Stripe issuer-directed auto-block + allowlist override

**The mechanism.** When the issuing bank declines a card with certain hard codes (`lost_card`, `stolen_card`, `pickup_card`, etc.), Stripe **auto-blocks future attempts** on that card — globally, across the entire Stripe account — to prevent decline-fee waste. The Stripe dashboard's activity log surfaces this as *"directed Stripe to block future attempts."* No further attempts on that card will reach the issuer; they fail at Stripe.

**The override.** Adding the card fingerprint to Stripe's built-in `card_fingerprint_allowlist` Radar value list bypasses **both** Radar fraud rules **and** the issuer-directed auto-block. The dashboard's "Add to allow list" button uses this same API (`radar.valueListItems.create`). This is the only programmatic escape hatch. Aliases on built-in Radar lists follow Stripe's `<entity>_<field>_<allowlist|blocklist>` convention; verify per-account with `npm run find:radar-lists`.

**Webhook signal.** A blocked PI surfaces as `payment_intent.payment_failed` whose `charge.outcome.type === "blocked"` **or** `charge.outcome.network_status === "declined_by_network"`. This signal is what distinguishes "Stripe is blocking future attempts on this card" from a normal one-off decline. The `payment_intent.payment_failed` branch in the webhook examines `outcome` to decide whether to call `AllowlistService.evaluateAndApply()`.

**Best-effort branch.** The auto-allowlist call in our webhook is wrapped in `try/catch` and swallows errors via `webhookLog("error", ...)`. This is intentional: if we re-threw, Stripe would retry the entire `payment_intent.payment_failed` event and re-run the (already-completed) `handlePaymentFailure` handler — re-pausing the sub, re-firing analytics, re-sending Klaviyo events. The trade-off is that allowlist-call failures need to be recovered through the admin bulk page (`/admin/blocked-transactions`), which lists all blocked candidates regardless of whether the webhook attempt succeeded.

**Filter rules.** We **never** auto-allowlist cards whose decline_code is `lost_card`, `stolen_card`, `pickup_card`, or `fraudulent` (real fraud signals — allowlisting would expose us to chargebacks). We also skip permanent-issue codes — `expired_card`, `incorrect_cvc`, `invalid_account`, `invalid_number`, `invalid_expiry_year`, `invalid_expiry_month` — because allowlisting them is pointless without customer action (the issuer will keep declining; Account Updater doesn't help most of these). We **only** allowlist if the user has at least one prior succeeded `PaymentEvent` (i.e. is a paying member, not a fraudster). Skipped decisions still write an `AllowlistAction` row with `reason: "filter_fraud_signal"`, `"filter_permanent_issue"`, or `"filter_not_member"` for audit. Admin can override any filter via the **"Allowlist with override"** button on `/admin/blocked-transactions`, which calls `/api/admin/allowlist/apply` with `allowOverride: true` and records `reason: "manual_admin_override"`.

**Capture coverage (2026-05-07).** The webhook now listens to **both** `payment_intent.payment_failed` and `charge.failed`. The latter is the universal "any failed charge" event and catches issuer-blocked subscription renewals where the PI event sometimes does not fire. Only `payment_intent.payment_failed` triggers `AllowlistService.apply()` — the `charge.failed` branch is write-side-only — so we never double-record `AllowlistAction` rows. The reconcile cron is now self-healing (upserts missing rows on every run, 48h window) and `npm run investigate:blocked` is a read-only diagnostic that compares Stripe and Mongo for a date window. **Deployment requirement**: `charge.failed` must be enabled on the Stripe dashboard webhook subscription.

## Past-due bulk charge hitting blocked-card failures (Phase B.5 sweep)

The webhook auto-allowlist handler runs only on **new** `payment_intent.payment_failed` events. Cards that were Stripe-auto-blocked **before** the webhook was wired live have a `BlockedTransaction` row (after the Phase B backfill) but **no** corresponding `AllowlistAction` — and therefore are not in Stripe's `card_fingerprint_allowlist` list. Your "Charge Past Due Customers" runs against those cards and hits a wall of blocked-failure decline fees.

Fix: [scripts/sync-allowlist-from-blocked-transactions.ts](../../scripts/sync-allowlist-from-blocked-transactions.ts). For every unique card fingerprint in `BlockedTransaction`, calls `AllowlistService.apply(input, "admin_bulk", null)`. Eligible cards (paying members, no fraud-signal / no permanent-issue decline codes) get added to Stripe; ineligible ones get a recorded `skipped` `AllowlistAction` row — same outcome as if the webhook had fired originally.

Idempotent on the *added* path: the script pre-checks `AllowlistAction` for an active `added` row per fingerprint and short-circuits if found. Re-runs against already-allowlisted cards make zero Stripe calls and zero Mongo inserts. **Re-runs against previously-*skipped* fingerprints will re-evaluate** (which is intentional — a customer who wasn't a paying member at first-skip time may have since paid, flipping them eligible) and insert a fresh `skipped` row each time. Acceptable for occasional re-runs; don't loop the script.

```
npm run sync:allowlist-from-blocked:dry                    # eyeball the eligibility breakdown
npm run sync:allowlist-from-blocked                        # live: writes to Stripe Radar + Mongo
npm run sync:allowlist-from-blocked -- --no-limit          # if your account exceeds 1000 unique blocked fingerprints
```

This is a **one-time catch-up**, not a recurring job. Once it runs, the live webhook handles all subsequent blocks. Phase D's reconciliation cron is the recurring safety net (see below).

`maxNetworkRetries: 2` on the global Stripe client (`src/lib/stripe.ts`) handles transient blips and 429s during the script's pagination automatically.

**Phase A (write side) is in place.** The Stripe webhook now persists every blocked PI to the [BlockedTransaction](./models.md#blockedtransaction) collection (best-effort, in its own try/catch so a Mongo write failure does not block the allowlist call that follows). All new blocked PIs are captured automatically.

**Phase B (backfill) is in place.** [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) imports historical data from Stripe using the Search API (`status:"failed"` query). Idempotent on PI id. Run once with a wide window (e.g. 90 days) and verify Mongo count vs. Stripe count for the same window. Always dry-run first:

```
npm run backfill:blocked-transactions:dry -- --from=2026-02-01 --to=2026-05-01 --limit=2000
npm run backfill:blocked-transactions     -- --from=2026-02-01 --to=2026-05-01
```

**Phase C (read flip) is in place.** [`AllowlistService.listBlocked(filter, opts)`](./architecture.md#listblocked-mongo-backed-read-path) is the Mongo-backed read path: cursor-paged over `BlockedTransaction`, with eligibility joins batched into a serial `User.find` followed by parallel `AllowlistAction.find` + `PaymentEvent.distinct`. The verdict logic was extracted to a pure `computeEligibility(doc, maps)` helper for testability.

The route at `GET /api/admin/allowlist/blocked-cards` returns `{rows, nextCursor, total}` — see [api.md](./api.md#get-apiadminallowlistblocked-cards). The admin UI (`useBlockedCards` hook → `BlockedTransactionsManagement`) renders "Showing X of Y" + a Load-more button.

**Phase D (reconciliation cron) is in place.** [src/app/api/cron/reconcile-blocked-transactions/route.ts](../../src/app/api/cron/reconcile-blocked-transactions/route.ts) runs daily at 03:15 UTC and compares yesterday's `BlockedTransaction` row count against `stripe.charges.search` for `status:"failed"` charges with `outcome.type === "blocked"` in the same UTC window. Drift > 5% (via the exported `computeDriftRatio` helper) emits a `console.error` with the structured summary; OK runs emit a `console.log`. This is the ongoing safety net: if a future webhook regression silently drops blocked rows, the next day's reconcile alert flags it. Architecture detail: [architecture.md → Reconciliation cron — Phase D](./architecture.md#reconciliation-cron--phase-d).

**Phase E (legacy code removal) is complete.** The legacy `listBlockedFromStripe` code path, its `MAX_PAYMENT_INTENTS_SCANNED` cap, the route's `?source=` query param, and the route's `maxDuration: 60` setting have all been removed — `listBlocked` is now the only read path. Rollback if needed is via `git revert` of the Phase E commit (re-introducing the Stripe-pagination escape hatch is no longer a query-string flip).

## Resubscribe retires the stale pending incomplete sub

Before creating a new subscription, both `create-subscription` routes (`src/app/api/stripe/create-subscription/route.ts` and `create-subscription-existing-user/route.ts`) call `cancelIncompleteSubscriptionAndVoidInvoice(user.subscription.pendingStripeSubscriptionId)` after the resubscribe guard (non-fatal, skipped when the id matches `cancelPreviousSubscriptionId`). This cancels any stale `incomplete` checkout and voids its unpaid initial invoice so abandoned subs don't accumulate in Stripe or generate dunning emails later. The helper is idempotent and never throws — a failure is logged but does not block the new checkout. See [subscription/gotchas.md](../subscription/gotchas.md#list-status-trialing-leaks-incomplete-subs--false-existing-subscription-block) for the root-cause history and the `cleanup-abandoned-incomplete-subscriptions` backfill script for sweeping subs that pre-date this fix.

## Metadata drift locks customers out of checkout for 24h

Subscription create routes accept a client-supplied `subscriptionRequestId` UUID and use it as the Stripe idempotency key. The same call attaches request-derived metadata (`capi_client_ip`, `capi_user_agent`, `capi_fbc`, `capi_fbp`, `capi_event_source_url`, `attr_*`) which is rebuilt server-side on every call. If the customer retries with the same UUID and **any** of those values has drifted (mobile IP change, fbc rebuilt with different `Date.now()`, different referer), Stripe rejects with `StripeIdempotencyError` and locks the customer out of that key for 24h.

Mitigated by:
- [P10. One-shot idempotency-retry](./patterns.md#p10-one-shot-idempotency-retry-on-key-collisions) — catches the error, cancels the orphan, retries with a fresh key.
- `extractFBCFromRequest` reading `_fbc` cookie first ([docs/tracking/gotchas.md](../tracking/gotchas.md)) — eliminates the most common drift cause.

## 2026-05-15 504 storm — index DDL + self-call in the webhook path

**Root cause.** The async-queue cutover (commit `8031be29`) made the receiver
"thin" on paper but left `connectDB()` + `ensureIndexesOnce()` in the
*synchronous, pre-ack* path of `/api/stripe/webhook`. `ensureIndexesOnce()` was a
per-lambda-instance singleton wrapping `ensureCriticalIndexes()` — ~25–30
serialized Atlas admin/DDL operations (drop-redundant + create-unique +
ensure-index sweeps). On a warm instance it was a cached no-op, but the wrapper
re-ran the full DDL on every *cold* instance. A bulk-charge burst spun up many
cold lambdas at once, all racing the same Atlas admin commands; command latency
blew past the 60s `maxDuration`, so the receiver itself started returning **504**.
The 504s starved/saturated the deployment, and the receiver→worker HTTP
self-call (already patched once in `6bc91a0d` for the Vercel-challenge issue)
then `429`/`ECONNRESET`'d against the saturated deployment — so even enqueued
events never got processed.

**Fix (Tasks 1–6).** Index DDL moved entirely off the request path into the
`migrate:ensure-core-indexes` migration (`scripts/migrate-ensure-core-indexes.ts`,
must run before deploying receiver changes — it owns the dedup-layer-4 unique
index). `ensureIndexesOnce()` deleted. The `/api/stripe/process-event` worker
route and the HTTP self-call were deleted; processing now runs in-process via
`processQueuedEvent` (receiver `after()` / sweeper / admin Replay). Receiver is
now genuinely thin: `connectDB → verify → enqueue → after() → 200`. See
[STRIPE_WEBHOOK_QUEUE.md](./STRIPE_WEBHOOK_QUEUE.md).

## Error visibility in create-subscription routes

Both `POST /api/stripe/create-subscription` (guest/registration) and
`POST /api/stripe/create-subscription-existing-user` (session-authenticated) now
capture non-thrown early returns via `rejectAndLog` from
`@/utils/error-reporting/reject-and-log`.

**What is captured:**
- `409 EXISTING_SUBSCRIPTION` — the live-subscription gate (both routes; the primary motivating case)
- `409` from `checkCanCreateSubscription` when its body carries `code: EXISTING_SUBSCRIPTION`
- `500` "Stripe configuration missing" (missing `stripePriceId`)
- `503` "Payment setup is still in progress" (no `confirmation_secret` on `latest_invoice`)
- `400` "Payment failed" inside the `invoices.pay` try/catch when a Stripe error code is present (existing-user route only; the body uses `...(errorCode && { code: errorCode })`)
- `400` "Payment method setup failed" in the guest route's customer-attach branch, when `code: errorCode` is set — captured only when the code is present (codeless variant is skipped by the classifier)

**What is intentionally NOT captured:**
- `401 / 403 / 404 / 429` returns — routine auth/rate-limit signals, not actionable errors
- Genuinely codeless `4xx` returns (e.g. "Payment method not properly set up", "Invalid or inactive package") — no `code` field, so `classifyHttpRejection` skips them. (Note: returns that conditionally set `code` ARE wrapped — the classifier still skips them at runtime when the code is absent.)
- The `403` major-draw gate (`enforceMajorDrawOpenForNewPurchasesOr403`) — not a business error
- The entire top-level `catch` block in each route — thrown errors already auto-log via `ErrorLoggingService` / `autoLogPaymentErrorServer`; wrapping those would double-log

**No double-logging risk:** `rejectAndLog` is only on non-thrown paths; the `catch` blocks are untouched.

## A/B-test attribution on subscription invoices is initial-only

In `services/stripe-webhook-handlers/index.ts`, the `invoice.payment_succeeded`
path used to read `experimentId` / `variantId` from `subscription.metadata` for
every invoice. Because subscription metadata persists for the lifetime of the
subscription, every monthly renewal credited the original variant — inflating
the original experiment's "revenue" indefinitely, even months after it ended.

The fix gates the metadata pickup on
`expandedInvoice.billing_reason === "subscription_create"` (the initial
sign-up invoice). Renewals (`subscription_cycle`) and tier changes
(`subscription_update`) skip the A/B attribution but still grant benefits and
fire tracking normally. Same gate is applied when falling back to
`paymentIntent.metadata` in METHOD 2.

If you ever want LTV-by-variant analysis, do it as a separate query joining
the variant assignment to the user's whole subscription history — don't restore
the renewal-attribution path.

## Multi-experiment attribution collision in `create-one-time-purchase`

Both `create-one-time-purchase` and `create-one-time-purchase-existing-user`
fall back to reading `ta_ab_assignment_<expId>` cookies when no DB assignment
is found. The cookie loop iterates active experiments and breaks on first
match — historically with no priority rule, so a site-wide cosmetic experiment
(e.g. `__membership-theme__`) could claim purchase credit before a real
page-targeted promo experiment.

Both routes now sort experiments by `attributionRank` (exported from
`src/utils/ab-testing/get-user-experiment-assignment.ts`): page-targeted beats
wildcard `*`, and the membership-theme sentinel is excluded outright. Match
the priority rule there if you ever add another attribution code path.
