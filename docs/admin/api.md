# Admin — API

The `/api/admin/**` namespace. Per the manifest, this domain is the catch-all for admin routes; subdirectories may also be referenced from feature domains' API docs.

## Known sub-paths

| Sub-path | Domain affinity | Purpose |
|---|---|---|
| `/api/admin/users/[id]/cancel-subscription` | [subscription](../subscription/) | Admin cancel sub |
| `/api/admin/users/[id]/charge-past-due` | [billing-stripe](../billing-stripe/) | Single past-due retry |
| `/api/admin/users/[id]/payment-events/[eventId]/reverse` | [billing-stripe](../billing-stripe/) | Refund replay |
| `/api/admin/invoices/charge-past-due` | [billing-stripe](../billing-stripe/) | Bulk past-due retry |
| `/api/admin/invoices/recover-past-due` | admin | Bulk stranded-invoice recovery |
| `/api/admin/error-reports/**` | [error-reporting](../error-reporting/) | Error triage |
| `/api/admin/contact-submissions/**` | [contact](../contact/) | Submission review |
| _TODO_ | — | Promo, affiliate, draw, analytics admin routes |

> _TODO: read [src/app/api/admin/](../../src/app/api/admin/) and enumerate every sub-route._

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

Admin-only (session `role === "admin"`, else `401`). Read-only aggregated analytics for the subscription cancellation flow. Optional `?from=&to=` ISO-8601 datetime window on `startedAt` (`from` inclusive, `to` exclusive). Malformed `from`/`to` → `400`. With no range, the service defaults to the **last 90 days** so the query is always bounded (never an unbounded collection scan).

Thin handler — delegates to `getCancellationFlowAnalytics()` in `src/services/admin/cancellationFlowAnalytics.ts`, which fetches `CancellationFlowEvent` (`.lean()`) and hands off to the pure `summarizeCancellationEvents(events, now)` shaper (unit-tested: `npm run test:cancellation-analytics`).

**Response (`data`):**

```jsonc
{
  "data": {
    "triggered": 8,
    "byReason": { "too_expensive": { "count": 2, "sharePct": 25 }, "...": {} },
    "funnel": { "reachedReason": 8, "reachedOffer": 7, "accepted": 5, "cancelled": 1, "abandoned": 1 },
    "saveRate": 0.714,        // accepted / (accepted + cancelled + abandoned); 0 if denom 0
    "saveRatePct": 71.4,
    "byOfferAccepted": { "discount_50_2mo": 1, "...": 0 },
    "pastDueExcludedFromOfferConversion": 1,
    "retention90": { "retained": 3, "churned": 2, "pending": 4 },
    // Task 21: same matured/pending cutoff as `retention90`, keyed by offerAccepted.
    // Every OfferType key is always present (zeroed when unused).
    "retention90ByOffer": {
      "discount_50_2mo": { "retained": 1, "churned": 1, "pending": 1 },
      "pause_30d": { "retained": 1, "churned": 1, "pending": 1 },
      "...": { "retained": 0, "churned": 0, "pending": 0 }
    }
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
- `retention90` is over saved events only: `retained`/`churned` only count when matured (`savedAt <= now - 90d` and `retention90` set); otherwise `pending` (covers absent `retention90` or unmatured saves). `retention90` is populated by the §6a maturity cron (Task 20).
- `retention90ByOffer` (Task 21) breaks the same split out **per `OfferType`**, keyed by the saved event's `offerAccepted`. It uses the **identical** matured/pending boundary (`savedAt <= now - 90d`) as the overall `retention90` and the §6a maturity cron — no skew. Only saved events with a non-null `offerAccepted` contribute (past-due saved events still count here; only the offer-conversion funnel excludes past-due). Every `OfferType` key is always present (zeroed when unused), so the per-offer totals reconcile with the overall split. The UI also derives a retained-% over matured (`retained ÷ (retained + churned)`, shown as “—” when none matured).

UI: `src/components/admin/CancellationFlowAnalytics.tsx`, mounted as the **Cancellation Flow** tab under the Analytics sidebar group (`selectedTab === "cancellation-flow"` in `AdminPage`). Data hook: `src/hooks/queries/admin/useCancellationFlowAnalytics.ts` (TanStack, queryKey `["admin", "cancellation-flow-analytics", filter]`).

## Auth

Per [auth rules R1-R2](../auth/rules.md): every handler must call `requireAdmin(session)`. Middleware doesn't gate `/api/admin/**`.
