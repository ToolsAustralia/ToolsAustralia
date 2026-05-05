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
| `startDate` | ISO date string | Filter by `startedAt ≥ startDate` |
| `endDate` | ISO date string | Filter by `startedAt ≤ endDate` |
| `adminId` | string | Filter by the admin who triggered the run |
| `status` | `running\|completed\|failed\|aborted` | Filter by run lifecycle state |
| `limit` | number | Page size (default 20) |
| `offset` | number | Skip count for pagination |

**Response:** `{ runs: ChargeJobRun[], total: number }`

### `GET /api/admin/charge-past-due/runs/[runId]`

Returns the detail view for a single bulk run: the `ChargeJobRun` document plus all `InvoiceChargeLog` rows with a matching `chargeRunId`.

**Response:** `{ run: ChargeJobRun, rows: InvoiceChargeLog[] }` or `404` if the run is not found.

### `GET /api/admin/charge-past-due/manual-retries`

Lists `InvoiceChargeLog` rows where `chargeRunId === null` — i.e. per-user manual retries that were not part of any bulk run.

**Query params:** same as `/runs` (`startDate`, `endDate`, `adminId`, `status`, `limit`, `offset`).

**Response:** `{ rows: InvoiceChargeLog[], total: number }`

### `GET /api/admin/users/[userId]/recover-past-due-invoice`

Pre-flight eligibility check — read-only (no Stripe writes, no DB writes). Used by [`RecoverInvoiceModal`](../../src/components/admin/RecoverInvoiceModal.tsx) on open to gate the confirmation UI before the admin has a chance to submit.

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

## Auth

Per [auth rules R1-R2](../auth/rules.md): every handler must call `requireAdmin(session)`. Middleware doesn't gate `/api/admin/**`.
