# Admin — API

The `/api/admin/**` namespace. Per the manifest, this domain is the catch-all for admin routes; subdirectories may also be referenced from feature domains' API docs.

## Known sub-paths

| Sub-path | Domain affinity | Purpose |
|---|---|---|
| `/api/admin/users/[id]/cancel-subscription` | [subscription](../subscription/) | Admin cancel sub |
| `/api/admin/users/[id]/charge-past-due` | [billing-stripe](../billing-stripe/) | Single past-due retry |
| `/api/admin/users/[id]/payment-events/[eventId]/reverse` | [billing-stripe](../billing-stripe/) | Refund replay |
| `/api/admin/invoices/charge-past-due` | [billing-stripe](../billing-stripe/) | Bulk past-due retry |
| `/api/admin/invoices/recover-past-due` | admin | Bulk stranded-invoice recovery (per-invoice, max 10) |
| `/api/admin/invoices/recover-stranded` | admin | Bulk stranded-invoice recovery via scan + preview (GET preview / POST run) |
| `/api/admin/sync-klaviyo-profiles` | [tracking](../tracking/) | POST: throttled bulk Klaviyo profile sync. Now gated by `users.edit` (was unauthenticated). `maxDuration=300`; whole-DB sweeps belong in an ops script. |
| `/api/admin/error-reports/**` | [error-reporting](../error-reporting/) | Error triage |
| `/api/admin/contact-submissions/**` | [contact](../contact/) | Submission review |
| `/api/admin/promo-analytics/**` | [promo](../promo/) | Promo-page analytics: summary, channel-detail, page-detail. All gated by `requirePermission("promos.view")`. The three routes share `resolvePromoAnalyticsRange()` from `src/services/promo-analytics/PromoAnalyticsService.ts` for AEST `today \| yesterday \| custom` date resolution, kept in lockstep with the Norm read mirror under `/api/internal/norm/v1/promo-analytics/**`. |
| `/api/admin/facebook-ads/purchase-audit` | [tracking](../tracking/) | Local vs Meta revenue reconciliation (TRUE ROAS) |
| `/api/admin/facebook-ads/health/insights` | [tracking](../tracking/) | Facebook Ads Health view — Mongo-first aggregated campaign/adset/ad insights (past days from `MetaAdInsightsDaily`, today live from Meta) with verdict engine + per-row snooze state. Server filters: `level`, `startDate`, `endDate`, `campaign`. Filters for verdict/learningStatus/minSpend/search are applied client-side in `FacebookAdsHealthView` (useMemo) — they do not appear in the query schema or TanStack queryKey. No account TRUE ROAS card — purchase-audit route handles that diagnostic separately. |
| `GET /api/admin/facebook-ads/health/settings` | [tracking](../tracking/) | Read health verdict engine settings (requires `facebookAds.view`) |
| `PUT /api/admin/facebook-ads/health/settings` | [tracking](../tracking/) | Update health verdict engine settings (requires `facebookAds.edit`) |
| `POST /api/admin/facebook-ads/health/snooze` | [tracking](../tracking/) | Create or update a snooze for an ad (requires `facebookAds.edit`) |
| `GET /api/admin/tiktok-ads/insights` | [tracking](../tracking/) | Per-TikTok-ad spend/conversions/revenue/ROAS breakdown from `TikTokAdInsightsDaily` (the TikTok analogue of the Meta spend-by-URL / `facebook-ads/insights` table). Gated by `facebookAds.view`; see [§ TikTok ad-level insights](#tiktok-ad-level-insights-per-ad-breakdown). |
| `GET /api/admin/chatbot-cost` | admin / support-chat | Cobber chatbot cost & usage analytics. Optional `?days=N` (default 30, clamp 1–90). Gated by `overview.view`. Returns `{ data: ChatbotCostData, meta: { timestamp } }` with: `cost` (today/7d/30d USD, total tokens); `daily` (ascending day rows); `usage` (totalRequests, deflectedCount, llmCount, deflectionRatePct, escalatedCount, memberCount, anonymousCount, avgDurationMs, **`conversationsCount`** — distinct non-null `conversationId`s over the range); **`config`** (model, **activeProvider**, dailyBudgetUsd, killSwitch, generativeLimitMax, generativeLimitWindowSeconds — read server-side from env vars + DB at request time). Cache-Control: private, max-age=300. Service: `src/services/admin/chatbotCostAnalytics.ts`. |
| `GET /api/admin/chatbot-settings` | admin / support-chat | Read the active chatbot provider (anthropic or google). Gated by `overview.view`. Returns `{ data: { activeProvider: "anthropic" \| "google" }, meta: { timestamp } }`. |
| `PATCH /api/admin/chatbot-settings` | admin / support-chat | Switch the active chatbot provider. Gated by `overview.view`. Body: `{ activeProvider: "anthropic" \| "google" }`. Returns the updated `{ data: { activeProvider }, meta: { timestamp } }`. Invalid `activeProvider` → 400 `BAD_REQUEST`. |
| `POST/PUT /api/admin/monthly-coupon/campaign[/[id]]` | [rewards-redeemables](../rewards-redeemables/) | Redeemable-campaign create/update. **Validation (2026-07-06):** `manual-users`/`csv-users` targeting requires a non-empty `segmentConfig.includeUserIds` — create rejects via zod `superRefine`; update validates the MERGED state in `CampaignService.updateCampaign` (PUT is partial). See [rewards-redeemables/gotchas.md](../rewards-redeemables/gotchas.md). |
| _TODO_ | — | Affiliate, draw, other admin routes |

> _TODO: read [src/app/api/admin/](../../src/app/api/admin/) and enumerate every sub-route._

## Bulk past-due charge — preview endpoint

### `GET /api/admin/invoices/charge-past-due`

Permission: `users.view`. Read-only preview of the bulk past-due charge run — returns what the POST handler *would* attempt right now without making any Stripe charges or DB writes. Pulls every open `charge_automatically` Stripe invoice (with `data.customer` expanded inline to avoid the N+1), joins to MongoDB users whose `subscription.status === "past_due"`, runs the eligibility filters (`wrongCollectionMethod`, `noAmountRemaining`, `noPaymentMethod`, `noCustomerId`, `userNotFound`, `notPastDue`), then collapses per-customer via `selectCurrentSubscriptionChargeable` so each customer contributes exactly one invoice (the one attached to their current subscription); older / duplicate-cycle invoices count toward `filterStats.duplicateOrStaleCycle`.

The eligibility math lives in `previewChargePastDueInvoices` ([src/services/admin/previewChargePastDueInvoices.ts](../../src/services/admin/previewChargePastDueInvoices.ts)) so the POST run and this GET preview cannot diverge — both call the same per-row filters and the same per-customer scoping helper. The Norm mirror at `GET /api/internal/norm/v1/invoices/charge-past-due` (registry key `invoices.charge-past-due.preview`, `users.view`) calls the same service.

Response: `{ success: true, preview: { eligibleCount, totalInvoices, filterStats, debug, users } }` — `amount` on each user row is in Stripe currency-minor-unit (cents). The POST handler is `trigger_human_approve` in the Norm registry and is not yet wired.

### `POST /api/admin/invoices/charge-past-due` — chunked charge job

Permission: `users.charge`. The bulk charge is split across many short requests so it never hits Vercel's 300s cap (the legacy single-shot loop did all ~800 charges in one request). The client drives a `start → chunk → chunk … → done` loop. Body carries an `action`:

| `action` | Body | Effect | Returns |
|---|---|---|---|
| `"start"` (default) | `{ confirmation: "CHARGE" }` | Acquires the `ChargeJobLock`, sweeps orphans, snapshots the eligible worklist (one Stripe list pass, **no charging**), creates the `ChargeJobRun` + `ChargeJobWorklist`. Wrong/missing confirmation → `400`; lock held → `409`. | `{ success, runId, total, done }` |
| `"chunk"` | `{ runId, chunkSize? }` | Charges the next batch of worklist invoices (default 30, max 60), renews the lock, recomputes live totals; finalizes + releases the lock when drained. Missing `runId` → `400`. | `{ success, runId, total, processed, processedThisChunk, done, totals }` |
| `"abort"` | `{ runId }` | Admin stop / modal close: recomputes totals from logs, marks the run `aborted`, releases the lock. | `{ success, runId, total, processed, done: true, totals }` |

`totals` is the `ChargeJobRunTotals` shape (see [models.md](./models.md#chargejobrun)). Delegates to [`chargePastDueJob.ts`](../../src/server/admin/chargePastDueJob.ts) (`startChargePastDueJob` / `processChargePastDueChunk` / `abortChargePastDueJob`); see [backend.md](./backend.md#server-only-code).

## Membership-by-package MRR trend (2026-06-03)

`GET /api/admin/dashboard/membership-by-package` ([route](../../src/app/api/admin/dashboard/membership-by-package/route.ts)) returns the active membership base per tier (live, or a `MembershipDailySnapshot` read when the selected range resolves to a past `asOfDate`). As of 2026-06-03 it also attaches **`summary.totalActiveRevenueTrend`** (a `TrendData`) — the MRR (active recurring revenue) % change vs the **previous comparable period**:

- The comparison window is `trendCalculationService.getComparisonPeriod(startDate, endDate)` — the same period-over-period window the dashboard-stats route uses (for "Today" → all of yesterday).
- Baseline MRR = `getMembershipByPackageSnapshot(comparisonEnd).summary.totalActiveRevenue`. If that day has **no snapshot** (`snapshotMissing`), the trend is **omitted** (no fabricated baseline from live data).
- Skipped entirely for `dateRange === "all-time"` (no prior period).
- Consumed by the Overview MRR KPI tile via `trendPct(summary.totalActiveRevenueTrend)` — see [frontend.md](./frontend.md). The pill direction/colour follow the same fixed `trendPct`/`TrendPill` rules as every other KPI.

## Charge-past-due history endpoints

All three routes are admin-only (`requireAdmin(session)`). Return shapes are defined in [src/services/admin/chargePastDueHistory.ts](../../src/services/admin/chargePastDueHistory.ts).

### `GET /api/admin/charge-past-due/runs`

Lists `ChargeJobRun` documents for the audit UI.

**Query params:**

| Param | Type | Notes |
|---|---|---|
| `startDate` | `YYYY-MM-DD` | Inclusive lower bound. Interpreted as the **AEST/AEDT calendar day** (start of day at Australia/Sydney midnight); converted to a UTC instant by `parseAestDayStartUtc`. Filter is `startedAt ≥ startDate`. |
| `endDate` | `YYYY-MM-DD` | **Exclusive upper bound** (`startedAt < endDate`). Interpreted as the AEST calendar day; the service uses the start of the *next* AEST day so the entire local day is included regardless of DST transitions (`parseAestDayEndExclusiveUtc`). |
| `adminId` | string | Filter by the admin who triggered the run |
| `status` | `running\|completed\|failed\|aborted` | Filter by run lifecycle state |
| `limit` | number | Page size (default 50, capped at 200) |
| `offset` | number | Skip count for pagination |

**Response:** `{ runs: ChargeJobRun[], total: number }`

### `GET /api/admin/charge-past-due/runs/[runId]`

Returns the detail view for a single bulk run: the `ChargeJobRun` document plus all `InvoiceChargeLog` rows with a matching `chargeRunId`. Rows include `declineCode` (Stripe's specific decline reason, e.g. `do_not_honor`, `insufficient_funds`) alongside `errorCode`/`errorMessage` so the UI can prefer the most specific signal.

**Response:** `{ run: ChargeJobRun, rows: InvoiceChargeLog[] }` or `404` if the run is not found.

### `GET /api/admin/charge-past-due/manual-retries`

Lists `InvoiceChargeLog` rows where `chargeRunId === null` — i.e. per-user manual retries that were not part of any bulk run.

**Query params:** same date / paging filters as `/runs` (AEST-aware `startDate` inclusive, `endDate` exclusive), plus:

| Param | Type | Notes |
|---|---|---|
| `adminId` | string | Filter by the admin who triggered the retry |
| `status` | `success\|failed\|skipped` | Filter on the `InvoiceChargeLog.status` field |
| `userSearch` | string (max 120 chars) | Case-insensitive substring match against `User.email`. Server pre-resolves matching user IDs (regex, capped at 500) and constrains the query to `userId: { $in: [...] }`. Empty string is ignored; whitespace is trimmed. |
| `limit` | number | Page size (default 50, capped at 200) |
| `offset` | number | Skip count for pagination |

Each row includes `declineCode` alongside `errorCode`/`errorMessage` (same convention as the runs detail endpoint).

**Response:** `{ rows: InvoiceChargeLog[], total: number }`

### `GET /api/admin/charge-past-due/decline-summary`

Aggregates failed `InvoiceChargeLog` rows in the given AEST date range, grouped by decline reason (preferring `declineCode`, falling back to `errorCode`, finally `"unknown"`). Returns the top 5 reasons plus a single `"other"` row for the long tail.

**Query:** `startDate?=YYYY-MM-DD`, `endDate?=YYYY-MM-DD` (AEST calendar dates; end is exclusive).

**Auth:** admin (`session.user.role === "admin"`); 401 otherwise.

**Response:**

```json
{
  "totalFailed": 52,
  "topCodes": [
    { "code": "lost_card", "count": 18, "pct": 35 },
    { "code": "insufficient_funds", "count": 14, "pct": 27 },
    { "code": "other", "count": 3, "pct": 5 }
  ]
}
```

Empty range → `{ "totalFailed": 0, "topCodes": [] }`.

### `POST /api/admin/users/[id]/charge-past-due`

Per-user manual past-due retry. Delegates to the `chargeOrRecover` wrapper ([src/server/admin/chargeOrRecover.ts](../../src/server/admin/chargeOrRecover.ts)), which picks between `payOpenInvoiceAsPastDueAdmin` and `recoverStrandedPastDueInvoice` via the pure `chooseChargeAction` decision function. See [backend.md → Auto-recovery wrapper](./backend.md#auto-recovery-wrapper-chargeorrecover).

**Auto-recovery:** When the user's open invoice is in Stripe's "open-but-dead" state (`attempt_count >= 1 && next_payment_attempt == null`), the route automatically voids it and re-bills via a held draft. The result row carries `recovered: true` and `newInvoiceId`. The admin modal renders an amber "Recovered" badge alongside the success badge.

**Lock semantics:** Manual admin paths bypass the 6h recent-attempt budget (`bypassRecentAttemptLock: true` is forwarded to the pay primitive; the recovery branch additionally bypasses the 6h recovery lock). The 30s spam debounce still applies — back-to-back clicks within 30s are skipped.

---

### `GET /api/admin/users/[userId]/recover-past-due-invoice`

Pre-flight eligibility check — read-only (no Stripe writes, no DB writes). Used by [`RecoverInvoiceModal`](../../src/components/admin/RecoverInvoiceModal.tsx) on open to gate the confirmation UI before the admin has a chance to submit. Calls `checkRecoveryEligibility` with `bypassRecentRecoveryLock: true` so the preview is not gated by the 6h recovery lock.

**Auth:** admin only.

**Query params:**

| Param | Required | Notes |
|---|---|---|
| `invoiceId` | yes | The original invoice ID to check (`in_…`) |

**Response (always HTTP 200 when the check itself succeeds):**

```json
{ "eligible": true, "expectedAmountCents": 4000 }
```
or
```json
{ "eligible": false, "reason": "invoice_subscription_mismatch", "message": "Original invoice does not belong to user's current subscription" }
```

The `reason` values are the same subset as the POST error reasons (excluding the write-only reasons `void_failed`, `finalize_failed`, `no_payment_method`). Returns `400` if `invoiceId` is missing.

**Implementation:** delegates to `checkRecoveryEligibility()` exported from [`src/server/admin/recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts). The POST handler internally calls the same function so verification logic is shared and not duplicated.

---

### `POST /api/admin/users/[userId]/recover-past-due-invoice`

Recover a stranded past-due invoice (status `uncollectible` or `void` — the "This invoice can no longer be paid" error). Voids the dead invoice, finds or creates a fresh draft for one cycle, finalizes, and pays via `payOpenInvoiceAsPastDueAdmin`.

**Auth:** admin only.

**Body:**

```json
{ "confirmation": "RECOVER", "originalInvoiceId": "in_..." }
```

**Success:**

```json
{
  "success": true,
  "newInvoiceId": "in_xxx",
  "row": { "invoiceId": "in_xxx", "status": "success", "amount": 4000, "...": "PastDueChargeResultRow shape" }
}
```

**Error reasons (response shape `{ success: false, reason, message }`):**

| reason | HTTP | meaning |
|---|---|---|
| `user_not_found` | 404 | userId did not match a Mongo user |
| `invoice_not_found` | 404 | Stripe didn't return the original invoice |
| `invoice_owner_mismatch` | 403 | Original invoice's customer differs from `user.stripeCustomerId` |
| `invoice_subscription_mismatch` | 403 | Original invoice belongs to a different subscription than `user.stripeSubscriptionId` |
| `not_past_due` | 409 | `user.subscription.status !== "past_due"` |
| `subscription_inactive` | 409 | User missing customer/subscription id |
| `package_not_found` | 409 | `subscription.packageId` not found in static membershipPackages |
| `invoice_still_chargeable` | 409 | Original is `open`/`draft`; admin should use existing flow |
| `invoice_already_paid` | 409 | Original is `paid`; nothing to recover |
| `invoice_unknown_status` | 409 | Original has an unexpected Stripe status |
| `recent_recovery_attempt` | 409 | Another recovery for this invoice happened within 24h |
| `no_held_draft` | 409 | No held draft invoice found on the subscription; recovery cannot proceed without one (manual invoices break the webhook renewal pipeline) |
| `no_payment_method` | 409 | Finalized invoice has no payment method (on invoice or customer default) |
| `void_failed` | 502 | Stripe rejected the void call |
| `finalize_failed` | 502 | Stripe rejected the finalize call |

**Audit:** Each step writes one `InvoiceChargeLog` row. The void/create/finalize rows are tagged with `result.recovery.{step,originalInvoiceId,newInvoiceId?}`. The pay step writes its own row via the standard past-due primitive (no `recovery` tag). To trace a recovery, query by `result.recovery.originalInvoiceId`, then by `newInvoiceId` for the pay row.

**Lock semantics:** Manual admin paths bypass the 6h recent-recovery budget (`bypassRecentRecoveryLock: true`, which also forwards as `bypassRecentAttemptLock: true` into the inner pay call). The 30s spam debounce still applies — back-to-back clicks within 30s are skipped.

---

### `POST /api/admin/invoices/recover-past-due`

Bulk-recover up to 10 stranded past-due invoices in one request. Processes them sequentially via the same `recoverStrandedPastDueInvoice` orchestrator used by the per-user modal.

**Auth:** admin only.

**Body:**

```json
{
  "confirmation": "RECOVER ALL",
  "items": [
    { "userId": "...", "originalInvoiceId": "in_..." },
    "..."
  ]
}
```

- `items` array: 1–10 entries (Zod-enforced; hard cap prevents exceeding the serverless request timeout).
- `confirmation` must be the literal string `"RECOVER ALL"`.
- Larger batches risk exceeding the serverless request timeout; admins should run multiple smaller batches.

**Success response (`HTTP 200`):**

```json
{
  "success": true,
  "summary": { "total": 3, "succeeded": 2, "failed": 1 },
  "results": [
    {
      "userId": "...",
      "originalInvoiceId": "in_...",
      "ok": true,
      "newInvoiceId": "in_new...",
      "paymentStatus": "success",
      "amount": 4000
    },
    {
      "userId": "...",
      "originalInvoiceId": "in_...",
      "ok": false,
      "reason": "recent_recovery_attempt",
      "message": "A recovery attempt for this invoice happened within the last 24h"
    }
  ]
}
```

**Error responses:**
- `401` — not authenticated or not admin
- `400` — body fails Zod validation (wrong confirmation, empty/over-10 items)
- `500` — unexpected server error

Each item is processed with `recoverStrandedPastDueInvoice`, which has its own 24h per-user idempotency lock and writes `InvoiceChargeLog` rows for every step (void / create / finalize / pay). A 300ms delay is inserted between rows to reduce Stripe rate-limit pressure. Per-item failures do **not** abort the batch — all items run and results include both successes and failures.

**Lock semantics:** Manual admin paths bypass the 6h recent-recovery budget (each item's inner call passes `bypassRecentRecoveryLock: true`). The 30s spam debounce still applies.

**Callers:** Manual-retries table on `PastDueChargeHistory` page AND the per-invoice attempts table inside `PastDueChargeHistoryDrawer` (added Phase 3 of the auto-recovery work).

## Bulk stranded-invoice recovery (scan-based)

### `GET /api/admin/invoices/recover-stranded`

Permission: `users.view`. Read-only preview — scans past-due members, classifies each via `classifyMemberForRecovery`, and returns the full candidate breakdown without making any Stripe writes or DB writes. Use this before running the POST to understand scope and estimated revenue.

**Response:**

```json
{
  "success": true,
  "preview": {
    "recoverable": [
      {
        "userId": "...",
        "email": "user@example.com",
        "customerId": "cus_...",
        "subscriptionId": "sub_...",
        "classification": "RECOVERABLE",
        "currentDraftId": "in_draft...",
        "staleOpenIds": ["in_stale1...", "in_stale2..."],
        "supersededDraftIds": ["in_old_draft..."],
        "amountCents": 4000
      }
    ],
    "blockedNoDraft": [
      {
        "userId": "...",
        "email": "user@example.com",
        "customerId": "cus_...",
        "subscriptionId": "sub_...",
        "classification": "BLOCKED_NO_DRAFT",
        "currentDraftId": null,
        "staleOpenIds": ["in_stale..."],
        "supersededDraftIds": [],
        "amountCents": 0
      }
    ],
    "totals": {
      "recoverable": 12,
      "blockedNoDraft": 3,
      "scanned": 15,
      "recoverableRevenueCents": 48000
    }
  }
}
```

Each `Row` shape: `{ userId, email, customerId, subscriptionId, classification, currentDraftId, staleOpenIds[], supersededDraftIds[], amountCents }`.

`blockedNoDraft` members have stale open invoices but no current held draft to finalize. They are surfaced in the preview so admins are aware but are not actioned by the POST.

---

### `POST /api/admin/invoices/recover-stranded`

Permission: `users.charge`. Runs the bulk stranded-invoice recovery: voids stale open invoices, deletes superseded drafts, finalizes the current held draft, and pays via `payOpenInvoiceAsPastDueAdmin`. Records a `ChargeJobRun(kind: "recover")` and per-step `InvoiceChargeLog` rows tagged `result.recovery.step`.

**Body:**

```json
{
  "confirmation": "RECOVER",
  "limit": 25,
  "userIds": ["...", "..."]
}
```

| Field | Required | Notes |
|---|---|---|
| `confirmation` | yes | Must be the literal string `"RECOVER"`. Any other value → `400`. |
| `limit` | no | Max members to attempt. Default 25, max 100. |
| `userIds` | no | If provided, restricts the run to this subset of user IDs (e.g. the `recoverable` list from a prior preview). Deduplicated before processing. |

**Success response (`HTTP 200`):**

```json
{
  "success": true,
  "chargeRunId": "...",
  "attempted": 12,
  "succeeded": 10,
  "failed": 1,
  "skipped": 1,
  "revenueCents": 40000,
  "rows": [
    {
      "userId": "...",
      "status": "success",
      "amount": 4000,
      "newInvoiceId": "in_..."
    }
  ]
}
```

**Error responses:**

| HTTP | Condition |
|---|---|
| `400` | `confirmation !== "RECOVER"` or body fails Zod validation |
| `409` | The shared `ChargeJobLock` is held by a concurrent bulk-charge or bulk-recover run |

**Safety:** Shares the global `ChargeJobLock` with the normal bulk past-due charger — the two jobs cannot overlap. Structural double-charge prevention is described in [backend.md → Bulk stranded-invoice recovery](./backend.md#bulk-stranded-invoice-recovery). This is an admin-write endpoint; the internal Norm gateway does NOT mirror it (read-only Norm boundary).

---

## Force Charge endpoints

### `POST /api/admin/users/[id]/force-charge`

Force-charge a past-due user's current cycle when no eligible invoice was found by the standard charger. Finalizes a held draft (or pays an existing open invoice) on the current subscription. Never creates new manual invoices — the webhook does not recognize `billing_reason: "manual"`, which would silently skip the renewal pipeline.

**Auth:** admin only.

**Body:**

```json
{ "confirmation": "FORCE CHARGE" }
```

**Success:**

```json
{
  "success": true,
  "chargedInvoiceId": "in_xxx",
  "row": { "...": "PastDueChargeResultRow shape (status, amount, error?, etc.)" }
}
```

**Error reasons (response shape `{ success: false, reason, message }`):**

| reason | HTTP | meaning |
|---|---|---|
| `user_not_found` | 404 | userId did not match a Mongo user |
| `subscription_inactive` | 409 | User has no active Stripe subscription/customer or `current_period` window |
| `not_past_due` | 409 | `user.subscription.status !== "past_due"` |
| `package_not_found` | 409 | `subscription.packageId` not found in static membershipPackages |
| `recent_charge_attempt` | 409 | Either: (a) per-path Force Charge admin budget exhausted (3 per 6h), or (b) a successful charge for this subscription happened within the last 6h. Message text distinguishes. |
| `period_already_paid` | 409 | Current billing period is already settled by a paid invoice |
| `no_chargeable_invoice` | 409 | No open invoice and no held draft matching expected amount on current sub |
| `finalize_failed` | 502 | Stripe rejected the finalize call |
| `pay_failed` | 502 | Stripe rejected the pay call or no payment method on file |

**Audit:** delegates to `payOpenInvoiceAsPastDueAdmin` for the pay step (which writes the `InvoiceChargeLog` row), then enriches that row with `result.subscriptionId`, `result.forceCharge.step`, and `result.forceCharge.triggeredBy: "admin"`.

---

### `POST /api/stripe/force-charge-overdue`

User self-serve version of the force-charge above. Same orchestrator, no admin auth required (uses NextAuth session), no confirmation field. The user must own the subscription being charged.

**Auth:** authenticated user (NextAuth session).

**Body:** `{}` (empty)

**Success:**

```json
{
  "success": true,
  "chargedInvoiceId": "in_xxx",
  "paymentStatus": "success" | "failed" | "skipped",
  "amount": 4000
}
```

**Error reasons:** Same as the admin endpoint (`recent_charge_attempt` is "Either: (a) per-path Force Charge user budget exhausted (3 per 6h), or (b) a successful charge for this subscription happened within the last 6h. Message text distinguishes."), with one HTTP-status difference: `recent_charge_attempt: 429` (rate limit semantics for self-serve) instead of `409`.

**Audit:** the `InvoiceChargeLog` row is tagged `result.forceCharge.triggeredBy: "user"` (with `adminId === userId` since the user is their own admin for self-serve).

---

## Dashboard stats snapshot health

### `GET /api/admin/health/dashboard-stats-snapshot`

Admin-only. Returns expected vs present snapshot counts from the site launch date (2025-11-27) through yesterday-AEST. Today is excluded because the cron hasn't snapshotted it yet.

**Response:**

```json
{
  "expectedCount": 167,
  "presentCount": 167,
  "missingCount": 0,
  "missingDates": [],
  "latestPresent": ["2026-05-10", "2026-05-11", "2026-05-12"]
}
```

**Ops runbook:**

1. Check health: `GET /api/admin/health/dashboard-stats-snapshot` (admin session required). `missingCount > 0` means the cron missed one or more days.
2. If snapshots are missing, backfill: `npm run backfill:dashboard-stats-snapshots -- --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD`. Defaults: launch date → yesterday-AEST. Idempotent — safe to re-run.
3. Periodic drift check: `npm run verify:dashboard-stats-drift -- --samples=30` — samples N random dates, re-aggregates live, reports per-bucket delta, exits non-zero on any drift.
4. Cron is idempotent — re-running heals partial failures.
5. **Refund correction window:** 90 days (the cron's sliding window). Refunds older than 90 days that need to be reflected in dashboard revenue require a manual backfill of the affected date range via `backfill:dashboard-stats-snapshots`.

## Cancellation-flow analytics

### `GET /api/admin/cancellation-flow-analytics`

Admin-only (session `role === "admin"`, else `401`). Read-only aggregated analytics for the subscription cancellation flow. Optional `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` window on `startedAt`, **AEST-inclusive** (the route converts to UTC bounds: `startDate` → start of day AEST, `endDate` → start of next day AEST for the exclusive upper bound). Malformed dates → `400`. With no range, the service defaults to the **last 90 days** so the query is always bounded (never an unbounded collection scan).

Thin handler — delegates to `getCancellationFlowAnalytics()` in `src/services/admin/cancellationFlowAnalytics.ts`, which fetches `CancellationFlowEvent` (`.lean()`) and hands off to the pure `summarizeCancellationEvents(events, now)` shaper (unit-tested: `npm run test:cancellation-analytics`).

## Hourly revenue (per-platform)

### `GET /api/admin/analytics/hourly-revenue`

Gated by `requirePermission("facebookAds.view")`. Server-side **hour-of-day** (0–23, Australia/Sydney) revenue + conversions for the selected range, from payment-attributed `PaymentEvent`s (acquisition only — renewals + refunds excluded). This is the SHARED-1 data layer behind every per-platform / aggregate hourly breakdown.

Query params: `startDate`, `endDate` (`YYYY-MM-DD`), and `platform` ∈ `meta` | `tiktok` | `snapchat` | `klaviyo` | `ad-channels` | `all` (default `all`). `klaviyo` merges `klaviyo_email + klaviyo_sms`; **`ad-channels`** sums the 5 advertising channels (meta/tiktok/snapchat/klaviyo email+sms) — matches the overview card + All-Platforms aggregate scope; `all` additionally includes `google`/`direct`/`other`. The range is interpreted as AEST calendar days — `endDate` maps to an **exclusive** next-midnight-AEST bound (matches the daily snapshot's `$lt`, so the two reconcile).

Thin handler — delegates to `PaymentEventRepository.aggregateRevenueByHourAndPlatform(startUTC, endUTC)` (the platform-group merge lives in the route's `PLATFORM_GROUPS`) and merges per-hour **ad spend** for the group: **Meta** via `fetchFacebookInsightsHourly` (cents→dollars), **TikTok** via `fetchTikTokHourlySpend` (`src/services/admin/tiktok/tiktokHourlySpend.ts` — returns null until `TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN` are set). Snapchat / Klaviyo have no spend source → `spend: null` (UI renders "—", never a misleading 0). Returns `{ success, data: { hourly: { hour, revenue, conversions, spend }[], totalRevenue, totalConversions, totalSpend, platform, dateRange } }`. **Partial-data rule (2026-07-24, panel F-003):** a spend source that is CONFIGURED but whose fetch fails nulls the spend for the **whole group** — a meta-success + tiktok-failure must never render a Meta-only sum as the group total. Unconfigured sources are simply absent (not a failure). The two fetches run concurrently via `Promise.all`, each bounded by an 8s `AbortSignal.timeout` (panel F-007). Spend failures still never break the revenue response. Reconciliation guaranteed by `npm run test:hourly-revenue`.

The Facebook Ads tab's hourly breakdown (`GET/POST /api/admin/facebook-ads/hourly-insights`) sources its per-hour **revenue + conversions** from this same aggregator (the `meta` slice) — i.e. server-side `convertingPlatform === "meta"` attribution, **not** `utm_source` and **not** Meta's pixel/CAPI numbers — merged with Facebook Marketing-API hourly **spend**. So its hourly revenue now matches the rest of the dashboard. (The separate Meta-reported insights table is intentionally left as-is for pixel-vs-server comparison.)

## Packages-focus breakdown (membership vs one-time landing URLs)

### `GET /api/admin/analytics/packages-focus?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&platform=meta`

Gated by `requirePermission("facebookAds.view")` (same paid-ads permission as the spend-by-url family). Splits ad spend / Meta-reported revenue / ROAS / conversions by the **landing-URL packages focus**: `one-time` (URL carries `?packages=one-time`) vs `membership` (everything else — the default is expressed by omitting the param), plus an `unclassified` bucket (unresolved `unknown://` destinations + aggregate rows written before the feature). Added 2026-07-17; feeds the Overview's Ad Spend / ROAS KPI drill-down modal.

Thin handler — validates params (`platform` ∈ `meta` | `tiktok`, default `meta`; missing dates → `400`) and delegates to `PackagesFocusBreakdownService.getBreakdownFormatted()` (`src/services/analytics/PackagesFocusBreakdownService.ts`). Response `{ success: true, platform, supported, reason?, meta, summary, detail }`:

- `summary` — per-bucket totals (`membership` / `"one-time"` / `unclassified` / `total`, each `spend/spendCents/revenue/revenueCents/roas/conversions/impressions/clicks`) summed from the **materialized** `LandingPageMetricsDaily.packagesFocus` subdocs → works for any range, survives the per-ad insights TTL. Revenue basis is **Meta-reported** (`action_values`), same as the headline ROAS KPI. **Near-real-time (2026-07-17):** reads self-refresh — when the range touches the trailing 1–2 days and the materialized data is >5 min old, the service syncs that window from Meta first (hard 12s budget; stale data served on expiry) — see `docs/metrics-analytics/backend.md` "On-read freshness". The same applies to `GET /api/admin/analytics/spend-by-url` (+`/detail`) and their Norm mirrors, so Prize Performance and the Spend-by-URL tab no longer wait for the sync cron.
- `detail` — campaign → ad-set → ad tree per bucket from the **live** `MetaAdInsightsDaily` × `MetaAdDestination` join (nodes sorted by spend desc at every level). Bounded by the insights TTL (~60d prod): `availableSince` = the account's oldest retained insights date (unbounded indexed lookup, range-independent), `complete = availableSince <= startDate`. A zero-activity range with the floor before it is `complete: true` with empty buckets.
- `platform=tiktok` short-circuits to `{ supported: false, reason: "awaiting-url-mapping", … }` (zeroed summary, empty buckets) until a TikTok ad→URL destination resolver ships — TikTok has no landing-URL concept yet.

Mirrored to Norm as `analytics.packages-focus` (`/api/internal/norm/v1/analytics/packages-focus`, schema in `src/lib/internal-norm/schemas/analytics-spend.ts`) — lockstep per CLAUDE.md rule 10.

**Related additive shape changes (2026-07-17):** `GET /api/admin/analytics/spend-by-url` list rows gained an optional `packagesFocus` split (`{ membership, "one-time" }` of `spend/spendCents/revenue/revenueCents/conversions/roas`); `…/spend-by-url/detail` rows gained optional `campaignId/campaignName/adsetId/adsetName` + a required `packagesFocus: "membership" | "one-time" | "unclassified"`. Norm's list/detail schemas updated in lockstep.

## TikTok ad-level insights (per-ad breakdown)

### `GET /api/admin/tiktok-ads/insights?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Gated by `requirePermission("facebookAds.view")` — the **same** paid-ads-analytics permission that already gates the whole TikTok tab + the Meta spend-by-URL breakdown (reused deliberately to avoid forking RBAC). Per-TikTok-ad breakdown (adName + spend + TikTok-reported conversions/revenue + ROAS) aggregated from `TikTokAdInsightsDaily`. The TikTok analogue of `/api/admin/facebook-ads/insights`.

Thin handler — validates the two required `YYYY-MM-DD` params (Zod; malformed → `400`) and composes two service reads: `getTikTokAdInsights()` in `src/services/admin/tiktok/tiktokAdInsightsQuery.ts` plus `getTikTokSyncHealth()` in `src/services/admin/tiktok/tiktokSyncStatus.ts` (see [backend.md](./backend.md#tiktok-ad-level-insights-per-ad-spend-breakdown)). Returns `{ success: true, data: { configured, rows, totals, dateRange, syncHealth } }` — `configured` is `false` when the TikTok Marketing-API creds (`TIKTOK_ADVERTISER_ID` + `TIKTOK_MARKETING_ACCESS_TOKEN`) are unset; `syncHealth` (2026-07-24, panel F-002) is `{ configured, lastRun: { outcome: "ok"|"error", errorCode, errorMessage, rowsUpserted, since, until, finishedAt } | null, lastSyncedAt }` so the UI can render "sync FAILING since … (code 40001)" vs "synced, genuinely no spend" instead of one benign empty state; `rows` are per-ad, sorted by spend desc, money in dollars, `roas = revenue ÷ spend` (0 when spend 0), plus a summed `totals`. **Revenue is TikTok's own attributed value** (labelled "TikTok rev." in the UI), NOT first-party `PaymentEvent` sales. Populated nightly by the `/api/cron/sync-tiktok-ads` cron (infrastructure domain; backfill via `npm run seed:tiktok-insights`). **Norm note:** `syncHealth` is composed at the ADMIN route only — `getTikTokAdInsights()`'s return shape is unchanged, so the Norm mirror's `responseSchema` needs no update (verified no-drift); mirroring `syncHealth` to Norm is a deliberate not-yet.

## Klaviyo analytics

### `GET /api/admin/klaviyo/analytics?range=last_30_days`

Gated by `facebookAds.view`. Returns **Klaviyo-attributed** campaign + flow revenue (email/SMS split via the values-report `send_channel` grouping) plus the "scheduled / about to send" view (upcoming Scheduled campaigns + live Flows). `range` ∈ `last_7_days` | `last_30_days` | `last_90_days` | `last_12_months`.

Thin handler — delegates to `getKlaviyoAnalytics(range, nowMs)` in `src/services/admin/klaviyo/klaviyoReporting.ts` (SHARED-2), which resolves the conversion metric at runtime (cached — `KLAVIYO_CONVERSION_METRIC_ID` for the custom "Marketing Revenue" metric, else "Placed Order"), fetches the campaign/flow lists + `campaign-values-reports` / `flow-values-reports`, and folds the rows per entity via the unit-tested pure shaper `foldKlaviyoValues` (`npm run test:klaviyo-fold`). All via the `klaviyo` singleton's `reportingRequest` passthrough (reuses its auth/revision/backoff).

**Throttle-safe caching:** the Klaviyo reporting endpoints are heavily throttled (≈2/min), so the route caches results **in-process (10-min TTL)** and, on a throttle/error, serves the last good snapshot with `stale: true`. The tab must **not** auto-refresh on an interval. Response: `{ success, data: { range, metricId, campaigns[], flows[], scheduled: { upcomingCampaigns[], liveFlows[] }, truncated }, stale, cachedAt }`.

**Attribution note:** this revenue is **Klaviyo's own attribution** (`conversion_value` on Placed Order) — it will NOT equal the server-side `convertingPlatform=klaviyo_email/sms` totals used on the overview card + aggregate tab; the two use different attribution windows. Label both; never sum Klaviyo-attributed into a blended ad total.

**Response (`data`):**

```jsonc
{
  "data": {
    "triggered": 14,
    "byReason": {
      // Per reason: count, share of total, plus outcome split (saved / cancelled / abandoned-in-progress).
      "too_expensive": { "count": 2, "sharePct": 14.3, "accepted": 2, "cancelled": 0, "abandoned": 0 },
      "...": {}
    },
    "funnel": { "reachedReason": 14, "reachedOffer": 11, "accepted": 9, "cancelled": 2, "abandoned": 2 },
    "saveRate": 0.692,        // accepted / (accepted + cancelled + abandoned); 0 if denom 0
    "saveRatePct": 69.2,
    "byOfferAccepted": { "discount_50_2mo": 3, "...": 0 },
    "pastDueExcludedFromOfferConversion": 1,
    "retention90": { "retained": 3, "churned": 2, "pending": 4 },
    "retention90ByOffer": {
      "discount_50_2mo": { "retained": 1, "churned": 1, "pending": 1 },
      "pause_30d": { "retained": 1, "churned": 1, "pending": 1 },
      "...": { "retained": 0, "churned": 0, "pending": 0 }
    },
    // Free-text entries when reason === "other". Sorted by startedAt desc.
    // Empty/whitespace-only reasonText is filtered out. The user fields
    // (userId/userEmail/userFirstName/userLastName) are hydrated server-side
    // for the admin User-column drill-down; absent for legacy events without
    // a userId.
    "otherReasonTexts": [
      {
        "text": "site keeps crashing",
        "startedAt": "2026-05-18T10:00:00.000Z",
        "outcome": "in_progress",
        "userId": "65f…",
        "userEmail": "jo@example.com",
        "userFirstName": "Jo",
        "userLastName": "Doe"
      }
    ]
  },
  "meta": { "timestamp": "..." }
}
```

**Aggregation rules (pure shaper):**

- `reachedReason` = total events (a reason is mandatory to start a flow).
- `reachedOffer` = `offersShown.length > 0` **AND NOT** `pastDue` (past-due events excluded from offer-conversion denominators; the excluded count is surfaced as `pastDueExcludedFromOfferConversion`).
- `accepted` = `outcome === "saved"`; `cancelled` = `outcome === "cancelled"`.
- `abandoned` = `outcome === "in_progress"` **AND** `startedAt <= now - 1h`.
- `saveRate = accepted / (accepted + cancelled + abandoned)`, `0` when the denominator is `0`. All share/rate divisions guard divide-by-zero.
- `byReason[reason]` carries an outcome split — `accepted` / `cancelled` / `abandoned` — counted with the same definitions as the funnel (abandoned uses the `>1h in_progress` cutoff). Saved past-due events still count toward `accepted` here (only the offer-conversion funnel excludes past-due).
- `retention90` is over saved events only: `retained`/`churned` only count when matured (`savedAt <= now - 90d` and `retention90` set); otherwise `pending` (covers absent `retention90` or unmatured saves). `retention90` is populated by the §6a maturity cron (Task 20).
- `retention90ByOffer` breaks the same split out **per `OfferType`**, keyed by the saved event's `offerAccepted`, using the **identical** matured/pending boundary (`savedAt <= now - 90d`) as the overall `retention90` and the §6a maturity cron — no skew. Only saved events with a non-null `offerAccepted` contribute (past-due saved events still count here; only the offer-conversion funnel excludes past-due). Every `OfferType` key is always present (zeroed when unused), so the per-offer totals reconcile with the overall split. The UI derives a retained-% over matured (`retained ÷ (retained + churned)`, shown as “—” when none matured).
- `otherReasonTexts` lists every event with `reason === "other"` and a non-empty trimmed `reasonText`, sorted by `startedAt` desc. Each entry carries the trimmed text, ISO `startedAt`, and the event's current `outcome`. Whitespace-only `reasonText` is excluded.

UI: `src/components/admin/CancellationFlowAnalytics.tsx`, mounted as the **Cancellation Flow** tab under the Analytics sidebar group (`selectedTab === "cancellation-flow"` in `AdminPage`). Data hook: `src/hooks/queries/admin/useCancellationFlowAnalytics.ts` (TanStack, queryKey `["admin", "cancellation-flow-analytics", filter]`).

### `GET /api/admin/cancellation-flow-analytics/users-by-reason`

Paginated user-level rows for a single cancellation reason. Powers the **Reason × outcome** drill-down modal (`CancellationReasonUsersModal`). Guarded by `requirePermission("overview.view")` (not the bare `requireAdmin(session)` used by the parent route).

Validates input via Zod (`querySchema`); malformed query → `400`.

**Query params:**

| Param | Type | Notes |
|---|---|---|
| `reason` | `CancellationReason` enum | Required. Must be one of `CANCELLATION_REASONS` from `@/models/CancellationFlowEvent`. |
| `outcome` | `in_progress \| saved \| cancelled` | Optional. Validated against `OUTCOME_VALUES` from the model. |
| `startDate` | `YYYY-MM-DD` | Optional. AEST-inclusive lower bound on `startedAt` (start of day at Australia/Sydney midnight, converted to UTC). |
| `endDate` | `YYYY-MM-DD` | Optional. AEST-inclusive upper bound; the route adds `+1 day` (`addDays(to, 1)`) for the exclusive UTC upper bound — same convention as the parent analytics route. |
| `page` | integer ≥ 1 | Optional. Default 1. |
| `limit` | integer 1–100 | Optional. Default 20 (the modal's page size). |

**Response (`HTTP 200`):**

```jsonc
{
  "data": {
    "rows": [
      {
        "eventId": "65f…",
        "userId": "65f…",
        "userEmail": "jo@example.com",
        "userFirstName": "Jo",
        "userLastName": "Doe",
        "startedAt": "2026-05-18T10:00:00.000Z",
        "outcome": "saved",
        "offerAccepted": "discount_50_2mo",
        "reasonText": null
      }
    ],
    "totalCount": 14
  },
  "meta": { "timestamp": "…" }
}
```

- `reasonText` is only populated when `reason === "other"` and the original `reasonText` is non-empty after trimming; otherwise undefined.
- `offerAccepted` is the saved event's accepted offer (when present); otherwise `null`.
- User fields (`userEmail`/`userFirstName`/`userLastName`) are hydrated from the `User` collection by a batched `User.find({ _id: { $in: [...] } })` keyed on the event `userId`s; absent for legacy events with no `userId`.

Response carries `Cache-Control: private, max-age=120`.

Implementation: thin handler → delegates to `getCancellationFlowUsersByReason()` in [src/services/admin/cancellationFlowAnalytics.ts](../../src/services/admin/cancellationFlowAnalytics.ts) (see [backend.md → cancellationFlowAnalytics.ts](./backend.md#services)).

## Platform revenue drill-down (2026-06-04)

### `GET /api/admin/dashboard/revenue-details/by-platform`

Permission: `overview.view`. Acquisition revenue for one `convertingPlatform`, split by source category, with a paginated buyer list. `summaryOnly=true` returns only the 5-bucket category summary (used by the hover popover path).

**Query params:**

| Param | Required | Notes |
|---|---|---|
| `platform` | yes | One of `meta \| tiktok \| snapchat \| klaviyo_email \| klaviyo_sms \| google \| direct \| other`. `direct` matches `convertingPlatform === "direct"` **or** null/missing. |
| `category` | no | Filter the buyer list (and `totalRevenue`/`totalPurchases`/`totalUsers`) to one acquisition category: `membership-purchase \| one-time-purchase \| additional-one-time \| mini-draw \| upsell`. `byCategory` bars always span all 5. |
| `dateRange` | no | `today \| yesterday \| all-time \| custom \| current-draw \| last-draw` (default `today`). Resolved via `resolveRevenueDetailsRange`. |
| `startDate` / `endDate` | conditional | `YYYY-MM-DD`; required when `dateRange` is `custom`, `current-draw`, or `last-draw`. |
| `page` | no | Default 1. |
| `limit` | no | Default 50, capped at 100. |
| `summaryOnly` | no | `true` → return only `byCategory` bars; skip buyer-list hydration (hover path). |

**Response (`success: true, data`):**

```ts
{
  platform: AttributedPlatformKey;
  byCategory: Array<{
    category: "membership-purchase" | "one-time-purchase" | "additional-one-time" | "mini-draw" | "upsell";
    revenue: number;       // AUD; 0-filled when no events
    purchaseCount: number;
    userCount: number;     // distinct users (this category only)
  }>;                      // always 5 entries, stable order
  totalRevenue: number;    // list-scoped (respects category filter); == platform acquisition total when no filter
  totalPurchases: number;
  totalUsers: number;
  users: RevenueDetailsUserRow[];   // empty when summaryOnly=true
  pagination: { currentPage, totalPages, totalCount, limit, hasNextPage, hasPrevPage };
}
```

**Key invariants:**
- Renewals are **excluded** (the `$or` query requires `packageType ∈ {one-time, mini-draw, upsell}` OR `packageType=membership AND data.billingReason ≠ subscription_cycle`).
- Whole-row refund netting via `fetchNetBenefitsGrantedWithMatch` (same helper as `getRevenueDetails`).
- The `byCategory` bars sum to the platform's acquisition revenue — this reconciles with the Advertising card's snapshot figure for settled date ranges; may differ slightly for the in-progress day (snapshot lag).
- Norm mirror: `dashboard.revenue-details.by-platform` (PII-safe: `firstName` + opaque `userId`). See `docs/internal-norm/`.

## Dashboard stats — `attributedRevenue` response key

### `GET /api/admin/dashboard/stats` — `attributedRevenue` field

Added as a new top-level key on the stats response alongside the existing `facebookAds` field.

**Shape:**

```ts
Record<AttributedPlatformKey, {
  revenue: number;          // Acquisition revenue only (newRevenue) — initial subscriptions, one-time, upsell, mini-draw, upgrades/resubscribes. This is the ROAS numerator.
  renewalRevenue: number;   // Recurring membership renewals (packageType === "membership" && billingReason === "subscription_cycle"). Tracked separately; EXCLUDED from trueRoas.
  conversions: number;      // Count of acquisition payment events (newRevenue rows only)
  byConfidence: {
    click: number;           // Acquisition revenue attributed via a captured click ID
    utm_only: number;        // Acquisition revenue attributed via UTM params only
    inferred_backfill: number; // Acquisition revenue attributed from historical data
  };
  // Present only when the platform maps to a spend provider with spend > 0:
  adSpend?: number;
  trueRoas?: number;        // newRevenue / adSpend — acquisition revenue only; renewalRevenue is NOT in the numerator
  // Present only when comparison range data is available:
  revenueTrend?: number;    // % delta in revenue (acquisition) from prior period
  trueRoasTrend?: number;   // % delta in trueRoas from prior period
}>
```

**Platform key union:** `"meta" | "tiktok" | "snapchat" | "klaviyo_email" | "klaviyo_sms" | "google" | "direct" | "other"`

**Rules:**

- Only platforms with at least one attributed payment event in the range appear in the response object. Platforms with zero revenue (acquisition + renewal) are omitted entirely.
- `adSpend` and `trueRoas` are present **only** when the platform maps to a spend provider (via `PLATFORM_TO_AD_CHANNEL_KEY` in `snapshotSchema.ts`) **and** the mapped `adChannels[key].spend > 0`. Currently `meta → facebook` is the only live mapping. All other platforms (`direct`, `klaviyo_email`, `klaviyo_sms`, `google`, `tiktok`, `snapchat`, `other`) return `revenue`, `renewalRevenue`, `conversions`, and `byConfidence` only.
- `trueRoas` is computed from the **summed** acquisition totals for the requested range: `newRevenue / adChannels[mappedKey].spend`. It is **not** averaged across snapshot days. Recurring membership renewals are deliberately excluded so ROAS reflects new-customer acquisition performance.
- `byConfidence.click + byConfidence.utm_only + byConfidence.inferred_backfill === revenue` (acquisition revenue only; renewals do not contribute to `byConfidence`).
- `revenueTrend` and `trueRoasTrend` mirror the existing `facebookAds` trends computation — they require a comparison range and are absent when no prior-period data is available.

**UI:** The "Revenue by Platform" section shows `revenue` (acquisition) as "Ad revenue" with a true ROAS figure when available. Renewals are shown as a separate muted line ("+ $X recurring renewals · not in ROAS") so they are visible but clearly excluded from the ROAS calculation.

**Example (meta platform with spend data, direct without):**

```json
{
  "attributedRevenue": {
    "meta": {
      "revenue": 12500,
      "renewalRevenue": 4200,
      "conversions": 42,
      "byConfidence": { "click": 9000, "utm_only": 2500, "inferred_backfill": 1000 },
      "adSpend": 3200,
      "trueRoas": 3.91,
      "revenueTrend": 12.4,
      "trueRoasTrend": -2.1
    },
    "direct": {
      "revenue": 4800,
      "renewalRevenue": 1100,
      "conversions": 18,
      "byConfidence": { "click": 0, "utm_only": 0, "inferred_backfill": 4800 }
    }
  }
}
```

## Repeat-purchase analytics

`GET /api/admin/analytics/repeat-purchases` — one-time-package **repeat purchase** (reconversion) summary. Guarded by `pageAnalytics.view`. Optional `?startDate&endDate` (AEST `yyyy-MM-dd`, inclusive) filters the cohort by **first-purchase** date. Returns `{ success, data: RepeatPurchaseSummary }` — `oneTimeBuyers`, `repeatBuyers`, `repeatRate`, `medianDaysToReturn`, `repeatRevenue`, `becameMembers`, `totalPurchases`, `buckets[]` (first→second gap: `same-day` / `1-7d` / `7-30d` / `30-60d` / `60-90d` / `90-180d` / `180d+`), and `windows[]` (matured return-rate per 1/7/30/60/90/180-day window).

`GET /api/admin/analytics/repeat-purchases/users` — paged, filterable cohort list (`pageAnalytics.view`). Query: `segment` (`all` | `returned` | `not-returned`), `bucket?`, `member` (`all` | `member` | `non-member` — filters by the `becameMember` conversion flag, reconciles with the "Became members" KPI), `startDate?`, `endDate?`, `page?`, `limit?` (≤100, UI pages 50 at a time via `useInfiniteQuery` "Load more"). Returns `{ success, data: { rows, totalCount, page, limit } }`; each row carries the user's **first** purchase, the **second** (reconversion) purchase, the **last** (most-recent) purchase, `daysToReturn`, `purchaseCount`, `totalSpent`, and `becameMember`. Full PII to the admin UI (firstName/lastName/email hydrated per page) — mirrors the cancellation-flow `users-by-reason` precedent.

`GET /api/admin/analytics/repeat-purchases/users/export` — CSV of the **whole** filtered cohort (same `segment`/`bucket`/`startDate`/`endDate` params, no paging). Gated by `pageAnalytics.view` (the tab already shows these rows incl. email, so the export is the same data downloadable — not a new data class; raise to a stricter permission if org policy requires). Returns `text/csv` with a `content-disposition` attachment (`repeat-purchases-<segment>[-<bucket>]-<AEST date-time>.csv`); columns: name, email, user id, first purchase + package, returned Y/N, days to return, purchases, last purchase + package, total spent, became member.

All delegate to `src/services/admin/repeatPurchaseAnalytics.ts` (see [backend.md](backend.md)). A **countable** purchase = one-time `BenefitsGranted`, refund-netted; upsells / mini-draws / membership excluded. The cohort is **one-time buyers who were NOT an active member when they bought** — people choosing one-time packs instead of subscribing. Active-member top-ups are excluded; never-members, later-converters, and **lapsed members who keep buying one-time after their subscription ended** are included. Days are AEST calendar days. The summary read is mirrored to Norm as `analytics.repeat-purchases` (aggregate-only, no PII); the users list + export are not.

## Auth

Per [auth rules R1-R2](../auth/rules.md): every handler must call `requireAdmin(session)`. Middleware doesn't gate `/api/admin/**`.

## Promo banner-text active endpoint — cache headers (2026-07-19)

`GET /api/admin/promo/banner-text/active` (public read despite living under /api/admin — no auth, admin-scheduled content, no per-user data) now returns `Cache-Control: public, s-maxage=60, stale-while-revalidate=120` instead of `no-store`, matching `/api/promo/effective-for-banner`. It is fetched above the fold by every promotions visitor; no-store forced one serverless + Mongo round trip per ad click. The admin WRITE endpoints under `banner-text/` are unchanged (still uncached).
