# Admin — Backend

## Server-only code

[src/server/admin/](../../src/server/admin/):
- `chargePastDueShared.ts` — shared logic for past-due charge retry (used by single + bulk endpoints). `payOpenInvoiceAsPastDueAdmin` enforces the 24h DB skip window via `InvoiceChargeLog` and passes a stable `idempotencyKey` to `stripe.invoices.pay` so a rapid double-submit returns Stripe's cached first response. See [billing-stripe/gotchas#multi-layer-protection-on-the-bulk-endpoint](../billing-stripe/gotchas.md#multi-layer-protection-on-the-bulk-endpoint).

  **`extractStripeErrorFields(err)` helper:** module-private helper near `sanitizeStripeResponse` that pulls `{ errorCode, declineCode, errorMessage }` off a `Stripe.errors.StripeError`. `decline_code` is Stripe's specific reason (`do_not_honor`, `insufficient_funds`, `lost_card`, etc.); `code` is the generic bucket (`card_declined`). Persisting both lets the UI prefer the specific one. All four `InvoiceChargeLog.create` save sites in `payOpenInvoiceAsPastDueAdmin` now persist `declineCode`: the outer Stripe-error catch (uses `extractStripeErrorFields` via spread), the PI-confirm catch (destructured), the "already paid" skip path (inline cast on the originating Stripe error), and the decision-based failed path (reads `decision.declineCode` from `PostPayDecision.failed`).

  **`chargeRunId` plumbing:** the bulk route (`POST /api/admin/invoices/charge-past-due`) creates a `ChargeJobRun` document at start and passes its `_id` as `chargeRunId` to every `payOpenInvoiceAsPastDueAdmin` call. The function writes that ObjectId onto every resulting `InvoiceChargeLog` row. The per-user route (`POST /api/admin/users/[id]/charge-past-due`) passes `null`, so manual retries are queryable with `chargeRunId: null`.

  **Late "still past-due?" re-check:** `payOpenInvoiceAsPastDueAdmin` calls `shouldSkipForNotPastDue` (from `past-due-charge-idempotency.ts`) immediately before `stripe.invoices.pay`. This re-fetches the user's current `subscription.status` from the DB; if it has flipped from `past_due` to `active` between list-time and call-time (e.g. a concurrent webhook settled the invoice), the attempt is skipped with `skipReason: "no_longer_past_due"` and the `ChargeJobRun` totals credit `skippedBreakdown.noLongerPastDue`.

  **Single-invoice scoping via `selectCurrentSubscriptionChargeable`:** both the per-user and bulk routes call this helper (also in `chargePastDueShared.ts`) after the standard eligibility filter. It uses `pickOpenInvoiceForFailedRenewal` (from `src/utils/payment/failed-invoice-selection.ts`) to pick the one open invoice attached to `user.stripeSubscriptionId`, returning it as `target` and all others as `skipped`. Callers push `skipped` invoices into `results` with `skipReason: "duplicate_or_stale_cycle_invoice"` so the audit log stays honest about what was seen vs charged. This prevents "This invoice can no longer be paid" Stripe errors that occur when `pause_collection` did not fire in time and a customer has accumulated multiple open cycle invoices — only the newest one on the current subscription is chargeable. If `stripeSubscriptionId` is null/empty, `target` is `null` and all invoices are returned as skipped. The GET (preview) handlers apply the same scoping and surface a `duplicateOrStaleCycle` counter in `filterStats`. **Stripe API 2025-04-01+ compatibility:** the subscription ID is read from `invoice.parent.subscription_details.subscription` first (new API shape), falling back to `invoice.subscription` (legacy shape). The canonical implementation lives in `chargePastDueSelectionPolicy.ts` (`resolveInvoiceSubId`). The same pattern is applied in `recoverStrandedPastDue.ts` (ownership check) and in `payOpenInvoiceAsPastDueAdmin` (resume-collection after successful payment).

### Auto-recovery wrapper (`chargeOrRecover`)

The per-user admin "Charge past due" route ([src/app/api/admin/users/[id]/charge-past-due/route.ts](../../src/app/api/admin/users/[id]/charge-past-due/route.ts)) wraps the pay primitive in `chargeOrRecover` ([src/server/admin/chargeOrRecover.ts](../../src/server/admin/chargeOrRecover.ts)), which picks the branch via the pure `chooseChargeAction` decision function ([src/server/admin/chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts)):

- **`'pay'`** — live `open` invoice with a scheduled retry; route to `payOpenInvoiceAsPastDueAdmin`.
- **`'recover'`** — invoice is `uncollectible`, `void`, or `open`-but-dead (`attempt_count >= 1 && next_payment_attempt == null`). Route to `recoverStrandedPastDueInvoice`.

When the recovery branch is taken the returned row carries `recovered: true` and `newInvoiceId: <in_…>`. The admin modal renders an amber "Recovered" badge.

Bulk cron job, Force Charge, and the per-invoice recover endpoint do NOT use `chargeOrRecover` — each keeps its existing primitive path.

### Manual-action lock bypass

`payOpenInvoiceAsPastDueAdmin` accepts `bypassRecentAttemptLock?: boolean`. When true, the default 1-per-window (6h) budget check is skipped via the pure `shouldSkipForRecentAttempt(rows, bypass)` predicate in [`past-due-charge-idempotency.ts`](../../src/server/admin/past-due-charge-idempotency.ts); the 30s spam debounce still fires. `recoverStrandedPastDueInvoice` and `checkRecoveryEligibility` accept the analogous `bypassRecentRecoveryLock?: boolean` (which skips the `hasRecentRecoveryAttempt` check and forwards as `bypassRecentAttemptLock: true` into the final inner pay call). All three admin-initiated routes (per-user charge-past-due POST, per-user recover-past-due-invoice POST/GET, bulk invoices/recover-past-due POST) pass `true`. Bulk cron job and Force Charge pass nothing (existing locks apply).

- `chargePastDuePostPayPolicy.ts` — **pure** helpers for deciding what to do after `stripe.invoices.pay()` returns. Extracted so the logic is unit-testable without `STRIPE_SECRET_KEY`. Exports:
  - `decidePostPayAction(invoice, paymentIntent)` — inspects the invoice's final `status` and the PI's `status` and returns a tagged-union `PostPayDecision`: `success`, `needs_confirm` (PI in `requires_confirmation`), `requires_authentication` (3DS), or `failed` with an `errorCode`/`errorMessage` pair plus an **optional `declineCode`** (Stripe's specific reason). The `requires_payment_method` branch surfaces `paymentIntent.last_payment_error?.decline_code` as `declineCode`. Other failure branches leave it `undefined`.
  - `extractPaymentIntentId(invoice)` — resolves the PI id from `invoice.payment_intent` regardless of whether it is a string id or an expanded `PaymentIntent` object.

  **Why this exists:** Stripe sometimes leaves the PaymentIntent in `requires_confirmation` after `invoices.pay()` — particularly when the invoice already had a PI from a prior finalization attempt (common in Force Charge flows). Without this check the original code logged `status: "success"` and returned `ok: true` even though no charge was attempted (`latest_charge: null`, no error). The fix: after `invoices.pay()`, always fetch the PI and call `decidePostPayAction`. If the decision is `needs_confirm`, `payOpenInvoiceAsPastDueAdmin` explicitly calls `stripe.paymentIntents.confirm({ off_session: true })` then re-fetches the invoice and re-decides on the final state. Only `decision.kind === "success"` produces a `status: "success"` log row. Tested by `npm run test:charge-past-due-post-pay`.

- `chargePastDueSelectionPolicy.ts` — **pure** helpers for invoice-to-subscription matching, extracted from `chargePastDueShared.ts` so they're unit-testable without `STRIPE_SECRET_KEY`. Exports:
  - `resolveInvoiceSubId(inv)` — resolves the subscription ID from a Stripe Invoice compatible with both legacy API (<2025-04-01, `invoice.subscription`) and the 2025-04-01+ shape (`invoice.parent.subscription_details.subscription`). Parent field takes precedence.
  - `selectCurrentSubscriptionChargeable(invoices, userStripeSubscriptionId)` — canonical implementation of the invoice filter (see `chargePastDueShared.ts` entry above for behaviour). `chargePastDueShared.ts` delegates to this.
  Tested by `src/server/admin/__tests__/chargePastDueSelectionPolicy.test.ts` (included in `npm run test:past-due-admin-charge`).
- `past-due-charge-idempotency.ts` — pure helpers (`RECENT_ATTEMPT_WINDOW_HOURS`, `cutoffForRecentAttempt`, `buildAdminChargeIdempotencyKey`, `shouldSkipForNotPastDue`) extracted to a Stripe-free module so they're unit-testable without `STRIPE_SECRET_KEY`. Tested by `src/server/admin/__tests__/chargePastDueShared.test.ts` (`npm run test:past-due-admin-charge`).
- `recoverStrandedPastDuePolicy.ts` — pure helpers for the "recover stranded past-due invoice" flow (no Stripe SDK / Mongo imports). Covers: stable idempotency keys for each recovery step (`buildRecoveryVoidIdempotencyKey`, `buildRecoveryCreateIdempotencyKey`, `buildRecoveryFinalizeIdempotencyKey`), eligibility check for the original invoice (`isOriginalInvoiceEligibleForRecovery` — eligible when `uncollectible` or `void`), held-draft picker (`pickHeldDraftForRecovery` — finds the newest matching-amount draft on the subscription), and a 24h lock predicate (`hasRecentRecoveryAttempt` — reuses `RECENT_ATTEMPT_WINDOW_HOURS` from `past-due-charge-idempotency.ts`). Tested by `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts` (`npm run test:recover-stranded-past-due-policy`).
- `forceChargePastDuePolicy.ts` — pure helpers for the Force Charge past-due flow (no Stripe SDK / Mongo imports). Exports: `buildForceChargeFinalizeIdempotencyKey(invoiceId)` — stable key for the finalize step; `pickForceChargeTarget(openInvoices, draftInvoices, expectedAmountCents)` — prefers an existing `open` invoice (charge_automatically, amount_remaining>0) then falls back to the newest matching-amount `draft`; returns `null` when neither fits so the caller blocks with `"no_chargeable_invoice"`. Never returns a candidate that would require creating a new invoice — manual invoices have `billing_reason: "manual"` which the webhook dispatch ladder does not handle. `isCurrentPeriodAlreadyPaid(paidInvoices, periodStart, periodEnd)` — double-billing guard based on Unix-second period overlap. `hasRecentSuccessfulChargeOnSubscription(rows, subscriptionId, now?)` — 24h success-lock predicate; reads `result.subscriptionId` from `InvoiceChargeLog` rows written by the orchestrator. Tested by `src/server/admin/__tests__/forceChargePastDuePolicy.test.ts` (`npm run test:force-charge-policy`).
- (other shared admin code)

## Stranded past-due invoice recovery

When Stripe's smart retries exhaust, the original past-due invoice transitions to `uncollectible` (or `void`). At that point both the bulk past-due charger and the per-user retry surface "This invoice can no longer be paid" because `stripe.invoices.pay()` rejects non-`open` invoices.

The recovery flow lives in [`src/server/admin/recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts) and runs the sequence:

1. Verify state — admin auth, user `subscription.status === "past_due"`, original invoice in `uncollectible`/`void`, customer/subscription ids match.
2. 24h lock — query `InvoiceChargeLog` for any prior recovery on the same original invoice via `hasRecentRecoveryAttempt` from [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts).
3. Void original (skipped if already `void`).
4. Find a held draft. Looks for an existing held draft (Stripe creates one per missed cycle while paused) matching the expected cycle amount. If none is found, the flow aborts with `reason: "no_held_draft"` and logs a `skipped` row — it does **not** create a new manual invoice because manual invoices have `billing_reason: "manual"` which the webhook dispatch ladder does not handle, breaking the renewal pipeline (no status flip, no entries, no Klaviyo event).
5. `stripe.invoices.finalizeInvoice()` — this is the same battle-tested path used in [`pay-failed-invoice/route.ts:150`](../../src/app/api/stripe/pay-failed-invoice/route.ts#L150) and [`invoice-payment-intent.ts:163`](../../src/utils/payment/stripe/invoice-payment-intent.ts#L163). Manual finalize bypasses `pause_collection: keep_as_draft`.
6. Delegate to `payOpenInvoiceAsPastDueAdmin` ([`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts)) for the actual charge — inherits its log row + idempotency key + `resumeAfterSuccessfulRenewalPayment` on success.

Pure helpers live in [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts) so they're testable without `STRIPE_SECRET_KEY`. Tests: `npm run test:recover-stranded-past-due-policy`.

### Idempotency model

| Step | Stripe key | DB lock |
|---|---|---|
| Void | `recover-void-${originalInvoiceId}` | — |
| Find draft (no create) | — | 24h via `result.recovery.originalInvoiceId` |
| Finalize | `recover-finalize-${newInvoiceId}` | — |
| Pay | `admin-charge-${newInvoiceId}` (existing) | 24h via `invoiceId` (existing) |

The 24h DB lock checks for any `InvoiceChargeLog` row tagged `result.recovery.originalInvoiceId === <id>`; the pay step's lock continues to work via the standard past-due window since the new invoice id is fresh.

### Failure semantics

Each step is naturally idempotent. If a step fails mid-sequence, the customer is no worse than before:

- Void fails → no state change
- No held draft → original voided, no invoice; `reason: "no_held_draft"` returned (admin must wait for Stripe to generate a cycle draft)
- Finalize fails → original voided, draft exists (admin retries; draft is still there)
- Pay fails → original voided, fresh `open` invoice (admin uses existing per-user retry)

## Force Charge for stuck-paused subscriptions

When `pause_collection: keep_as_draft` was applied (or the user has cancelled-and-resubscribed leaving orphan invoices), the user's current subscription may have no chargeable open invoice — only held drafts. Force Charge finalizes such a draft (or pays an existing open invoice) on the current subscription.

The orchestrator [`forceChargeCurrentCycle`](../../src/server/admin/forceChargePastDue.ts):

1. Verify state — admin (or self) auth, `subscription.status === "past_due"`, customer/sub ids present, package found, expected amount derived.
2. DB eligibility check — `hasRecentSuccessfulChargeOnSubscription` from [`forceChargePastDuePolicy.ts`](../../src/server/admin/forceChargePastDuePolicy.ts) (subscription-level 24h success lock; separate from per-invoice 6h budget window below).
3. Stripe paid-period check — `isCurrentPeriodAlreadyPaid` against `stripe.invoices.list({ status: "paid" })` for the current `current_period`.
4. Pick target — `pickForceChargeTarget` returns either an open invoice or a held draft matching expected amount (never null + create — see "Critical safety property").
5. Finalize the draft if needed (idempotency key `force-finalize-${invoiceId}`).
6. Pay via existing `payOpenInvoiceAsPastDueAdmin` — preserves `billing_reason: "subscription_cycle"`, triggers full webhook renewal pipeline.

### Critical safety property

Force Charge never creates new manual invoices. The webhook's [`invoice.payment_succeeded`](../../src/app/api/stripe/webhook/route.ts#L3598-L3618) dispatch ladder rejects unknown `billing_reason` values, so a manually-created invoice (`billing_reason: "manual"`) would charge the customer but skip the renewal pipeline (no status flip, no entries, no Klaviyo event). By only paying invoices Stripe created (which retain `subscription_cycle`), the pipeline runs as normal.

If no chargeable invoice exists on the current sub, the orchestrator returns `reason: "no_chargeable_invoice"` and the admin/user is prompted to contact support.

### Idempotency model (pre-2026-05-06)

| Step | Stripe key | DB lock |
|---|---|---|
| Finalize | `force-finalize-${invoiceId}` | (covered by InvoiceChargeLog subscription-level 24h success-status lock) |
| Pay | `admin-charge-${invoiceId}` (existing) | (existing per-invoice 24h lock, superseded by 6h + budget model below) |

Concurrent admin + user fires deduplicated via stable Stripe idempotency keys.

### Window + budget model (effective 2026-05-06)

The 24h-per-invoice lock was tightened to 6h with per-path attempt budgets:

| Path | Window | Max attempts per window | Idempotency key |
|---|---|---|---|
| Bulk past-due charger | 6h | 1 | Static `admin-charge-${invoiceId}` |
| Per-user admin retry | 6h | 1 | Static `admin-charge-${invoiceId}` |
| Admin Force Charge | 6h | 3 | Per-attempt `admin-charge-${invoiceId}-fc-admin-${N}` |
| User self-serve | 6h | 3 | Per-attempt `admin-charge-${invoiceId}-fc-user-${N}` |

Admin and user budgets are tracked **separately** via `result.forceCharge.triggeredBy` on the InvoiceChargeLog rows the orchestrator writes after pay.

**30-second debounce:** independent of budget. Any second attempt on the same invoice within 30s of the prior attempt is blocked with `skipReason: "too_soon"`. Applies uniformly across all paths to absorb spam-clicks.

**Per-attempt idempotency keys** mean Force Charge retries are real Stripe calls (not cached). Stripe still caches each unique key for 24h, so an exhausted budget doesn't accidentally re-charge from a prior window.

**Worst-case decline-fee bound per invoice per 6h:** 1 (bulk) + 3 (admin FC) + 3 (user) = 7 fresh attempts.

### `recent_charge_attempt` reason — expanded semantics

The reason name is unchanged but its meaning differs by caller:
- Bulk / regular admin retry: any prior attempt within 6h.
- Admin Force Charge: 3+ admin Force Charge attempts within 6h.
- User self-serve: 3+ user-triggered attempts within 6h.

The error message string distinguishes them.

## Features

[src/features/admin/](../../src/features/admin/) — feature-modular admin code.

## Services

[src/services/admin/](../../src/services/admin/) — admin services:
- `chargePastDueHistory.ts` — read-only query service for the past-due charge history UI. Exports:
  - `parseAestDayStartUtc(s)` — parses a `YYYY-MM-DD` string as the **start** of an Australia/Sydney calendar day (via `date-fns-tz` `fromZonedTime`) and returns the corresponding UTC `Date`. Returns `undefined` for null/empty/non-matching input. Used as the inclusive lower bound (`$gte`).
  - `parseAestDayEndExclusiveUtc(s)` — parses the same `YYYY-MM-DD` string as the start of the **next** AEST day and returns its UTC instant. Used as the **exclusive** upper bound (`$lt`) so the entire local day is included regardless of DST transitions. Both helpers are imported directly by the runs/manual-retries route handlers (which dropped their previous local `parseDate` helper).
  - `escapeUserSearchRegex(s)` — escapes regex metacharacters so a user-supplied substring can't break out of the case-insensitive `User.email` regex match used by `listManualRetries`.
  - `buildRunsFilter(input)` / `buildManualRetriesFilter(input)` — Mongo filter builders. `endDate` is applied as `$lt` (exclusive upper bound, matching the AEST helpers above).
  - `listChargeRuns(filter)` — paginated list of `ChargeJobRun` documents; accepts `startDate`, `endDate`, `adminId`, `status`, `limit`, `offset` (default page size 50, max 200).
  - `getChargeRunDetail(runId)` — returns `{ run, rows }` for a single bulk run (run doc + all matching `InvoiceChargeLog` rows). Each `RunDetailRow` includes `declineCode?` alongside `errorCode?`/`errorMessage?` so callers can prefer the most specific Stripe signal.
  - `listManualRetries(filter)` — same filter shape as `listChargeRuns` plus a new `userSearch?: string` field on `ManualRetriesFilterInput`. When non-empty, the service first runs a User-collection regex pre-lookup (`{ $regex: escapeUserSearchRegex(trimmed), $options: "i" }`, capped at **500** matches and trimmed/sliced to **120 chars**) and constrains the main query to those user IDs. If no users match, the call returns `{ rows: [], total: 0 }` without touching `InvoiceChargeLog`. Rows include `declineCode?` (same select+map as `getChargeRunDetail`).

  The pure `formatDurationMs` formatter lives in [src/utils/admin/chargePastDueFormat.ts](../../src/utils/admin/chargePastDueFormat.ts) and is re-exported here for server callers — client components must import directly from `utils/admin/chargePastDueFormat` so Mongoose is not pulled into the client bundle.

### `summariseDeclineCodes(filter)` — page-level decline reasons

Wraps a single `InvoiceChargeLog.aggregate` over `status: "failed"` rows in the given AEST-anchored range, groups by `declineCode → errorCode → "unknown"`, sorts desc, then delegates to the pure helper `bucketDeclineCodeCounts` for top-5-plus-other bucketing.

`bucketDeclineCodeCounts` is exported separately and unit-tested in `chargePastDueHistory.test.ts`. The aggregation itself is verified manually against staging data.

- `dashboard-stats/` — dashboard stats daily snapshot subsystem:
  - `snapshotSchema.ts` — `classifyRevenueBucket(args)` maps a PaymentEvent's `(packageType, packageId, billingReason)` to a `RevenueBucketKey | null`. Also exports `REVENUE_BUCKET_KEYS` and `emptyBucket()`. Mirrors the live aggregation logic in the dashboard stats route so snapshots are bit-for-bit comparable.
  - `revenueAggregator.ts` — `aggregateRevenueForDay(start, end, refundedPISet)` queries `PaymentEvent` for the given UTC range and returns per-bucket totals. `loadRefundedPaymentIntentIds()` loads the global refunded-PI set.
  - `adChannelProviders.ts` — provider registry (`AD_CHANNEL_PROVIDERS`). Currently contains `facebookAdChannelProvider` only. Add TikTok/Snapchat by appending a new `AdChannelProvider` object — no schema change required; the snapshot stores `adChannels` as a Map.
  - `DashboardStatsSnapshotWriter.ts` — `writeSnapshotForDate(dateKey, refundedSet)` computes and upserts one snapshot row. `writeSlidingWindow({ todayAESTDateKey, windowDays })` re-upserts today + previous N days in sequence. `aestDayBounds(dateKey)` → `{ dayStartUTC, dayEndUTC }` (DST-correct). `expandDateKeyRange(start, end)` → ordered list of AEST date keys. All writes use `findOneAndUpdate` with `{ upsert: true }` so they are idempotent.
  - `DashboardStatsSnapshotReader.ts` — `readStatsForRange({ rangeStartUTC, rangeEndUTC })` returns `SnapshotReadResult`. Sums snapshot rows for complete AEST days, computes today live (not yet snapshotted), falls back to live for any date missing a snapshot (flagged in `meta.missingSnapshotDates`). ROAS per channel is recomputed from summed totals rather than averaged. `userCount` per bucket is always live (distinct users not additive across days).
  - `distinctUserCounts.ts` — `computeDistinctUserCounts(start, end)` → `Record<RevenueBucketKey, number>`. Single aggregation pipeline: match `BenefitsGranted` events, exclude refunded PIs via `excludeRefundedBenefitsGrantedStages()`, group by `(packageType, packageId, billingReason)` using `$addToSet` on `userId`, then re-union into a Set per bucket to avoid double-counting the same user across multiple tuples in the same bucket.

- `cancellationFlowAnalytics.ts` — read-only cancellation-flow analytics (Task 18). Two exports:
  - `summarizeCancellationEvents(events, now)` — **pure**, no I/O. Shapes `ICancellationFlowEvent[]` into `CancellationFlowSummary`: `triggered`, `byReason` (per `CANCELLATION_REASONS`, `{ count, sharePct, accepted, cancelled, abandoned }` — outcome split uses the same definitions as the funnel, so abandoned = `outcome "in_progress" && startedAt <= now-1h`), `funnel` (`reachedReason` = total; `reachedOffer` = `offersShown.length > 0 && !pastDue`; `accepted` = `outcome "saved"`; `cancelled` = `outcome "cancelled"`; `abandoned` as above), `saveRate`/`saveRatePct` (`accepted / (accepted+cancelled+abandoned)`, 0-denom guarded), `byOfferAccepted` (per `OFFER_TYPES`, saved-only), `pastDueExcludedFromOfferConversion` (count of past-due events), `retention90` (`{ retained, churned, pending }` over saved events — `retained`/`churned` only when matured i.e. `savedAt <= now-90d` and `retention90` set, else `pending`), `retention90ByOffer` (`Record<OfferType, { retained, churned, pending }>` — the **same** matured/pending boundary as `retention90`, keyed by `offerAccepted`; only saved events with a non-null `offerAccepted` contribute; every `OfferType` key always present/zeroed so per-offer totals reconcile with the overall split — identical cutoff to the §6a maturity cron, no skew), and `otherReasonTexts` (the trimmed free-text content of every `reason === "other"` event with a non-empty `reasonText`, plus that event's `startedAt` and `outcome`; sorted by `startedAt` desc; whitespace-only entries excluded). All `%` divisions guard divide-by-zero (`triggered === 0` → all `sharePct` 0; empty array → save rate 0). Unit-tested: `npm run test:cancellation-analytics`.
  - `getCancellationFlowAnalytics({ from?, to? })` — DB entry. `await connectDB()`, queries `CancellationFlowEvent` with a **bounded** `startedAt` window (`$gte from` / `$lt to`; defaults to **last 90 days** when neither given — never an unbounded scan), `.lean()`, delegates to the pure shaper with `new Date()`. Service signature still uses UTC `Date` bounds; the `GET /api/admin/cancellation-flow-analytics` route accepts AEST `startDate`/`endDate` (yyyy-MM-dd) from the UI and converts to UTC bounds before calling the service.

- `MembershipAnalyticsService` — renewal, past-due, and cancellation metrics.
  - `getAnalyticsBundle(startDate, endDate, dateRange, options?)` — returns `MembershipAnalyticsBundle`. Accepts optional `{ membershipAsOfMode, asOfDate, precomputedRenewals }`. When `precomputedRenewals: { purchaseCount, userCount }` is passed, skips the full-range `fetchNetBenefitsGrantedInRange` scan and uses the values directly — the dashboard stats route threads `snapshotRead.revenue.buckets.membershipRenewal` through to avoid scanning the entire `paymentevents` collection twice (once inside `DashboardStatsSnapshotReader`, once here). Without it the service falls back to the live scan. The `cancellationsInRange` count is always live (delta query).
  - `getMembershipByPackageLive()` — live per-package counts.
  - `getMembershipByPackageLiveForSnapshot()` — four-count shape used by snapshot writer cron.
  - `getMembershipByPackageSnapshot(asOfDate)` — point-in-time counts from `MembershipDailySnapshot`; falls back to live data with `snapshotMissing: true` when no row exists.
  - `getRenewalBaseAsOf(date)` *(private)* — queries `MembershipDailySnapshot` for the period's first day and sums `activeCount + pastDueCount` across all subscription packages. If no snapshot exists for the exact date, it uses the nearest later snapshot (capped at 7 days out). Returns `{ base, snapshotDate, snapshotMissing }`.

### Renewal Rate KPI (2026-05-29)

The `getAnalyticsBundle` method populates `renewalProgress: RenewalProgress` only when the `dateRange` parameter resolves to a draw period (`current-draw` or `last-draw`). It is omitted for all other date filters.

**Definition:**

| Field | Value |
|---|---|
| `base` | `activeCount + pastDueCount` from `MembershipDailySnapshot` at the period's **first day** (nearest-later-day fallback, up to 7 days) |
| `renewed` | `successfulRenewalUserCount` — distinct members who had a successful renewal payment in the period, by payment date |
| `renewalRate` | `renewed / base`, capped at 1.0 (≤ 100%) |
| `remaining` | `base - renewed` (non-negative) |
| `remainingLabel` | `"expected"` for `current-draw` (period still open); `"did not renew"` for `last-draw` (closed period) |
| `snapshotMissing` | `true` when no snapshot was found within the 7-day window |

**Type:** `RenewalProgress` in `src/types/admin/membershipAnalytics.ts`. Added as an optional field on `MembershipAnalyticsBundle`.

**API surface:** `GET /api/admin/dashboard/stats` exposes `stats.users.renewalProgress` when a draw date range is active.

**Validation script:** `npm run find:renewal-rate` (`scripts/find-renewal-rate.ts`). Supports `--last-draw` (last draw period), `--draw N` (specific draw by number), and `--coverage` (snapshot availability audit). Use this to cross-check the KPI card values against raw DB data.

**Spec:** `docs/superpowers/specs/2026-05-29-renewal-rate-metric-design.md`.

## Routes

[src/app/api/admin/](../../src/app/api/admin/) — extensive route family. Includes:
- User management
- Payment events / refund replay
- Charge past-due (single + bulk)
- Error reports
- Contact submissions
- Partner applications
- Promo management
- **Upsell multipliers** (`/api/admin/upsell-multipliers`):
  - `GET /api/admin/upsell-multipliers` — returns the singleton `UpsellMultiplierConfig` document (`{ membership, oneTime, additional }`). Returns defaults `{ membership: 10, oneTime: 2, additional: 2 }` if no document exists yet.
  - `PUT /api/admin/upsell-multipliers` — upserts the config document. Zod-validated; all three fields required; values must be members of `PROMO_MULTIPLIERS`. Called by `useUpsellMultipliersMutation()` in the admin panel.
- Affiliate management
- Draw management
- Analytics dashboards (`/api/admin/dashboard/stats`)
  - `GET /api/admin/dashboard/stats`: accepts `dateRange`, `startDate`, `endDate`. When `membershipAsOfMode === "snapshot"`, standing cancellation count and revenue impact are sourced from the snapshot table; delta metrics (cancelledMemberships, renewals) remain live. Response includes `snapshotMissingForStanding: true` when a snapshot row is absent for the requested date. **Refactored (PR4, 754→533 lines):** revenue aggregation and Facebook ad metrics now delegate to `readStatsForRange` (from `DashboardStatsSnapshotReader`) for both the main range and the comparison/trends range. Response shape unchanged; per-bucket breakdown now exposes `userCount` (live, via `computeDistinctUserCounts`) rather than an inline `userIds: Set<string>`.
- Snapshot health check
  - `GET /api/admin/health/dashboard-stats-snapshot`: admin-only. Returns expected vs present snapshot counts from site launch through yesterday-AEST (today excluded). Response: `{ expectedCount, presentCount, missingCount, missingDates, latestPresent }`. Use this as the first step of the ops runbook when dashboard stats look stale.
- User metrics (`/api/admin/metrics/users`)
  - `GET /api/admin/metrics/users`: accepts `startDate`, `endDate`, `groupBy`, `daily`. Also accepts `dateRange` (forwarded to `parseAdminDashboardDateRange` to derive `asOfDate`). When the resolved `asOfDate` is non-null (snapshot mode), `membershipStatus.active/cancelled/pastDue` in the response are sourced from `MembershipDailySnapshot` for that date; `membershipStatus.renewed` remains a live range delta. If no snapshot exists for the date, live values from the User-loop are returned.

> _TODO: enumerate the exact subdirectories under api/admin/ and document each._

## Auth pattern

Every handler:
```ts
const session = await getServerSession(authOptions);
const adminCheck = requireAdmin(session);
if (adminCheck) return adminCheck; // 401/403
// ... admin work
```
