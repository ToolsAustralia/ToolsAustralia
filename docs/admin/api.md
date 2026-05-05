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

## Auth

Per [auth rules R1-R2](../auth/rules.md): every handler must call `requireAdmin(session)`. Middleware doesn't gate `/api/admin/**`.
