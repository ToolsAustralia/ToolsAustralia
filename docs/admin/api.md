# Admin — API

The `/api/admin/**` namespace. Per the manifest, this domain is the catch-all for admin routes; subdirectories may also be referenced from feature domains' API docs.

## Known sub-paths

| Sub-path | Domain affinity | Purpose |
|---|---|---|
| `/api/admin/users/[id]/cancel-subscription` | [subscription](../subscription/) | Admin cancel sub |
| `/api/admin/users/[id]/charge-past-due` | [billing-stripe](../billing-stripe/) | Single past-due retry |
| `/api/admin/users/[id]/payment-events/[eventId]/reverse` | [billing-stripe](../billing-stripe/) | Refund replay |
| `/api/admin/invoices/charge-past-due` | [billing-stripe](../billing-stripe/) | Bulk past-due retry |
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
| `no_payment_method` | 409 | Finalized invoice has no payment method (on invoice or customer default) |
| `void_failed` | 502 | Stripe rejected the void call |
| `draft_create_failed` | 502 | Stripe rejected the create call |
| `finalize_failed` | 502 | Stripe rejected the finalize call |

**Audit:** Each step writes one `InvoiceChargeLog` row. The void/create/finalize rows are tagged with `result.recovery.{step,originalInvoiceId,newInvoiceId?}`. The pay step writes its own row via the standard past-due primitive (no `recovery` tag). To trace a recovery, query by `result.recovery.originalInvoiceId`, then by `newInvoiceId` for the pay row.

## Auth

Per [auth rules R1-R2](../auth/rules.md): every handler must call `requireAdmin(session)`. Middleware doesn't gate `/api/admin/**`.
