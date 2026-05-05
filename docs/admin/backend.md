# Admin — Backend

## Server-only code

[src/server/admin/](../../src/server/admin/):
- `chargePastDueShared.ts` — shared logic for past-due charge retry (used by single + bulk endpoints). `payOpenInvoiceAsPastDueAdmin` enforces the 24h DB skip window via `InvoiceChargeLog` and passes a stable `idempotencyKey` to `stripe.invoices.pay` so a rapid double-submit returns Stripe's cached first response. See [billing-stripe/gotchas#multi-layer-protection-on-the-bulk-endpoint](../billing-stripe/gotchas.md#multi-layer-protection-on-the-bulk-endpoint).

  **`chargeRunId` plumbing:** the bulk route (`POST /api/admin/invoices/charge-past-due`) creates a `ChargeJobRun` document at start and passes its `_id` as `chargeRunId` to every `payOpenInvoiceAsPastDueAdmin` call. The function writes that ObjectId onto every resulting `InvoiceChargeLog` row. The per-user route (`POST /api/admin/users/[id]/charge-past-due`) passes `null`, so manual retries are queryable with `chargeRunId: null`.

  **Late "still past-due?" re-check:** `payOpenInvoiceAsPastDueAdmin` calls `shouldSkipForNotPastDue` (from `past-due-charge-idempotency.ts`) immediately before `stripe.invoices.pay`. This re-fetches the user's current `subscription.status` from the DB; if it has flipped from `past_due` to `active` between list-time and call-time (e.g. a concurrent webhook settled the invoice), the attempt is skipped with `skipReason: "no_longer_past_due"` and the `ChargeJobRun` totals credit `skippedBreakdown.noLongerPastDue`.

  **Single-invoice scoping via `selectCurrentSubscriptionChargeable`:** both the per-user and bulk routes call this helper (also in `chargePastDueShared.ts`) after the standard eligibility filter. It uses `pickOpenInvoiceForFailedRenewal` (from `src/utils/payment/failed-invoice-selection.ts`) to pick the one open invoice attached to `user.stripeSubscriptionId`, returning it as `target` and all others as `skipped`. Callers push `skipped` invoices into `results` with `skipReason: "duplicate_or_stale_cycle_invoice"` so the audit log stays honest about what was seen vs charged. This prevents "This invoice can no longer be paid" Stripe errors that occur when `pause_collection` did not fire in time and a customer has accumulated multiple open cycle invoices — only the newest one on the current subscription is chargeable. If `stripeSubscriptionId` is null/empty, `target` is `null` and all invoices are returned as skipped. The GET (preview) handlers apply the same scoping and surface a `duplicateOrStaleCycle` counter in `filterStats`.

- `past-due-charge-idempotency.ts` — pure helpers (`RECENT_ATTEMPT_WINDOW_HOURS`, `cutoffForRecentAttempt`, `buildAdminChargeIdempotencyKey`, `shouldSkipForNotPastDue`) extracted to a Stripe-free module so they're unit-testable without `STRIPE_SECRET_KEY`. Tested by `src/server/admin/__tests__/chargePastDueShared.test.ts` (`npm run test:past-due-admin-charge`).
- `recoverStrandedPastDuePolicy.ts` — pure helpers for the "recover stranded past-due invoice" flow (no Stripe SDK / Mongo imports). Covers: stable idempotency keys for each recovery step (`buildRecoveryVoidIdempotencyKey`, `buildRecoveryCreateIdempotencyKey`, `buildRecoveryFinalizeIdempotencyKey`), eligibility check for the original invoice (`isOriginalInvoiceEligibleForRecovery` — eligible when `uncollectible` or `void`), held-draft picker (`pickHeldDraftForRecovery` — finds the newest matching-amount draft on the subscription), and a 24h lock predicate (`hasRecentRecoveryAttempt` — reuses `RECENT_ATTEMPT_WINDOW_HOURS` from `past-due-charge-idempotency.ts`). Tested by `src/server/admin/__tests__/recoverStrandedPastDuePolicy.test.ts` (`npm run test:recover-stranded-past-due-policy`).
- (other shared admin code)

## Stranded past-due invoice recovery

When Stripe's smart retries exhaust, the original past-due invoice transitions to `uncollectible` (or `void`). At that point both the bulk past-due charger and the per-user retry surface "This invoice can no longer be paid" because `stripe.invoices.pay()` rejects non-`open` invoices.

The recovery flow lives in [`src/server/admin/recoverStrandedPastDue.ts`](../../src/server/admin/recoverStrandedPastDue.ts) and runs the sequence:

1. Verify state — admin auth, user `subscription.status === "past_due"`, original invoice in `uncollectible`/`void`, customer/subscription ids match.
2. 24h lock — query `InvoiceChargeLog` for any prior recovery on the same original invoice via `hasRecentRecoveryAttempt` from [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts).
3. Void original (skipped if already `void`).
4. Find or create a held draft. The codebase prefers an existing held draft (Stripe creates one per missed cycle while paused) matching the expected cycle amount; falls back to `stripe.invoices.create()` + `invoiceItems.create()` if none.
5. `stripe.invoices.finalizeInvoice()` — this is the same battle-tested path used in [`pay-failed-invoice/route.ts:150`](../../src/app/api/stripe/pay-failed-invoice/route.ts#L150) and [`invoice-payment-intent.ts:163`](../../src/utils/payment/stripe/invoice-payment-intent.ts#L163). Manual finalize bypasses `pause_collection: keep_as_draft`.
6. Delegate to `payOpenInvoiceAsPastDueAdmin` ([`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts)) for the actual charge — inherits its log row + idempotency key + `resumeAfterSuccessfulRenewalPayment` on success.

Pure helpers live in [`recoverStrandedPastDuePolicy.ts`](../../src/server/admin/recoverStrandedPastDuePolicy.ts) so they're testable without `STRIPE_SECRET_KEY`. Tests: `npm run test:recover-stranded-past-due-policy`.

### Idempotency model

| Step | Stripe key | DB lock |
|---|---|---|
| Void | `recover-void-${originalInvoiceId}` | — |
| Create | `recover-create-${originalInvoiceId}` | 24h via `result.recovery.originalInvoiceId` |
| Finalize | `recover-finalize-${newInvoiceId}` | — |
| Pay | `admin-charge-${newInvoiceId}` (existing) | 24h via `invoiceId` (existing) |

The 24h DB lock checks for any `InvoiceChargeLog` row tagged `result.recovery.originalInvoiceId === <id>`; the pay step's lock continues to work via the standard past-due window since the new invoice id is fresh.

### Failure semantics

Each step is naturally idempotent. If a step fails mid-sequence, the customer is no worse than before:

- Void fails → no state change
- Create fails → original voided, no new invoice (admin retries; void is a no-op)
- Finalize fails → original voided, draft exists (admin retries; create finds existing draft)
- Pay fails → original voided, fresh `open` invoice (admin uses existing per-user retry)

## Features

[src/features/admin/](../../src/features/admin/) — feature-modular admin code.

## Services

[src/services/admin/](../../src/services/admin/) — admin services:
- `chargePastDueHistory.ts` — read-only query service for the past-due charge history UI. Three exports:
  - `listChargeRuns(filter)` — paginated list of `ChargeJobRun` documents; accepts `startDate`, `endDate`, `adminId`, `status`, `limit`, `offset`.
  - `getChargeRunDetail(runId)` — returns `{ run, rows }` for a single bulk run (run doc + all matching `InvoiceChargeLog` rows).
  - `listManualRetries(filter)` — same filter shape as `listChargeRuns`; returns `InvoiceChargeLog` rows where `chargeRunId === null`.

  The pure `formatDurationMs` formatter lives in [src/utils/admin/chargePastDueFormat.ts](../../src/utils/admin/chargePastDueFormat.ts) and is re-exported here for server callers — client components must import directly from `utils/admin/chargePastDueFormat` so Mongoose is not pulled into the client bundle.
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
