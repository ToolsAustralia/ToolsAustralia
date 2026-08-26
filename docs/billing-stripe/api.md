# Billing-Stripe — API

Full inventory of routes under `/api/stripe/**` and `/api/invoice/**`. Auth and exact request/response shapes are flagged TODO where not yet read; **the route handlers should be the source of truth, not this doc** — refresh when handlers change.

## Routes — Stripe surface

### Subscription lifecycle

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-subscription` | New user signup; uses anchor helper for 25th-27th joiners |
| POST | `/api/stripe/create-subscription-existing-user` | Existing user (re-)subscribing. On the resubscribe branch (gated by the same `isResubscribeForMetadata` boolean that decides `subscription.metadata.isResubscribe`), sets `existingUser.subscription.lastResubscribedAt = new Date()` immediately before the primary `save()` (with `markModified("subscription")`). UX-only timestamp consumed by `/api/payment-status/[paymentIntentId]` for the success-page carry-over banner; never fires on initial subscribe, upgrade, or renewal. |
| POST | `/api/stripe/renew-subscription` | User retry on a failed renewal invoice; clears pause-collection on success. The `retry_payment` branch also **recovers a stranded** invoice (void + finalize the held draft via `prepareRecoveredCycleInvoice` under the `RecoveryClaim` lock) and returns the finalized draft's PI for client confirmation, instead of blindly paying `latest_invoice`. The **`no_held_draft` cohort now MINTS** a fresh current cycle on the member's ENTERED card (set as the sub + customer default first, then `mintCurrentCycleInvoice` with `skipClaim: true` since the claim is held) instead of falling through to the legacy `invoices.pay()` that Stripe rejects for a stranded invoice — off_session, so a 3DS/SCA card declines to a member-safe 400. Card declines thrown by `invoices.pay` return the 400 Payment-failed shape (see [§ Thrown card declines](#thrown-card-declines--400-payment-failed)) instead of the former generic 500; the excessive-retry 400 and `requiresPaymentConfirmation` paths before it are unchanged. |
| POST | `/api/stripe/cancel-subscription` | User-facing cancel (delegates to subscription/CancelSubscriptionService) |
| POST | `/api/stripe/switch-tier-past-due` | Past-due tier-switch **teardown** (no body): cancels the caller's `past_due` sub immediately + voids its open/uncollectible renewal invoice(s), then the client opens the ordinary subscribe flow for the new tier. Accepts `past_due` **or** `canceled` (idempotent retry); the service reconciles against LIVE Stripe status — refuses to cancel a recovered sub (**409 `SUBSCRIPTION_RECOVERED`**), no-ops an already-gone one. 409 `NOT_PAST_DUE` otherwise. **Freeze-gated** (`enforceMajorDrawOpenForNewPurchasesOr403` → 403) like the resubscribe it hands off to, so a major-draw freeze can't strand a member mid-teardown. Delegates to `subscription/switchTierPastDue.abandonPastDueForTierSwitch`. See BUSINESS.md §10i + subscription/gotchas.md § Reconcile against LIVE Stripe status. |
| POST | `/api/stripe/cancel-incomplete-subscription` | Clean up stuck `incomplete` checkout |
| POST | `/api/stripe/confirm-subscription-payment` | Confirm a Payment Intent for a created subscription |
| POST | `/api/stripe/upgrade-subscription-payment` | Upgrade flow — immediate full-price charge (`proration_behavior: "none"` + `billing_cycle_anchor: "now"`, `payment_behavior: "error_if_incomplete"`, clears `cancel_at_period_end`); returns the PI for client confirmation when needed. **Trial-aware (2026-08-24):** an anchor-24 (`trialing`) member gets `trial_end: "now"` in the same call so the anchor cannot veto the charge, then a second `subscriptions.update` re-applies their `trial_end` for the next cycle — after the `latest_invoice`/proration reads, and both success checks accept `trialing` ([§ Trial-aware upgrade](./gotchas.md)). Thrown card declines → 400 Payment-failed shape ([§ Thrown card declines](#thrown-card-declines--400-payment-failed)) |
| POST | `/api/stripe/downgrade-subscription` | Downgrade flow — preserves old benefits via `User.subscription.previousSubscription` |
| POST | `/api/stripe/update-auto-renew` | Toggle `cancel_at_period_end` |

### Payment intent / setup intent

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-payment-intent` | One-time charge intent |
| POST | `/api/stripe/create-setup-intent` | Save card without charging |
| POST | `/api/stripe/check-setup-intent-status` | Poll setup-intent status |
| POST | `/api/stripe/cancel-payment-intent` | Cancel a stuck PI |
| POST | `/api/stripe/verify-payment-intent` | Read-only verification of PI state |
| POST | `/api/stripe/verify-payment-complete` | Higher-level "did this purchase succeed?" check |
| POST | `/api/stripe/analyze-payment-intent` | Diagnostics endpoint (dev/support) |

### Saved payment methods

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stripe/payment-methods` | List user's saved methods (Stripe IDs only) |
| DELETE | `/api/stripe/payment-methods/[id]` | Remove a saved method |
| POST | `/api/stripe/payment-methods/[id]/default` | Set default method |
| PUT | `/api/stripe/payment-intent/[id]/payment-method` | Attach method to existing PI |
| POST | `/api/stripe/subscription/update-payment-method` | Change the card on an active sub |

### Other

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-one-time-purchase` | One-time / membership pack purchase (new user). **Not** mini-draw — see below. Thrown confirm-time card declines → 400 Payment-failed shape ([§ Thrown card declines](#thrown-card-declines--400-payment-failed)) |
| POST | `/api/stripe/create-one-time-purchase-existing-user` | Same, for existing user. Thrown confirm-time card declines → same 400 shape |

Both one-time routes **reject mini-draw catalogue ids** (`mini-pack-1..8`, `additional-*-pack-mini`) with **400 `{ error, code: "MINI_DRAW_PACKAGE_WRONG_ENDPOINT" }`** before any Stripe call. They have no draw in scope, so they cannot stamp the `miniDrawId` the webhook needs to grant — accepting one captured money that could never be honoured. Mini packs go through `POST /api/mini-draw/purchase`. See [gotchas](./gotchas.md).
| POST | `/api/stripe/pay-failed-invoice` | User pays a specific failed renewal invoice. **Stranded (open-but-retry-exhausted) invoices are auto-recovered:** the route voids the dead invoice + finalizes the held cycle draft via [`prepareRecoveredCycleInvoice`](../../src/services/subscription/prepareRecoveredCycleInvoice.ts) (under a `RecoveryClaim` lock) and returns the finalized draft's PaymentIntent `client_secret` through the existing `requiresPaymentConfirmation` shape — no more `invoice_not_payable` dead-end. **`no_held_draft` members now MINT** a fresh current cycle on their default card via [`mintCurrentCycleInvoice`](../../src/services/subscription/mintCurrentCycleInvoice.ts) (`skipClaim: true`; outcome mapped by [`classifyMemberResolveMintOutcome`](../../src/utils/payment/recovery/member-resolve-mint-policy.ts)): success reactivates; a decline returns `requiresNewCardPreflight` (add a card → retry collects on the new default via the normal open-invoice path — no re-mint, the failed card isn't re-charged); a scheduled-to-cancel / mint-error state is terminal. A declined mint fires "Subscription Renewal Failed" (webhook `isRebill`). Never creates a manual invoice (`billing_reason` stays `subscription_cycle`/`subscription_update`). Probe: `npm run stripe:probe-member-resolve-mint`. |
| POST | `/api/stripe/force-charge-overdue` | Member self-serve off_session charge of the current cycle via `forceChargeCurrentCycle` (passes `mintCurrentCycleIfNoDraft: true`). **Stranded invoices are recovered** (void + finalize the held draft via `prepareRecoveredCycleInvoice` under the `RecoveryClaim` lock, then off_session-pay the finalized draft on its per-attempt idempotency key). The **`no_held_draft` cohort now MINTS** a fresh current cycle on the default card ([`mintCurrentCycleInvoice`](../../src/services/subscription/mintCurrentCycleInvoice.ts)) instead of the old 409 dead-end — the mint acquires its own `RecoveryClaim` (none is held at that point) and its result maps onto the existing force-charge reasons via `mapMintFailureToForceChargeReason` (decline → `pay_failed`; already-collected → `period_already_paid`; canceled/scheduled-to-cancel → `subscription_inactive`). The **admin** force-charge route (`/api/admin/users/[id]/force-charge`) passes the same flag. |
| POST | `/api/stripe/webhook` | **THE** webhook receiver; verifies signature, dedupes via `ProcessedStripeEvent`, dispatches |

> _TODO: read each handler to fill in exact auth requirements, request/response shapes, and error codes. Currently the routes are inventoried but not fully spec-documented._

## Cron routes owned by this domain

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/cron/process-stripe-webhook-queue` | Bearer `CRON_SECRET` (**fails open** when unset) | Sweeps orphans + dispatches due queue rows — see [STRIPE_WEBHOOK_QUEUE.md](./STRIPE_WEBHOOK_QUEUE.md) |
| GET | `/api/cron/reconcile-blocked-transactions` | Bearer `CRON_SECRET` | 48h `BlockedTransaction` vs Stripe drift + self-heal — see [architecture.md](./architecture.md#reconciliation-cron--phase-d) |
| GET | `/api/cron/reconcile-renewal-grants` | Bearer `CRON_SECRET` (**fails CLOSED**) | `40 3 * * *`. Detects renewals Stripe was paid for whose entry grant never landed, plus every `dead` webhook-queue row. Read-only — no Mongo write, no Stripe call. See [architecture.md](./architecture.md#renewal-grant-reconciliation--the-paid-but-not-granted-detector-2026-08-24) |

### `GET /api/cron/reconcile-renewal-grants`

`200` response:

```jsonc
{
  "success": true,
  "since": "2026-08-21T19:40:00.000Z",   // now − 8h − 48h  (window is on updatedAt)
  "until": "2026-08-23T19:40:00.000Z",   // now − 8h (settle margin)
  "ungranted": [
    { "stripeInvoiceId": "in_…", "userId": "…", "amountPaidCents": 2000, "chargedAt": "…" }
  ],
  "ungrantedCount": 1,
  "ungrantedCents": 2000,
  "dead": [
    { "eventId": "evt_…", "type": "invoice.payment_succeeded", "attempts": 6, "lastError": "…", "diedAt": "…" }
  ],
  "deadCount": 1,
  "durationMs": 963
}
```

`401 { "error": "Unauthorized" }` when `CRON_SECRET` is unset **or** the Bearer token does not match. `500 { "success": false, "error": … }` on an unexpected failure.

The service behind it, [`renewalGrantReconciler`](../../src/services/reconciliation/renewalGrantReconciler.ts), also exports `findUngrantedRenewals(since, until)` and `findDeadWebhookEvents(limit?)` for ops scripts that need an arbitrary window — use those rather than re-deriving the join, so there is only ever one definition of "ungranted".

## Cross-domain admin routes

These live under `/api/admin/**` (in the [admin](../admin/) domain) but are tightly coupled to Stripe:

| Method | Path | Domain | Purpose |
|---|---|---|---|
| POST | `/api/admin/users/[id]/cancel-subscription` | admin | Admin cancel — same service as user route |
| POST | `/api/admin/users/[id]/charge-past-due` | admin | Single past-due retry |
| POST | `/api/admin/invoices/charge-past-due` | admin | Bulk past-due retry — see [gotchas](./gotchas.md#charge-past-due-runbook) |
| POST | `/api/admin/users/[id]/payment-events/[eventId]/reverse` | admin | Manual refund-reversal replay |
| GET | `/api/admin/payment-events` | admin | List ledger rows for support |

### Allowlist admin routes

Backing the `/admin/blocked-transactions` page. All four require `role === "admin"` and delegate to the singleton `AllowlistService` ([architecture.md](./architecture.md#service-inventory--allowlistservice)). Background on the underlying mechanism: see [gotchas](./gotchas.md#stripe-issuer-directed-auto-block--allowlist-override). The API path keeps the legacy `blocked-cards` segment because it predates the rename — only the admin URL slug changed.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/allowlist/blocked-cards` | List blocked-PI candidates for the bulk page |
| POST | `/api/admin/allowlist/apply` | Bulk-allowlist selected rows |
| POST | `/api/admin/allowlist/reverse` | Remove a previously-allowlisted fingerprint |
| GET | `/api/admin/allowlist/actions` | Recent allowlist decisions — feeds the "Recently allowlisted" widget |
| GET | `/api/admin/allowlist/stats` | All-time count of cards currently on the Stripe allowlist |

#### `GET /api/admin/allowlist/blocked-cards`

Query params:
- `dateFrom` — ISO timestamp (inclusive)
- `dateTo` — ISO timestamp (inclusive)
- `email` — case-insensitive substring match on `customerEmail`. Omitted = no filter.
- `declineCodes` — comma-separated list of decline codes (e.g. `lost_card,generic_decline`). Omitted = no filter.
- `eligibility` — comma-separated list of eligibility kinds: `auto_eligible`, `already_allowlisted`, `fraud_signal`, `permanent_issue`, `not_member`. Omitted = no filter.
- `cursor` — opaque cursor for the next page. Omitted on first page; pass back the previous response's `nextCursor`.
- `limit` — page size, 1–100, default 50.

Response: `{ success, rows: BlockedRow[], nextCursor: string | null, total: number }`. Reads from the `blockedtransactions` collection — see [`listBlocked`](./architecture.md#listblocked-mongo-backed-read-path). Per-page cost is bounded and independent of the date window. Each `BlockedRow` includes a resolved `userId` (or `null` for guests).

Auth: admin.

#### `POST /api/admin/allowlist/apply`

Body: `{ rows: EvalInput[], allowOverride: boolean }`. Iterates `rows` and calls `AllowlistService.apply(row, source: "admin_bulk")` for each; when `allowOverride` is true the filter rules are bypassed (records `reason: "manual_admin_override"`). Returns `{ success, added, skipped, errors }`. Auth: admin.

#### `POST /api/admin/allowlist/reverse`

Body: `{ actionId: string }` (the `_id` of the original `AllowlistAction` `added` row). Calls `AllowlistService.reverse()`, which removes the fingerprint from Stripe's value list and writes a new `removed` row. Returns `{ success, action }`. Auth: admin.

#### `GET /api/admin/allowlist/actions`

Query params:
- `limit` — default `50`, max `200`
- `action` — `added | skipped | removed | all`

Returns `{ success, actions: AllowlistAction[] }`. Auth: admin. Used by the "Recently allowlisted" widget on `/admin/blocked-transactions`.

#### `GET /api/admin/allowlist/stats`

No params. Returns `{ success, totalActiveAllowlisted: number }` — the count of card fingerprints whose most-recent `AllowlistAction` is `"added"`. Drives the "Total on allowlist" metric on `/admin/blocked-transactions`. Stripe's `card_fingerprint_allowlist` Radar value list is the live allowlist; this count is an audit-log approximation. Auth: admin.

## Consistent response shape

Per CLAUDE.md route conventions, all `/api/stripe/**` handlers should return one of:

```json
{ "success": true, "data": { ... } }
```

```json
{ "success": false, "error": "<message>", "code": "<machine-readable>" }
```

When wrapping a `SubscriptionReferenceError`, map:
- `NO_ACTIVE_SUBSCRIPTION` → 400
- `STRIPE_RETRYABLE` → 503

When a Stripe SDK error reaches the handler, classify before responding (see [patterns.md](./patterns.md)).

### Thrown card declines → 400 "Payment failed"

With `confirm: true`, `stripe.paymentIntents.create` — and likewise `stripe.invoices.pay` and `stripe.subscriptions.update(payment_behavior: "error_if_incomplete")` — **throw** a `StripeCardError` on a confirm-time decline instead of resolving with a failed intent. Route catch blocks detect these via [`isStripeCardError()`](../../src/utils/payment/stripe/payment-error-detection.ts) and return the sibling 400 shape (originated by `create-subscription-existing-user`):

```json
{
  "success": false,
  "error": "Payment failed",
  "details": "<Stripe's decline message>",
  "code": "<stripe error code, when present>",
  "decline_code": "<issuer decline code, when present>",
  "type": "<stripe error type, when present>",
  "requiresDifferentPaymentMethod": true,
  "failureReason": "<analyzer reason>"
}
```

`requiresDifferentPaymentMethod` / `failureReason` appear only when `analyzeStripePayErrorForExcessiveRetry` flags the card. Implementations (2026-07-16, previously these declines fell into generic catch-alls and returned HTTP 500):

- `create-one-time-purchase-existing-user` — card-error branch in the outer catch, before the `instanceof Error` 500 branch; runs the excessive-retry analyzer. The pre-existing 400 branch reading `paymentIntent.last_payment_error` only fires when `create()` *resolves* with a non-succeeded PI — it never sees thrown declines.
- `create-one-time-purchase` — same branch, after the existing `autoLogPaymentErrorServer` call (error logging unchanged); echoes `details`/`code`/`decline_code` (no `type` field in this route's body) which the old 500 didn't.
- `upgrade-subscription-payment` — same branch in the outer catch (declines from `subscriptions.update` with `payment_behavior: "error_if_incomplete"`); runs the excessive-retry analyzer.
- `renew-subscription` — in the inner `invoices.pay` catch, immediately before the final `throw paymentError`; no analyzer fields here (the dedicated excessive-retry 400 path above it already returns `requiresDifferentPaymentMethod`).
- `create-subscription-existing-user` — the original shape (via `rejectAndLog`; may also include `correlationId`).

Non-card Stripe errors (e.g. `StripeInvalidRequestError`) and non-Stripe errors keep their existing 500 behavior. `ErrorReport` auto-logging is unchanged — card declines are still logged, severity `medium` via the expected-decline classifier.
