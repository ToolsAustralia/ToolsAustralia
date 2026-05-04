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
6. Time-based DB idempotency: 24h since last attempt on the invoice
7. Stripe idempotency keys: `admin-charge-${invoiceId}`
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

**The override.** Adding the card fingerprint to Stripe's built-in `allow_card_fingerprint` Radar value list bypasses **both** Radar fraud rules **and** the issuer-directed auto-block. The dashboard's "Add to allow list" button uses this same API (`radar.valueListItems.create`). This is the only programmatic escape hatch.

**Webhook signal.** A blocked PI surfaces as `payment_intent.payment_failed` whose `charge.outcome.type === "blocked"` **or** `charge.outcome.network_status === "declined_by_network"`. This signal is what distinguishes "Stripe is blocking future attempts on this card" from a normal one-off decline. The `payment_intent.payment_failed` branch in the webhook examines `outcome` to decide whether to call `AllowlistService.evaluateAndApply()`.

**Best-effort branch.** The auto-allowlist call in our webhook is wrapped in `try/catch` and swallows errors via `webhookLog("error", ...)`. This is intentional: if we re-threw, Stripe would retry the entire `payment_intent.payment_failed` event and re-run the (already-completed) `handlePaymentFailure` handler — re-pausing the sub, re-firing analytics, re-sending Klaviyo events. The trade-off is that allowlist-call failures need to be recovered through the admin bulk page (`/admin/blocked-transactions`), which lists all blocked candidates regardless of whether the webhook attempt succeeded.

**Filter rules.** We **never** auto-allowlist cards whose decline_code is `lost_card`, `stolen_card`, `pickup_card`, or `fraudulent` (real fraud signals — allowlisting would expose us to chargebacks). We also skip permanent-issue codes — `expired_card`, `incorrect_cvc`, `invalid_account`, `invalid_number`, `invalid_expiry_year`, `invalid_expiry_month` — because allowlisting them is pointless without customer action (the issuer will keep declining; Account Updater doesn't help most of these). We **only** allowlist if the user has at least one prior succeeded `PaymentEvent` (i.e. is a paying member, not a fraudster). Skipped decisions still write an `AllowlistAction` row with `reason: "filter_fraud_signal"`, `"filter_permanent_issue"`, or `"filter_not_member"` for audit. Admin can override any filter via the **"Allowlist with override"** button on `/admin/blocked-transactions`, which calls `/api/admin/allowlist/apply` with `allowOverride: true` and records `reason: "manual_admin_override"`.
