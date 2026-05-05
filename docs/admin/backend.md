# Admin — Backend

## Server-only code

[src/server/admin/](../../src/server/admin/):
- `chargePastDueShared.ts` — shared logic for past-due charge retry (used by single + bulk endpoints). `payOpenInvoiceAsPastDueAdmin` enforces the 24h DB skip window via `InvoiceChargeLog` and passes a stable `idempotencyKey` to `stripe.invoices.pay` so a rapid double-submit returns Stripe's cached first response. See [billing-stripe/gotchas#multi-layer-protection-on-the-bulk-endpoint](../billing-stripe/gotchas.md#multi-layer-protection-on-the-bulk-endpoint).

  **`chargeRunId` plumbing:** the bulk route (`POST /api/admin/invoices/charge-past-due`) creates a `ChargeJobRun` document at start and passes its `_id` as `chargeRunId` to every `payOpenInvoiceAsPastDueAdmin` call. The function writes that ObjectId onto every resulting `InvoiceChargeLog` row. The per-user route (`POST /api/admin/users/[id]/charge-past-due`) passes `null`, so manual retries are queryable with `chargeRunId: null`.

  **Late "still past-due?" re-check:** `payOpenInvoiceAsPastDueAdmin` calls `shouldSkipForNotPastDue` (from `past-due-charge-idempotency.ts`) immediately before `stripe.invoices.pay`. This re-fetches the user's current `subscription.status` from the DB; if it has flipped from `past_due` to `active` between list-time and call-time (e.g. a concurrent webhook settled the invoice), the attempt is skipped with `skipReason: "no_longer_past_due"` and the `ChargeJobRun` totals credit `skippedBreakdown.noLongerPastDue`.

- `past-due-charge-idempotency.ts` — pure helpers (`RECENT_ATTEMPT_WINDOW_HOURS`, `cutoffForRecentAttempt`, `buildAdminChargeIdempotencyKey`, `shouldSkipForNotPastDue`) extracted to a Stripe-free module so they're unit-testable without `STRIPE_SECRET_KEY`. Tested by `src/server/admin/__tests__/chargePastDueShared.test.ts` (`npm run test:past-due-admin-charge`).
- (other shared admin code)

## Features

[src/features/admin/](../../src/features/admin/) — feature-modular admin code.

## Services

[src/services/admin/](../../src/services/admin/) — admin services:
- `chargePastDueHistory.ts` — read-only query service for the past-due charge history UI. Three exports:
  - `listChargeRuns(filter)` — paginated list of `ChargeJobRun` documents; accepts `startDate`, `endDate`, `adminId`, `status`, `limit`, `offset`.
  - `getChargeRunDetail(runId)` — returns `{ run, rows }` for a single bulk run (run doc + all matching `InvoiceChargeLog` rows).
  - `listManualRetries(filter)` — same filter shape as `listChargeRuns`; returns `InvoiceChargeLog` rows where `chargeRunId === null`.
- `MembershipAnalyticsService` — renewal, past-due, and cancellation metrics.
  - `getAnalyticsBundle(startDate, endDate, dateRange, options?)` — returns `MembershipAnalyticsBundle`. Accepts optional `{ membershipAsOfMode, asOfDate }`. When `membershipAsOfMode === "snapshot"` and `asOfDate` is set, `cancelledMembershipRevenueImpact` is computed from the snapshot row's `scheduledCancelCount × current catalog price` (snapshot date-lock approximation). The `cancellationsInRange` count is always live (delta query).
  - `getMembershipByPackageLive()` — live per-package counts.
  - `getMembershipByPackageLiveForSnapshot()` — four-count shape used by snapshot writer cron.
  - `getMembershipByPackageSnapshot(asOfDate)` — point-in-time counts from `MembershipDailySnapshot`; falls back to live data with `snapshotMissing: true` when no row exists.

## Routes

[src/app/api/admin/](../../src/app/api/admin/) — extensive route family. Includes:
- User management
- Payment events / refund replay
- Charge past-due (single + bulk)
- Error reports
- Contact submissions
- Partner applications
- Promo management
- Affiliate management
- Draw management
- Analytics dashboards (`/api/admin/dashboard/stats`)
  - `GET /api/admin/dashboard/stats`: accepts `dateRange`, `startDate`, `endDate`. When `membershipAsOfMode === "snapshot"`, standing cancellation count and revenue impact are sourced from the snapshot table; delta metrics (cancelledMemberships, renewals) remain live. Response includes `snapshotMissingForStanding: true` when a snapshot row is absent for the requested date.
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
