# Billing-Stripe — API

Full inventory of routes under `/api/stripe/**` and `/api/invoice/**`. Auth and exact request/response shapes are flagged TODO where not yet read; **the route handlers should be the source of truth, not this doc** — refresh when handlers change.

## Routes — Stripe surface

### Subscription lifecycle

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/stripe/create-subscription` | New user signup; uses anchor helper for 25th-27th joiners |
| POST | `/api/stripe/create-subscription-existing-user` | Existing user (re-)subscribing. On the resubscribe branch (gated by the same `isResubscribeForMetadata` boolean that decides `subscription.metadata.isResubscribe`), sets `existingUser.subscription.lastResubscribedAt = new Date()` immediately before the primary `save()` (with `markModified("subscription")`). UX-only timestamp consumed by `/api/payment-status/[paymentIntentId]` for the success-page carry-over banner; never fires on initial subscribe, upgrade, or renewal. |
| POST | `/api/stripe/renew-subscription` | User retry on a failed renewal invoice; clears pause-collection on success |
| POST | `/api/stripe/cancel-subscription` | User-facing cancel (delegates to subscription/CancelSubscriptionService) |
| POST | `/api/stripe/switch-tier-past-due` | Past-due tier-switch **teardown** (no body): cancels the caller's `past_due` sub immediately + voids its open/uncollectible renewal invoice(s), then the client opens the ordinary subscribe flow for the new tier. 409 `NOT_PAST_DUE` if the sub isn't past-due. Delegates to `subscription/switchTierPastDue.abandonPastDueForTierSwitch`. See BUSINESS.md §10i + subscription/gotchas.md. |
| POST | `/api/stripe/cancel-incomplete-subscription` | Clean up stuck `incomplete` checkout |
| POST | `/api/stripe/confirm-subscription-payment` | Confirm a Payment Intent for a created subscription |
| POST | `/api/stripe/upgrade-subscription-payment` | Upgrade flow — proration via Payment Intent |
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
| POST | `/api/stripe/create-one-time-purchase` | Mini-draw / one-time pack purchase (new user) |
| POST | `/api/stripe/create-one-time-purchase-existing-user` | Same, for existing user |
| POST | `/api/stripe/pay-failed-invoice` | User pays a specific failed renewal invoice |
| POST | `/api/stripe/webhook` | **THE** webhook receiver; verifies signature, dedupes via `ProcessedStripeEvent`, dispatches |

### Invoice surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/invoice/finalize` | Force-finalize a draft invoice (admin/operational) |

> _TODO: read each handler to fill in exact auth requirements, request/response shapes, and error codes. Currently the routes are inventoried but not fully spec-documented._

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
