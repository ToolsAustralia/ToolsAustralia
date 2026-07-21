# Charge Past Due Customers Feature

## Overview

This feature allows administrators to bulk charge customers with past_due invoices. It provides a secure, auditable, and safe way to retry failed subscription payments while following Stripe best practices.

## Security Features

### Multi-Layer Protection

1. **Admin-Only Access**: Only users with the `users.charge` permission can access this feature (via `requirePermissionWithAudit`)
2. **Confirmation Required**: Must type "CHARGE" exactly to confirm
3. **Global Mutex Lock**: Prevents concurrent executions — acquired **atomically** via a single `findOneAndUpdate` (unlocked-or-expired predicate + upsert; race loser gets E11000 → 409). This is the **only** concurrency guard: the per-admin (1/5min) and global (1/12h) rate limiters that previously existed were removed in commit `45c759eb` (2026-02-27)
4. **Time-Based Idempotency**: Prevents duplicate charges within 24h, allows future retries
5. **Stripe Idempotency Keys**: Double safety net using stable keys
6. **Database Status Verification**: Only charges users marked as `past_due` in MongoDB

## Invoice Filtering Logic

### Only Charge If ALL Criteria Met

- Stripe invoice status is `"open"` OR `"past_due"`
- Collection method is `"charge_automatically"`
- Invoice has `amount_remaining > 0`
- Invoice has `default_payment_method` set
- Invoice is finalized (`finalized_at` exists)
- Invoice is not already paid/uncollectible/void
- User's subscription status in database is `"past_due"`
- Invoice was not charged in last 24 hours (idempotency check)

### Never Charge

- Draft invoices (must be finalized first)
- Paid, uncollectible, or void invoices
- Manual invoices (`collection_method === "send_invoice"`)
- Invoices without default payment method
- Invoices already charged in last 24h
- Users whose subscription status is NOT `"past_due"` in database

## Stranded invoices in the bulk run (pay-vs-recover routing)

⚠️ **Incident 2026-07-19: 558/744 rows "failed" with Stripe's _"This invoice can no longer be paid. Consider voiding, marking as uncollectible, or marking as paid out of band instead."_ — $0 collected from them, and no charge attempt ever appeared on the customers' Stripe timelines.** Root cause: the bulk job unconditionally called `stripe.invoices.pay()` on every worklist invoice, including **stranded** ones — invoices whose Smart Retries exhausted (`attempt_count >= 1`, `next_payment_attempt: null`) and whose every PaymentIntent had been **canceled**. Stripe rejects `invoices.pay()` outright for those (no new PaymentIntent is created, which is why nothing showed in the Stripe transactions list). The per-user "Charge" button already routed these through recovery (`chargeOrRecover`); the bulk job never got that branch.

**Current behavior:** `chargeWorklistItem` retrieves each invoice with `expand: ["customer", "payments"]` and routes it via the pure `decideBulkChargeAction` (`src/server/admin/chargeOrRecoverPolicy.ts`):

- **pay** — the invoice is live (retry scheduled), OR it is exhausted but a payable invoice_payment remains (`payments.data[].status === "open"`, i.e. the PaymentIntent is still confirmable — e.g. a recovered-then-declined cycle finalized with `auto_advance: false`). A direct `invoices.pay()` genuinely reaches the card here; 28 of the 2026-07-19 run's 177 real declines were this shape and must never be misrouted to recovery (their held draft was already consumed → recovery would dead-end at `no_held_draft`).
- **recover** — the invoice is `void`/`uncollectible`, or open-exhausted with **no payable invoice_payment left** (all canceled → `invoices.pay()` is guaranteed to be rejected). Routed through `recoverStrandedPastDueInvoice`: void the stranded original → finalize the held current-cycle draft (`pause_collection: keep_as_draft` holds one per missed cycle) → pay it with the stable `admin-charge-${newInvoiceId}` key. Same machinery as the per-user path and the Recover Stranded panel.

**Double-charge guards on the recover branch** (added after adversarial review, same day): the risk is a SECOND recovery for the same member consuming a *sibling* same-amount held draft with fresh idempotency keys. Guards, stacked: (1) the per-subscription **`RecoveryClaim`** is acquired before recovering (`bulk-charge:<runId>`, released in `finally`) — serializes against member Pay-Now / renew / Force-Charge and concurrent chunks; (2) **`bypassRecentRecoveryLock: false`** keeps the 6h `hasRecentRecoveryAttempt` repeat-guard active, so a crash-resumed chunk or same-day re-run refuses instead of re-recovering (made possible by excluding recovery step-audit rows from the pay primitive's 6h check); (3) per-draft Stripe idempotency keys + paid-drafts-leave-the-pool dedupe same-draft repeats.

**Run accounting:** the recover branch writes exactly **one run-tagged `InvoiceChargeLog` summary row keyed on the ORIGINAL worklist invoice id** (mapped by `summarizeBulkRecoveryOutcome`; carries `result.recovery.bulk: true` + `newInvoiceId`). The recovery's PAY row on the NEW invoice id is also run-tagged (keeps it out of the Manual Retries view; carries the real `declineCode` for decline analytics) — but run totals are restricted to **worklist invoice ids** (`recomputeTotalsFromLogs`), so it never double-counts the member. Step-audit rows are untagged, tagged `result.recovery.step`, and excluded from Manual Retries and the decline summary. Outcome mapping: recovered-and-paid → `success` (counts toward run revenue); recovery pay declined → `failed` with the decline message; refusals before any Stripe write (`no_held_draft`, `not_past_due`, `invoice_already_paid`, recovery claim held, prior recovery within 6h, …) → `skipped`; mid-flight `void_failed` / `draft_create_failed` / `finalize_failed` → `failed`.

**Members with no held draft (`no_held_draft`)** have nothing cycle-billed to re-finalize yet (their next cycle hasn't minted a draft — a normal consequence of the `keep_as_draft` pause). **As of 2026-07-21 the bulk run re-bills them instead of skipping:** it force-collects the current cycle via `mintCurrentCycleInvoice` (see the next paragraph), reusing the bulk's already-held `RecoveryClaim`. This intentionally resets those members' billing anchors ~1 month out — an accepted trade for attempting collection on **every** stranded member in one run, because even a decline notifies them (BUSINESS.md §9i) whereas a skip contacts no one. Only genuine guard-skips stay `skipped`: member scheduled to cancel (`member_ending`), already collected by a prior re-bill (`not_past_due`), or the claim held by a concurrent recovery.

**Force-collect via mint (`mintCurrentCycleIfNoDraft`; per-user 2026-07-20, bulk 2026-07-21).** A deliberate admin **"Charge"** (`chargeOrRecover`) **and** the bulk run (`chargeWorklistItem`) both call `recoverStrandedPastDueInvoice({ mintCurrentCycleIfNoDraft: true })`, which **force-collects the current cycle** via `mintCurrentCycleInvoice`: unpause → `billing_cycle_anchor: 'now'` + `proration_behavior: 'none'`, which auto-charges the saved card for the cycle **and moves the renewal ~1 month out** (so it doubles as the reanchor), then voids the dead original. Verified on a test clock (`npm run stripe:probe-rebill-cycle`). ⚠️ The minted invoice's `billing_reason` is **`subscription_update`** (not `subscription_cycle`) — the entry-grant webhook normalizes it to a full renewal grant off the subscription's **live** package metadata (correct for a straight re-bill; a tier change would need care), and a **failed** mint fires the `Subscription Renewal Failed` dunning event via `isRebill` (BUSINESS.md §9i). The per-user path holds no `RecoveryClaim` so the mint acquires its own; the **bulk** path already holds one per member, so it passes `callerHoldsRecoveryClaim: true` → the mint reuses it (`skipClaim`) instead of self-deadlocking to `claim_held`. To preserve the run's one-summary-row-per-item accounting, the mint's rebill `InvoiceChargeLog` row is written **only on the per-user path**; in bulk the single `summarizeBulkRecoveryOutcome` row (worklist-keyed) is authoritative. The Recover Stranded panel's `BLOCKED_NO_DRAFT` bucket tracks the same population.

Regression-guarded by `npm run test:charge-or-recover-policy` (`decideBulkChargeAction` + `summarizeBulkRecoveryOutcome`).

## API Endpoint

**POST** `/api/admin/invoices/charge-past-due`

### Request Body

```json
{
  "confirmation": "CHARGE"
}
```

### Response

```json
{
  "success": true,
  "summary": {
    "totalInvoices": 50,
    "processed": 45,
    "succeeded": 30,
    "failed": 10,
    "skipped": 5
  },
  "results": [
    {
      "invoiceId": "in_xxx",
      "customerId": "cus_xxx",
      "userId": "user_id",
      "status": "success",
      "amount": 5000
    },
    {
      "invoiceId": "in_yyy",
      "customerId": "cus_yyy",
      "status": "failed",
      "error": "card_declined",
      "amount": 3000
    },
    {
      "invoiceId": "in_zzz",
      "customerId": "cus_zzz",
      "status": "skipped",
      "skipReason": "already_paid",
      "amount": 2000
    }
  ]
}
```

### Error Responses

- **401 Unauthorized**: Not an admin user
- **400 Bad Request**: Invalid confirmation (not "CHARGE")
- **429 Too Many Requests**: Rate limit exceeded (per-admin or global)
- **409 Conflict**: Another admin is running this operation (mutex lock)
- **500 Internal Server Error**: Server error during processing

## Batch Processing

- **Batch Size**: 15 invoices per batch
- **Delay Between Batches**: 500ms
- **Max Invoices**: 100 per request (Stripe's list limit)
- **Processing**: Uses `Promise.allSettled()` to continue on individual failures

## Failure Handling

### Permanent Failures (Stop Retrying)

These errors are logged as `failed` and `canRetryAt` is set to 24h from now:

- `authentication_required` (3DS required)
- `card_declined` (permanent decline)
- `expired_card` (card expired)
- `generic_decline` (permanent decline)

### Temporary Failures

- `insufficient_funds`: Skipped for bulk retry, but allows user-driven retry later

### Race Condition Handling

If database says `past_due` but Stripe invoice is `already_paid`:
- Marked as `status: "skipped"` with `skipReason: "already_paid"`
- NOT marked as failure
- Handles DB/Stripe desync gracefully

## Audit Logging

All charge attempts are logged to `InvoiceChargeLog` collection with:

- Invoice ID, Customer ID, User ID
- Admin who triggered the charge
- Status (success/failed/skipped)
- Error codes and messages
- Amount charged
- Timestamp
- `canRetryAt` (for rate limiting)
- `nextPaymentAttempt` (Stripe's scheduled retry)
- Sanitized Stripe response (no card details, PAN, or PCI-sensitive data)

## Stripe Integration

### Idempotency Keys

⚠️ **The 24h replay trap (incident 2026-06-29).** Stripe retains an idempotency key for **24 hours** and **replays the cached response for any reuse within that window — without re-attempting the charge** (response header `idempotent-replayed: true`). A key that is stable across separate runs therefore silently turns every run within 24h of the prior one into a replay of the old outcome. The daily bulk run used a static `admin-charge-${invoiceId}` and replayed **656/668** prior declines, collecting **$0**, while Stripe recorded no new attempts. The DB skip window is only 6h, so in the 6h–24h gap the code calls Stripe but Stripe replays.

**The rule:** the key MUST vary whenever you intend a genuinely NEW attempt, and may be stable ONLY across retries that must dedupe to one charge. `payOpenInvoiceAsPastDueAdmin` takes a **required** `idempotencyKey` (no stable default). Builders in `src/server/admin/past-due-charge-idempotency.ts`:

| Path | Key | Why |
|---|---|---|
| Bulk daily run | `admin-charge-${invoiceId}-run-${runId}` | fresh each run (real retry); stable within a run (resumed chunk dedupes) |
| Per-user "Charge" click | `admin-charge-${invoiceId}-once-${floor(now/30s)}` | fresh on a deliberate retry 30s+ later; concurrent submits in one 30s bucket dedupe to a single charge (the per-user route has no lock) |
| Force Charge | `admin-charge-${invoiceId}-fc-${triggeredBy}-${N}` | per-attempt within the 3-per-6h budget |
| Recovery pay step | `admin-charge-${newInvoiceId}` | stable is correct — the invoice is freshly created per recovery |

- **DO NOT** reuse a bare `admin-charge-${invoiceId}` on a path that re-charges the **same** invoice across runs/clicks — Stripe will replay it for 24h.
- Regression-guarded by `npm run test:past-due-idempotency-keys`.

### Scheduled Retries Behavior

- When `stripe.invoices.pay()` succeeds → Stripe automatically cancels scheduled retries
- When `stripe.invoices.pay()` fails → Stripe's scheduled retry continues (safe, no interference)
- `next_payment_attempt` is logged for admin visibility

### API Usage

- Uses `stripe.invoices.list()` to fetch eligible invoices
- Uses `stripe.invoices.pay()` with explicit `payment_method` parameter and idempotency key to charge
- Extracts `payment_method` from `invoice.default_payment_method` (string or object with `id` property)
- Checks `invoice.default_payment_method` directly (no `stripe.customers.retrieve()` calls)
- **Important**: The `payment_method` parameter is explicitly passed to ensure charges are actually attempted

## Database Models

### InvoiceChargeLog

Audit trail for all charge attempts with time-based idempotency.

**Key Fields**:
- `invoiceId` (indexed)
- `customerId` (indexed)
- `userId` (indexed, ref: User)
- `adminId` (indexed, ref: User)
- `status`: "success" | "failed" | "skipped"
- `errorCode`, `errorMessage`
- `amount` (in cents)
- `attemptedAt` (indexed)
- `canRetryAt` (indexed, for retry eligibility)
- `nextPaymentAttempt` (Stripe's scheduled retry)
- `result` (sanitized Stripe response)

**Indexes**:
- Compound unique on `invoiceId + attemptedAt day` (prevents duplicates within 24h)
- Compound on `customerId + attemptedAt` (customer history)
- Compound on `adminId + attemptedAt` (admin audit trail)
- Compound on `status + attemptedAt` (analytics)
- Index on `canRetryAt` (retry eligibility)

### ChargeJobLock (Optional)

Global mutex lock to prevent concurrent executions.

**Key Fields**:
- `_id`: "charge-job-lock" (single document)
- `isLocked`: boolean
- `lockedUntil`: Date (REQUIRED for auto-expiry)
- `lockedBy`: ObjectId (ref: User)
- `lockedAt`: Date

**Auto-Expiry**: Lock automatically releases after 30 minutes to prevent permanent locks on server crash.

## Frontend Component

### ChargePastDueModal

Located at: `src/components/admin/ChargePastDueModal.tsx`

**Features**:
- Confirmation input requiring exact "CHARGE" match
- Warning banner about real charges
- Progress indicator during processing
- Results summary with detailed breakdown
- Results table showing all charge attempts

**States**:
- `idle`: Initial confirmation screen
- `processing`: Show progress spinner
- `completed`: Show results summary
- `error`: Show error message

## Usage

1. Navigate to Admin → Users page
2. Click "Charge Past Due" button in header
3. Review warning message
4. Type "CHARGE" in confirmation field
5. Click "Confirm Charge"
6. Wait for processing to complete
7. Review results summary

## Critical Implementation Notes

### Required Before Implementation

1. **Stripe Idempotency Key** (see "Idempotency Keys" above for the full table):
   - ✅ Scope the key to its dedupe unit — bulk → `…-run-${runId}`, per-click → `…-once-${floor(now/30s)}` (concurrent submits dedupe, deliberate retries stay fresh), Force Charge → `…-fc-${triggeredBy}-${N}`.
   - ✅ A stable `admin-charge-${invoiceId}` is correct ONLY for the recovery pay step (a held draft, finalized — it leaves the draft pool so it can't be re-selected/replayed; the 6h recovery lock backs this).
   - ❌ Do NOT reuse a static `admin-charge-${invoiceId}` on a path that re-charges the same invoice across runs/clicks — Stripe **replays** it for 24h without re-charging (incident 2026-06-29: 668 "failed", $0).

2. **Payment Method Extraction**:
   - Extract `payment_method` from `invoice.default_payment_method` before charging
   - ✅ Handle both string and object types: `typeof invoice.default_payment_method === "string" ? invoice.default_payment_method : invoice.default_payment_method?.id`
   - ✅ Pass `payment_method` explicitly to `stripe.invoices.pay()` to ensure charges are attempted
   - ❌ Do NOT call `stripe.invoices.pay()` without `payment_method` parameter

3. **Race Condition Handling**:
   - If DB says `past_due` but Stripe invoice is `already_paid`:
   - ✅ Mark as `status: "skipped"` with `skipReason: "already_paid"`
   - ❌ Do NOT mark as failure

4. **Response Sanitization**:
   - Before logging to `InvoiceChargeLog.result`, remove:
     - Card details (PAN, last4 if sensitive)
     - Full payment method objects with card data
     - Any PCI-sensitive information
   - Keep: error codes, status, amounts, timestamps

5. **Mutex Auto-Expiry**:
   - `ChargeJobLock` document MUST include `lockedUntil: Date`
   - ✅ Set to `Date.now() + 30 minutes`
   - ❌ Do NOT create lock without expiry

## Testing

### Test Scenarios

1. No past_due invoices → Return empty results
2. Single invoice success → Charge succeeds, log created
3. Single invoice failure → Error logged, continue processing
4. Mixed batch → Some succeed, some fail, all logged
5. Already paid invoice → Skip with reason "already_paid"
6. No payment method → Skip with reason
7. User subscription status NOT "past_due" → Skip with reason
8. Rate limit → Return 429 with retry-after
9. Wrong confirmation → Return 400
10. Non-admin user → Return 401
11. Duplicate charge attempt within 24h → Skip (idempotency)
12. Missing payment method → Skip with reason "No payment method found on invoice"
13. Global rate limit → Return 429 (1 per 24h globally, disabled in development)
14. Development mode → Rate limiting bypassed for testing
15. Concurrent execution → Return 409 (if mutex lock implemented)

### Stripe Test Cards

- `4000 0000 0000 0341` - Authentication required
- `4000 0000 0000 9995` - Insufficient funds
- `4000 0000 0000 0002` - Card declined

## Performance Considerations

- Batch size: 15 invoices (balance speed vs rate limits)
- Delay: 500ms between batches
- Timeout: 30 seconds per invoice attempt
- Max invoices: 100 per request (Stripe's list limit)
- Database query: Batch query users for O(1) lookup
- Future: Consider background job for 100+ invoices

## Best Practices

1. **Preview Mode**: Consider showing list of invoices before charging (optional)
2. **Customer Communication**: Notify customers when charges are attempted (recommended but not implemented)
3. **Monitoring**: Monitor `InvoiceChargeLog` for patterns and issues
4. **Analytics**: Use status + attemptedAt indexes for reporting
5. **Global Rate Limit**: Respect the 24h global limit to prevent Radar spikes

## Troubleshooting

### Common Issues

1. **Rate Limited**: Wait for the retry-after period
2. **Lock Conflict**: Another admin is running the operation, wait for completion
3. **No Eligible Invoices**: Check that users have `subscription.status === "past_due"` in database
4. **All Skipped**: Verify invoice filtering criteria are met
5. **High Failure Rate**: Check Stripe dashboard for decline patterns
6. **Mass "This invoice can no longer be paid" failures**: these are stranded invoices (see "Stranded invoices in the bulk run" above). Since 2026-07-19 the bulk run auto-recovers the retries-EXHAUSTED ones (`next_payment_attempt == null`). A residual few can still surface where Stripe **still has a retry scheduled** (`next_payment_attempt` set) but the current PaymentIntent is unpayable — since 2026-07-20 those are recorded as **skipped → "Awaiting Stripe retry"** with an accurate message (Stripe auto-retries them), not as scary failures. If you see the raw "consider voiding" text at scale again, verify `decideBulkChargeAction` is applied, `payments` is expanded, and the reclassification branch in `payOpenInvoiceAsPastDueAdmin` is intact.

### Skip breakdown buckets

The run's SKIP BREAKDOWN (admin run-detail drawer) names each skip reason instead of dumping them into "Other":

| Bucket | Meaning | Actionable? |
|---|---|---|
| **No held draft (stranded)** | Past-due member whose failed-renewal invoice is dead AND whose next cycle hasn't minted a re-billable draft yet | **Largely superseded (2026-07-21):** the run now re-bills these members via the current-cycle mint instead of skipping, so this bucket is mostly historical. Any residual rows self-heal at the member's next billing date. |
| **Awaiting Stripe retry** | `invoices.pay()` had no payable attempt now, but Stripe has a scheduled retry | No action — Stripe auto-retries on its schedule |
| Recently attempted (6h) | Charged within the 6h per-invoice window | Re-runnable after the window |
| No longer past due | Late re-check found the member recovered mid-run | None (already paid another way) |
| Already paid / Missing payment method | Self-explanatory | — |

The buckets are derived by the shared pure classifier `src/utils/admin/chargeSkipReasons.ts` (`classifySkipBucketFromMessage`), used by the server totals aggregator AND the drawer (which recomputes the breakdown client-side from the run's rows, so even historical runs whose persisted totals predate these buckets display correctly). Regression-guarded by `npm run test:past-due-history` (`chargeSkipReasons.test.ts` + `charge-past-due-totals.test.ts`).

### Logs

Check `InvoiceChargeLog` collection for:
- All charge attempts
- Error codes and messages
- Retry eligibility (`canRetryAt`)
- Admin who triggered charges

## Post-Recovery Reanchor

A successful charge via this tool emits `invoice.payment_succeeded`, which triggers the **past-due reanchor** flow: future renewals are moved to the recovery-payment date (AEST), clamping days 25/26/27 → 24. No changes to this endpoint were needed — the reanchor runs from the single webhook hook. See [PAST_DUE_REANCHOR.md](./PAST_DUE_REANCHOR.md).

## Related Documentation

- [Failed Renewal Pay Now](./FAILED_RENEWAL_PAY_NOW.md) - User-facing payment retry feature
- [Past-Due Reanchor](./PAST_DUE_REANCHOR.md) - Future-renewal reanchor on recovery
- Stripe Invoice API: https://stripe.com/docs/api/invoices
- Stripe Idempotency: https://stripe.com/docs/api/idempotent_requests
