# Billing-Stripe — Gotchas

## Confirm-time card declines are THROWN by the SDK, not returned (2026-07-16)

With `confirm: true`, `stripe.paymentIntents.create` — and likewise `stripe.invoices.pay` and `stripe.subscriptions.update(payment_behavior: "error_if_incomplete")` — **reject with a `StripeCardError`** on an issuer decline instead of resolving with a failed intent. A branch that inspects `paymentIntent.last_payment_error` after `create()` resolves (both one-time-purchase routes have one) **never sees these declines** — they land in the catch block. Previously the generic catch-alls turned them into HTTP 500 with a generic message; production bug: `decline_code: invalid_account` → 500 "Failed to create one-time purchase".

**Fix:** the catch blocks in `create-one-time-purchase`, `create-one-time-purchase-existing-user`, `upgrade-subscription-payment`, and `renew-subscription` (inner `invoices.pay` catch, before the final `throw paymentError`) now detect card errors via [`isStripeCardError()`](../../src/utils/payment/stripe/payment-error-detection.ts) (matches the SDK class name `type === "StripeCardError"` or raw API `rawType === "card_error"`) and return the sibling 400 `Payment failed` shape used by `create-subscription-existing-user` — exact bodies per route in [api.md → Thrown card declines](./api.md#thrown-card-declines--400-payment-failed). Non-card Stripe errors (e.g. `StripeInvalidRequestError`) and non-Stripe errors keep their 500 behavior; `ErrorReport` auto-logging is unchanged (declines still logged, severity `medium` via the expected-decline classifier).

## Tier change on a scheduled-to-cancel sub MUST clear `cancel_at_period_end` (2026-07-06)

A member who is `cancel_at_period_end` (autoRenew off, still active) can still upgrade/downgrade. **Stripe API >
2018-02-28 does NOT auto-clear a pending cancellation when you swap items / change the anchor** — you must send
`cancel_at_period_end: false` explicitly. Both routes previously omitted it:

- **Upgrade** ([upgrade-subscription-payment/route.ts](../../src/app/api/stripe/upgrade-subscription-payment/route.ts)) — the DB (webhook pending-upgrade branch) set `autoRenew=true`, but Stripe still held `cancel_at_period_end=true`, so DB and Stripe diverged and a later `subscription.updated` flipped the DB back to cancelled.
- **Downgrade** ([downgrade-subscription/route.ts](../../src/app/api/stripe/downgrade-subscription/route.ts)) — worse: at period end Stripe fired `customer.subscription.deleted` **before** the downgraded price ever renewed, so the member was **dropped entirely** instead of continuing on the lower tier. This route has no dedicated webhook reconciliation, so it also sets `autoRenew=true` + clears `cancelledAt` in its own DB write.

**Fix:** both `stripe.subscriptions.update` calls now send `cancel_at_period_end: false`. Charge-safe — per Stripe's proration docs, `cancel_at_period_end` is not a proration-triggering param, so it spawns no invoice (distinct from the `trial_end`/anchor footgun in [PAST_DUE_REANCHOR](../PAST_DUE_REANCHOR.md)). The no-tier-change "just resume" path uses `PATCH /api/stripe/update-auto-renew {autoRenew:true}`.

## One-time purchase: gate the new-vs-existing branch on the LOWERCASED user lookup (2026-06-19)

`create-one-time-purchase` does two email lookups: `registeredUser` (line ~167, **lowercased** — `findOne({ email: userEmail.toLowerCase() })`) used everywhere in the route, and previously a redundant case-sensitive `existingUser` (`findOne({ email: userEmail })`). The new-vs-existing branch was gated on the **case-sensitive** one. Because emails are stored **lowercase** (`User` schema `lowercase: true`), a new user who typed their email with **any uppercase** missed that lookup → fell into the `accountCreationPending` (webhook-creates-the-account) branch → the client's one-time success handler (which only acts when `data.user` is present) did nothing → **user logged out / not redirected after a successful payment**, plus a duplicate-account risk.

**Fix:** gate on `registeredUser` (lowercased) and delete the redundant `existingUser` lookup. Safe by construction — `registeredUser` matches in every case the case-sensitive lookup did, plus the mixed-case cases it wrongly missed, so it can only convert a wrong "deferred" into the correct "existing-user + auto-login" path. The standard MembershipModal flow registers the user in step 1 (with `stripeCustomerId`), so once recognized it returns `user + autoLogin + paymentIntentId` and the client auto-logs-in. (The webhook account-creation path `account-manager.ts` remains the fallback for any genuinely-new email and is idempotent on the lowercased email.)

**Incident (found June 2026):** the SDK is pinned to `apiVersion: "2025-08-27.basil"` ([`src/lib/stripe.ts`](../../src/lib/stripe.ts)). Under [Basil](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end), `current_period_start`/`current_period_end` were **removed from the Subscription object and moved onto each Subscription Item** (`subscription.items.data[i].current_period_*`). Reading the root field returns `undefined` — **no throw, HTTP 200** — so `tsc` can't catch it (the routes even declared type-lie interfaces like `interface StripeSubscriptionWithPeriodEnd extends Stripe.Subscription { current_period_end: number }` that asserted the field exists).

Three routes were reading the dead root field:
- [`downgrade-subscription`](../../src/app/api/stripe/downgrade-subscription/route.ts) — **the harmful one.** `current_period_end` is persisted as `previousSubscription.endDate` (the "keep old benefits until" window). With `undefined` it fell back to `startDate + 30 days`. For anyone who downgraded **later than ~30 days into their cycle**, that date landed in the **past** → their benefit-preservation window was void and they lost the remainder of their paid higher-tier benefits. Prod audit (`scripts/audit-downgrade-period-end.ts`): **21/21 downgrades corrupted, 10 materially harmed.**
- [`update-auto-renew`](../../src/app/api/stripe/update-auto-renew/route.ts) and [`upgrade-subscription-payment`](../../src/app/api/stripe/upgrade-subscription-payment/route.ts) — display-only (`currentPeriodEnd`/`currentBillingDate`/`nextBillingDate` in the response). `new Date(undefined * 1000)` → `Invalid Date`. Not persisted, so cosmetic.

**Rule:** to get "when does this period start/end?", call [`getSubscriptionPeriodStart` / `getSubscriptionPeriodEnd`](../../src/utils/payment/stripe/subscription-period.ts) — they read the item-level value (earliest across items) and still support legacy shapes — and keep a fallback only for `undefined`. Never read `subscription.current_period_*` directly, and don't reintroduce a `…WithPeriod*` casting interface. Most siblings (`CancelSubscriptionService`, webhook handlers, `renew-subscription`, `create-subscription*`) already use the helper. Caveat: the item-level fallback needs `items.data` present — `retrieve`/`update` include the first page by default; `list` may need `expand`.

## No debug-agent `fetch` beacons in webhook / payment handlers

`handleInvoicePaymentFailed` ([`src/services/stripe-webhook-handlers/index.ts`](../../src/services/stripe-webhook-handlers/index.ts)) and `confirm-subscription-payment` ([route](../../src/app/api/stripe/confirm-subscription-payment/route.ts)) previously carried leftover automated-debugging artifacts: `// #region agent log` blocks doing `fetch('http://127.0.0.1:7242/ingest/…')` with `user.email` / `user._id` / invoice ids in the body. In prod the localhost target is unreachable (the call fails silently), but it is a needless per-event network call in the most sensitive handlers and leaks PII to anyone running that local ingest server. Removed. When removing such a block, watch for **real** code interleaved inside the region markers — the `confirm-subscription-payment` failure block declared `errorMessage` / `errorCode` / `errorType` / `declineCode` *inside* `#region agent log`, and those are load-bearing (used by the 3DS `requires_action` branch), so only the markers + the `fetch` were stripped, not the declarations.

## Expected payment-decline logs are `warn`, not `error`

`handlePaymentIntentFailed` ("Payment failed: …") and `handleInvoicePaymentFailed` ("Invoice payment failed: …") log the **receipt** of a decline event at `webhookLog("warn", …)`, not `"error"`. In prod, `webhookLog` only emits `level: "error"` (others early-return at `src/services/stripe-webhook-handlers/index.ts:90`), so these expected business events (customer card declines / renewal failures — high volume) stay out of the production error log, where they were drowning real handler exceptions. Genuine exceptions while *handling* a failure (the `catch` blocks — "Error handling invoice payment failed", "Error retrieving subscription") remain `error`. Don't downgrade those.

> **Before any change that mutates subscription billing timing** (`trial_end`, `billing_cycle_anchor`, `proration_behavior`, item swap, `pause_collection`) on an EXISTING subscription: Stripe can auto-spawn an extra `invoice.payment_succeeded` your webhook will try to grant on, and **idempotency-by-id will not stop it** (the spawned invoice has its own id). Classify intent before granting. Read the **pre-flight checklist** in `docs/PAST_DUE_REANCHOR.md` ("Billing-timing footgun — read this BEFORE any anchor / trial / proration change"). The only classifier today is `isZeroAmountTrialUpdateInvoice` (`subscription_update`/$0 only).

## Stripe's $0 "Trial period" invoice double-grants entries — guard it

Setting `trial_end` on an **existing** subscription (the past-due reanchor, the `migrate-anchor-billing-24` migration, join-anchoring 25/26/27→24) makes Stripe **auto-create a separate $0 invoice** with `billing_reason="subscription_update"` and a "Trial period for X" line, and mark it **paid** (it's $0). That fires a second `invoice.payment_succeeded`.

`handleInvoicePaymentSucceeded` normalizes `subscription_update` to a renewal for entry math, so it was **granting membership entries again** for this $0 invoice — double-counting the real `subscription_cycle` renewal — and logging a spurious "Subscribed to X Membership Package" admin-activity row (the recent-activities feed labels any non-`subscription_cycle` membership grant as "Subscribed"). 

Guard: `isZeroAmountTrialUpdateInvoice()` (`src/utils/billing/trial-invoice.ts`) — the webhook early-returns for these. It is narrow: a 100%-off renewal is `subscription_cycle` (still grants); a real upgrade proration is `subscription_update` with `total > 0` (still grants).

> **The guard is the SOLE line of defense.** Every idempotency layer (`PaymentEvent {paymentIntentId,eventType}` unique index, `processedPayments`, `ProcessedStripeEvent`) keys on the per-invoice / per-event id, and the $0 trial invoice carries its OWN distinct id + event — so nothing else catches this double-grant if the guard regresses. Two tests defend it: `test:trial-invoice` (the pure predicate) and `test:zero-trial-guard` (webhook-level — proves `handleInvoicePaymentSucceeded` actually honors the guard; the predicate test can't detect a handler that stops calling it). Keep BOTH green. Audit: `npm run find:duplicate-trial-entry-grants`. Remediate already-granted dups: `npm run reverse:duplicate-trial-entry-grants:dry` (dry-run; add `--apply` to write) — reverses only **clean** dups (scoped `removeMajorDrawEntries` + `accumulatedEntries −data.entries` + `lastMonthAccumulatedEntries` SET to the real sibling renewal's value when latest-cycle), writes a `BenefitsReversed` marker first as an atomic idempotency claim, and FLAGS anomalous/standalone grants for manual review. See `docs/PAST_DUE_REANCHOR.md`.

## Reactivation is SAME-TIER ONLY (no proration tier-swap)

`POST /api/stripe/renew-subscription` resolves `renewalStrategy: "reactivate"` for a cancelled-but-in-grace member (`cancel_at_period_end`/`canceled`, within a 30-day window). That branch **only clears `cancel_at_period_end`** — no charge, no proration. It used to do a `proration_behavior:"create_prorations"` item-swap when a *different* `packageId` was sent; that auto-charges a positive proration whose `subscription_update` (`total>0`) invoice the webhook then grants a **full renewal-sized entry batch** for (off the *old* package metadata), even though the route returns `grantEntryRewardToast:false`. Removed. A differing `packageId` on reactivate is now rejected (`REACTIVATE_TIER_CHANGE_NOT_ALLOWED`, 400).

**Model:** a cancelled member changes tier by **reactivating first, then** using the normal flows — **upgrade** (`/api/stripe/upgrade-subscription-payment`: immediate, full new-tier price, `proration_behavior:"none"` + `billing_cycle_anchor:"now"`, staged via `pendingChange`) or **downgrade** (`/api/stripe/downgrade-subscription`: `proration_behavior:"none"` + `billing_cycle_anchor:"unchanged"`, takes effect at period end via `previousSubscription`). The reactivate UI only ever sends the member's *current* `packageId`, so this was latent, not a live production bug. See `docs/PAST_DUE_REANCHOR.md`.

> The Reactivate button's *visibility* is gated on the DB heuristic `!autoRenew && isActive` (not live Stripe `cancel_at_period_end`), so it's looser than backend reactivate eligibility — a known edge (admin-set `autoRenew=false` / flag drift can show it for a non-scheduled-cancellation member and click → `create_new` full charge). See `docs/subscription/gotchas.md` → "Reactivate button gating is looser than backend reactivate eligibility".

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

### Retention pause keeps Stripe `active` while the app owns `paused`

The 30-day `pause_30d` retention offer (`RetentionPauseService`) applies `pause_collection: { behavior: "void", resumes_at }` + `metadata.pauseReason: "retention"`. **Stripe leaves the subscription's own `status` as `"active"` throughout a `pause_collection`** — it never emits a `"paused"` status on the object. So the app owns a **DB-only** `paused` state (`User.subscription.status = "paused"` + `isActive = false` across `[pausedFrom, pausedUntil)`), and the webhook must be careful not to let Stripe's still-`active` payload overwrite it:

- **`handleSubscriptionUpdated`** sets `paused` only for a retention pause whose freeze window has begun (`now >= pausedFrom`) — via the pure `decidePauseTransition(...)` in `pauseCollectionPolicy.ts`, **shared with the retention cron** so the two can't drift (unit-tested: `npm run test:pause-transition`) — and its else-branch active-restore is guarded **`prevSubStatus !== "paused"`** so a routine `customer.subscription.updated` (which still says `status:"active"`) cannot un-freeze the member mid-window.
- **`handleInvoicePaymentSucceeded`** restores `paused → active` and clears `pausedFrom`/`pausedUntil` when a paid invoice arrives while the DB status is `paused` — this is the resume charge (at `pausedUntil`, or an early `resumeRetentionPause`). Because the void pause discards every other invoice, a paid invoice in the paused state can only be the resume, so benefits come back only after a successful payment; a failed resume stays `past_due`.
- **Do NOT** trust `subscription.status` to tell you a member is paused — check `metadata.pauseReason === "retention"` + the DB pause window. Full flow + the flip/backstop split: [subscription/backend.md → RetentionPauseService](../subscription/backend.md#retention-pause-the-paused-membership-state) and [subscription/gotchas.md](../subscription/gotchas.md#retention-pause--the-app-owns-the-paused-state-stripe-stays-active).

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

The webhook auto-allowlist handler runs only on **new** `payment_intent.payment_failed` events. Cards that were Stripe-auto-blocked **before** the webhook was wired live have a `BlockedTransaction` row (after the Phase B backfill) but **no** corresponding `AllowlistAction` — and therefore are not in Stripe's `card_fingerprint_allowlist` list. Historically, "Charge Past Due Customers" ran against those cards and hit a wall of blocked-failure decline fees.

**This is now automated.** [`src/services/allowlist/reconcileAllowlistFromBlocked.ts`](../../src/services/allowlist/reconcileAllowlistFromBlocked.ts) is the reusable sweep both the manual script and the charge job now share. It aggregates `BlockedTransaction` for a scope down to one `EvalInput` per unique card fingerprint (freshest block wins) and calls `AllowlistService.apply(input, "admin_bulk", performedByUserId, false)` per fingerprint — same eligibility gate as always (paying member, no fraud-signal, no permanent-issue decline code), `allowOverride: false`. It's idempotent: `isAllowlisted()` short-circuits already-allowlisted fingerprints before any Stripe/Mongo write. Scope is either `{ kind: "customers", stripeCustomerIds }` (used by the charge job — see below) or `{ kind: "window", since?, limit? }` (used by the standalone script). Returns a `ReconcileSummary = { evaluated, added, alreadyAllowlisted, skipped: { fraud, permanent, notMember }, errored }`.

`startChargePastDueJob` (`src/server/admin/chargePastDueJob.ts`) now runs this sweep as **Phase 0** — scoped to `{ kind: "customers", stripeCustomerIds }` for exactly the run's own worklist customers — right after the worklist snapshot and before any chunk charges. It's best-effort (its own try/catch, `console.error` on failure, never aborts the run or touches the `ChargeJobLock`) and returns the `ReconcileSummary` as `allowlist` on the `start` response; `ChargePastDueModal` surfaces it ("Allowlisted N previously-blocked cards before charging"). See [docs/admin/backend.md](../admin/backend.md) for the charge-job side. **No cron was added** — Phase 0 only fires when an admin kicks off a bulk charge run.

[scripts/sync-allowlist-from-blocked-transactions.ts](../../scripts/sync-allowlist-from-blocked-transactions.ts) now delegates to the same `reconcileAllowlistFromBlocked({ kind: "window", ... })` — its own behavior is unchanged (verified: prod dry-run eligibility buckets identical pre/post-refactor). It remains the **one-time, full-history catch-up** tool for deep backlog (e.g. after a `backfill-blocked-transactions` run), independent of any charge run — Phase 0 only ever sweeps the customers in the run's own worklist, not the full collection.

Idempotent on the *added* path: pre-checks `AllowlistAction`/Stripe (`isAllowlisted`) for an active `added` row per fingerprint and short-circuits if found. Re-runs against already-allowlisted cards make zero Stripe calls and zero Mongo inserts. **Re-runs against previously-*skipped* fingerprints will re-evaluate** (which is intentional — a customer who wasn't a paying member at first-skip time may have since paid, flipping them eligible) and insert a fresh `skipped` row each time. Acceptable for occasional re-runs; don't loop the script.

```
npm run sync:allowlist-from-blocked:dry                    # eyeball the eligibility breakdown
npm run sync:allowlist-from-blocked                        # live: writes to Stripe Radar + Mongo
npm run sync:allowlist-from-blocked -- --no-limit          # if your account exceeds 1000 unique blocked fingerprints
```

Once the script (or Phase 0) runs, the live webhook handles all subsequent blocks. Phase D's reconciliation cron is the recurring safety net (see below).

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

## `handleInvoicePaymentFailed` stamps `dunning_recovery` for channel-independent reanchor detection

When a `subscription_cycle` invoice fails (the `isRenewal` branch in `handleInvoicePaymentFailed`, `src/services/stripe-webhook-handlers/index.ts`), the handler stamps `metadata.dunning_recovery = '1'` on the Stripe invoice object. This marker persists on the invoice regardless of what happens next — DB status flips, `pause_collection` clears, or the user retries via any channel.

`handleInvoicePaymentSucceeded` reads this marker in `shouldReanchorAfterRecovery` (`src/services/subscription/pauseCollectionPolicy.ts`) as one of the OR-signals for dunning detection. It is the **only** signal that survives the `renew-subscription` retry channel, which pre-flips the DB status to `active` AND clears `pause_collection` before the success webhook fires — making the other two signals (`previousSubscriptionDbStatus ∈ {past_due, unpaid}` and `pauseCollectionPresentAtPayment`) both false at webhook time.

Key facts verified by live Stripe test-mode probe:
- A single-failure manual recovery under `pause_collection` has `attempt_count === 1` (Stripe does not auto-retry while paused, so the counter never increments). `attempt_count > 1` is therefore a weak/secondary signal only.
- The `dunning_recovery` marker is set on the invoice at failure time and is not altered by subsequent payment success, subscription update, or pause-resume calls.

See `docs/PAST_DUE_REANCHOR.md` for the full trigger-gate logic and recovery-channel analysis.

## Stranded-member re-bill failure fires "Renewal Failed", not "Payment Failed" (Klaviyo)

A stranded-member RE-BILL — the mint (`mintCurrentCycleInvoice`, `billing_cycle_anchor: 'now'`) that re-charges a past-due/unpaid member — fails with `billing_reason: "subscription_update"`, **not** `subscription_cycle`. Left unclassified it drops into the generic `else` and fires the wrong Klaviyo event ("Subscription Payment Failed") instead of the dunning "Subscription Renewal Failed". `handleInvoicePaymentFailed` (`src/services/stripe-webhook-handlers/index.ts`) classifies it:

```ts
const isRebill =
  billingReason === "subscription_update" &&
  (prevSubStatus === "past_due" || prevSubStatus === "unpaid");
```

The Klaviyo branch reads `if (isRenewal || isRebill)`, so a re-bill lands in the same **"Subscription Renewal Failed"** (dunning) flow as a true `subscription_cycle` renewal.

**Why the signal is reliable:** a member upgrade is also `subscription_update`, but upgrades are **blocked while past_due** — so a `subscription_update` failure from a `past_due`/`unpaid` member is a re-bill, never an upgrade.

**`isRebill` deliberately does NOT set `isRenewal`.** It only redirects the Klaviyo event; it never enters the `else if (isRenewal)` DB-status branch, so it neither calls `pauseAfterRenewalFailure` nor stamps `dunning_recovery` (both gated on `isRenewal` alone). The member stays **unpaused / in dunning** — intentional per the past-due notification design (the admin / recovery / bulk / member-resolve paths all converge on this same event).

## `handleInvoiceCreated` is dormant until `invoice.created` is enabled on the Stripe endpoint

The renewal draft-stamp handler `handleInvoiceCreated` (`src/services/stripe-webhook-handlers/index.ts`) is wired into the dispatch switch (`case "invoice.created"`, right before `invoice.finalized`), but **the Stripe webhook endpoint is not currently subscribed to the `invoice.created` event** in the Stripe Dashboard. Until that event is added to the endpoint's enabled-events list, the handler never runs and **failed** renewals keep showing the bare join-time label (e.g. `"Tradie"`) in the Stripe payments list; successful renewals are still relabeled by the `handleInvoicePaymentSucceeded` fallback.

To activate: add `invoice.created` to the webhook endpoint's events in the Stripe Dashboard (and to your Stripe CLI `--events` list when testing locally). No code change is needed — the handler is already deployed.

The handler is **non-blocking** by design (a `stripe.invoices.update` failure is logged via `webhookLog`, never thrown — the description is purely cosmetic) and **idempotent** across redeliveries (writes only when the existing description differs). It is **strictly gated to `billing_reason === "subscription_cycle"`**, so even once enabled it never touches the join charge (`subscription_create`), upgrade/downgrade invoices (`subscription_update`), or the $0 trial-update invoice (see the [trial-invoice gotcha](#stripes-0-trial-period-invoice-double-grants-entries--guard-it) above).

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

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## Stripe.js loads via `@stripe/stripe-js/pure` only (2026-07-19)

`src/lib/stripe-client.ts` imports `loadStripe` from the `/pure` entry — the DEFAULT `@stripe/stripe-js` entry injects https://js.stripe.com on mere import, which shipped Stripe to 100 % of guests when the modal chunk evaluated. Import `loadStripe` nowhere else (lint: `internal-norm/no-eager-stripe`); call `getStripePromise()` lazily inside components/handlers. Note: with `/pure`, Stripe's fraud-signal collection starts at first `getStripePromise()` call (payment-surface mount) instead of page load — intended.
