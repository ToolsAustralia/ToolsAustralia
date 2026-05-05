# Billing-Stripe — Gotchas

## Charge past-due — runbook

(Migrated from former `docs/CHARGE_PAST_DUE_CUSTOMERS.md`.)

### Multi-layer protection on the bulk endpoint

`POST /api/admin/invoices/charge-past-due`:

1. Admin-only (`role === "admin"`)
2. Per-admin rate limit: 1 / 5 minutes (disabled in dev)
3. Global rate limit: 1 / 24 hours (prevents Stripe Radar spikes; disabled in dev)
4. Confirmation: must POST `{ "confirmation": "CHARGE" }` exactly
5. Optional global mutex: `ChargeJobLock` (auto-expiry 30 minutes)
6. Time-based DB idempotency: 24h since last `InvoiceChargeLog.attemptedAt` on the invoice — enforced inside [`payOpenInvoiceAsPastDueAdmin`](../../src/server/admin/chargePastDueShared.ts) so both the bulk and per-user (`POST /api/admin/users/[id]/charge-past-due`) routes inherit it. Skipped attempts write a `skipped` log row with `skipReason: "recently_attempted"`.
7. Stripe idempotency keys: `admin-charge-${invoiceId}` — passed as the third arg to `stripe.invoices.pay`. Stripe caches the response for 24h, which matches the DB window: by the time a legitimate next-day retry runs, both have cleared.
8. DB status verification: only invoices whose user has `subscription.status === "past_due"`

### Invoice filter — only charge if ALL true

- Stripe invoice status `"open"` OR `"past_due"`
- Collection method `"charge_automatically"`
- `amount_remaining > 0`
- `default_payment_method` set
- `finalized_at` exists
- Not already paid/uncollectible/void
- User's DB subscription status is `"past_due"`
- Not charged in last 24 hours

### Race condition — DB says past_due, Stripe says paid

Mark as `status: "skipped"`, `skipReason: "already_paid"`. **Don't** treat as failure. This is just DB/Stripe desync that the next webhook will reconcile.

### Permanent-failure error codes (set 24h `canRetryAt`)

- `authentication_required` (3DS)
- `card_declined`
- `expired_card`
- `generic_decline`

`insufficient_funds` is treated as a *temporary* skip — bulk retry skips it, but user-driven retry can still attempt.

### Batch processing tuning

- 15 invoices per batch
- 500ms delay between batches
- `Promise.allSettled()` so individual failures don't kill the batch
- Max 100 invoices per request (Stripe list limit)

### Logs

`InvoiceChargeLog` has the full audit trail. Fields:
- ids: `invoiceId`, `customerId`, `userId`, `adminId`
- status: `success | failed | skipped`
- timing: `attemptedAt`, `canRetryAt`, `nextPaymentAttempt`
- payload: `result` (sanitised — no PAN, no full PM objects)

Indexes: compound unique on `(invoiceId, attemptedAt-day)`; lookups by customer / admin / status / canRetryAt.

## Payment Element migration / confirmation method

(Migrated stub — _TODO: read `docs/PAYMENT_ELEMENT_CONFIRMATION_METHOD_FIX.md` and `docs/SUBSCRIPTION_PAYMENT_ELEMENT_MIGRATION.md` and merge their content here in a refresh pass._)

Brief: the project migrated subscription checkout from confirmCardPayment-style flows to Stripe's Payment Element (single integration that handles cards + Apple Pay + Google Pay etc.). The migration affected `confirm-subscription-payment` and several create-subscription routes. Known fix: confirmation method must be set explicitly on the PI.

## Failed renewal — pay now flow

(Migrated stub — _TODO: read `docs/FAILED_RENEWAL_PAY_NOW.md` and merge here._)

Brief: `/api/stripe/renew-subscription` lets a user retry a failed renewal invoice. On success, `resumeAfterSuccessfulRenewalPayment()` runs — same code path as the webhook's success handler.

## Pause-collection orphans

See [subscription/gotchas.md](../subscription/gotchas.md#pause-collection-orphans) for the full failure modes. Summary: if a renewal succeeds but `resume` doesn't run, the sub stays paused, future cycles stay draft, no billing happens.

Audit: `npx tsx scripts/list-active-paused-subscriptions.ts --limit=200` (CSV to stdout, dry-run by default).

## Don't `expand: ['latest_payment_intent']`

On Stripe API `2025-05-28.basil`, this returns:

> `This property cannot be expanded (latest_payment_intent)`

Use `expand: ['payment_intent']` instead.

## Disputes

`charge.dispute.closed` with `status: "lost"` reverses benefits as a full refund — same path as `charge.refunded`. `charge.dispute.funds_withdrawn` reverses provisionally; if the dispute is later won, no automatic re-grant — admin must replay manually via `POST /api/admin/users/[id]/payment-events/[eventId]/...` _TODO: verify exact admin endpoint_.

## Webhook retries

Stripe retries failed deliveries with exponential backoff. The dedupe via `ProcessedStripeEvent` is what makes retries safe. If the dedupe row gets stuck (e.g. crash *between* writing the row and finishing work), the next retry will see the row and skip — manual intervention needed to actually replay. _TODO: document the recovery procedure for that case._

## Stripe issuer-directed auto-block + allowlist override

**The mechanism.** When the issuing bank declines a card with certain hard codes (`lost_card`, `stolen_card`, `pickup_card`, etc.), Stripe **auto-blocks future attempts** on that card — globally, across the entire Stripe account — to prevent decline-fee waste. The Stripe dashboard's activity log surfaces this as *"directed Stripe to block future attempts."* No further attempts on that card will reach the issuer; they fail at Stripe.

**The override.** Adding the card fingerprint to Stripe's built-in `card_fingerprint_allowlist` Radar value list bypasses **both** Radar fraud rules **and** the issuer-directed auto-block. The dashboard's "Add to allow list" button uses this same API (`radar.valueListItems.create`). This is the only programmatic escape hatch. Aliases on built-in Radar lists follow Stripe's `<entity>_<field>_<allowlist|blocklist>` convention; verify per-account with `npm run find:radar-lists`.

**Webhook signal.** A blocked PI surfaces as `payment_intent.payment_failed` whose `charge.outcome.type === "blocked"` **or** `charge.outcome.network_status === "declined_by_network"`. This signal is what distinguishes "Stripe is blocking future attempts on this card" from a normal one-off decline. The `payment_intent.payment_failed` branch in the webhook examines `outcome` to decide whether to call `AllowlistService.evaluateAndApply()`.

**Best-effort branch.** The auto-allowlist call in our webhook is wrapped in `try/catch` and swallows errors via `webhookLog("error", ...)`. This is intentional: if we re-threw, Stripe would retry the entire `payment_intent.payment_failed` event and re-run the (already-completed) `handlePaymentFailure` handler — re-pausing the sub, re-firing analytics, re-sending Klaviyo events. The trade-off is that allowlist-call failures need to be recovered through the admin bulk page (`/admin/blocked-transactions`), which lists all blocked candidates regardless of whether the webhook attempt succeeded.

**Filter rules.** We **never** auto-allowlist cards whose decline_code is `lost_card`, `stolen_card`, `pickup_card`, or `fraudulent` (real fraud signals — allowlisting would expose us to chargebacks). We also skip permanent-issue codes — `expired_card`, `incorrect_cvc`, `invalid_account`, `invalid_number`, `invalid_expiry_year`, `invalid_expiry_month` — because allowlisting them is pointless without customer action (the issuer will keep declining; Account Updater doesn't help most of these). We **only** allowlist if the user has at least one prior succeeded `PaymentEvent` (i.e. is a paying member, not a fraudster). Skipped decisions still write an `AllowlistAction` row with `reason: "filter_fraud_signal"`, `"filter_permanent_issue"`, or `"filter_not_member"` for audit. Admin can override any filter via the **"Allowlist with override"** button on `/admin/blocked-transactions`, which calls `/api/admin/allowlist/apply` with `allowOverride: true` and records `reason: "manual_admin_override"`.

## Blocked-cards route paginates every PI

`GET /api/admin/allowlist/blocked-cards` powers the `/admin/blocked-transactions` page. Stripe's `paymentIntents.list` does **not** accept an `outcome.type` filter, so the route paginates **every** PaymentIntent in the date window — successes included — and filters client-side by `outcome.type === "blocked"` or `outcome.network_status === "declined_by_network"`. On a busy account that's tens of thousands of records and easily blows Vercel's default 10–15 s function timeout (looks like "loading forever" in the UI).

> **Filter mismatch with Phase A/B.** The existing route's broad OR predicate captures every issuer-declined charge (most failed payments). Phase A/B persists a *narrower* set — only `outcome.type === "blocked"` — to match Stripe Dashboard's "Blocked" pill semantics. After Phase C ships and the admin page reads from Mongo, the displayed row count will drop accordingly (e.g. ~3225 → ~196 in a typical 5-week window) — that's the point. The webhook still calls `allowlist.apply()` on the broader set so existing auto-allowlist behavior is preserved; only the persisted dataset is tightened.

## Past-due bulk charge hitting blocked-card failures (Phase B.5 sweep)

The webhook auto-allowlist handler runs only on **new** `payment_intent.payment_failed` events. Cards that were Stripe-auto-blocked **before** the webhook was wired live have a `BlockedTransaction` row (after the Phase B backfill) but **no** corresponding `AllowlistAction` — and therefore are not in Stripe's `card_fingerprint_allowlist` list. Your "Charge Past Due Customers" runs against those cards and hits a wall of blocked-failure decline fees.

Fix: [scripts/sync-allowlist-from-blocked-transactions.ts](../../scripts/sync-allowlist-from-blocked-transactions.ts). For every unique card fingerprint in `BlockedTransaction`, calls `AllowlistService.apply(input, "admin_bulk", null)`. Eligible cards (paying members, no fraud-signal / no permanent-issue decline codes) get added to Stripe; ineligible ones get a recorded `skipped` `AllowlistAction` row — same outcome as if the webhook had fired originally.

Idempotent on the *added* path: the script pre-checks `AllowlistAction` for an active `added` row per fingerprint and short-circuits if found. Re-runs against already-allowlisted cards make zero Stripe calls and zero Mongo inserts. **Re-runs against previously-*skipped* fingerprints will re-evaluate** (which is intentional — a customer who wasn't a paying member at first-skip time may have since paid, flipping them eligible) and insert a fresh `skipped` row each time. Acceptable for occasional re-runs; don't loop the script.

```
npm run sync:allowlist-from-blocked:dry                    # eyeball the eligibility breakdown
npm run sync:allowlist-from-blocked                        # live: writes to Stripe Radar + Mongo
npm run sync:allowlist-from-blocked -- --no-limit          # if your account exceeds 1000 unique blocked fingerprints
```

This is a **one-time catch-up**, not a recurring job. Once it runs, the live webhook handles all subsequent blocks. Phase D's reconciliation cron can absorb the "any stragglers?" sweep going forward.

Three guardrails wrap this:

1. **Route `maxDuration = 60`** — gives the scan room to finish.
2. **Iterator cap: `MAX_PAYMENT_INTENTS_SCANNED = 2000`** in `AllowlistService.listBlockedFromStripe` — bounded worst case. When hit, the response carries `truncated: true` and the admin UI shows a banner asking the user to narrow the date range.
3. **`maxNetworkRetries: 2`** on the global Stripe client (`src/lib/stripe.ts`) — handles transient blips and 429s during the long pagination automatically.

If you ever notice the page truncating in normal use, the right next move is **not** to raise the cap — it's to switch the data source.

**Phase A (write side) is in place.** The Stripe webhook now persists every blocked PI to the [BlockedTransaction](./models.md#blockedtransaction) collection (best-effort, in its own try/catch so a Mongo write failure does not block the allowlist call that follows). All new blocked PIs are captured automatically.

**Phase B (backfill) is in place.** [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) imports historical data from Stripe using the Search API (`status:"failed"` query). Idempotent on PI id. Run once with a wide window (e.g. 90 days) and verify Mongo count vs. Stripe count for the same window. Always dry-run first:

```
npm run backfill:blocked-transactions:dry -- --from=2026-02-01 --to=2026-05-01 --limit=2000
npm run backfill:blocked-transactions     -- --from=2026-02-01 --to=2026-05-01
```

**Phase C (read flip) is in place — both backends coexist.** [`AllowlistService.listBlocked(filter, opts)`](./architecture.md#listblocked-mongo-backed-read-path) is the new Mongo-backed read path: cursor-paged over `BlockedTransaction`, with eligibility joins batched into a serial `User.find` followed by parallel `AllowlistAction.find` + `PaymentEvent.distinct`. The verdict logic was extracted to a pure `computeEligibility(doc, maps)` helper for testability (14 unit tests in `src/services/allowlist/__tests__/AllowlistService.test.ts` — 8 for verdict branches, 6 for the cursor codec).

The route at `GET /api/admin/allowlist/blocked-cards` now accepts `?source=stripe|mongo` (default **stripe** for safe rollout). Response envelopes differ — `{rows, truncated, scanned}` for stripe vs. `{rows, nextCursor, total}` for mongo — see [api.md](./api.md#get-apiadminallowlistblocked-cards). The admin UI (`useBlockedCards` hook → `BlockedTransactionsManagement`) hardcodes `?source=mongo` and renders "Showing X of Y" + a Load-more button instead of the truncation banner.

`listBlockedFromStripe` is intentionally **left intact** so a manual flip back to `?source=stripe` is one query-string away if the Mongo path misbehaves in production. Once the Mongo path bakes for ~2 weeks, drop `MAX_PAYMENT_INTENTS_SCANNED`, `listBlockedFromStripe`, the truncation banner code-path, and `maxDuration: 60` — they all become dead weight then.
