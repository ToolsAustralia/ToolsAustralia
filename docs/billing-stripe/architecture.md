# Billing-Stripe — Architecture

## Position in the stack

This domain is the **Stripe boundary layer**. It owns:
- The Stripe SDK clients (`lib/stripe.ts` server, `lib/stripe-client.ts` browser).
- The webhook receiver — single ingestion point for all Stripe events.
- The `PaymentEvent` ledger — append-only event log of every billing-relevant action.
- The `/api/stripe/**` and `/api/invoice/**` route handlers (~25 routes) that wrap Stripe API calls.

Other domains (subscription, payment, rewards) consume this layer's helpers and read the ledger; they don't talk to Stripe directly.

## Webhook flow

```
Stripe → POST /api/stripe/webhook
                  │
                  ▼
        verify signature
                  │
                  ▼
   ProcessedStripeEvent.findOne(eventId) ──► dedupe (return 200 if seen)
                  │
                  ▼
        switch (event.type)
        ├── customer.subscription.created       → write User.subscription, write MembershipStatusHistory active/trialing
        ├── customer.subscription.updated       → reconcile Mongo state with Stripe; write MembershipStatusHistory active/trialing on non-active→active recovery
        ├── customer.subscription.deleted       → fire cancellation analytics events (single source!)
        ├── invoice.payment_succeeded           → resumeAfterSuccessfulRenewalPayment, processPaymentBenefits, write PaymentEvent BenefitsGranted
        ├── invoice.payment_failed              → pauseAfterRenewalFailure, write MembershipStatusHistory past_due
        ├── invoice.finalized                   → ensure MembershipRenewalCycle row exists
        ├── charge.refunded                     → processRefundReversal (full) or write RefundPartial (partial)
        ├── charge.dispute.closed (lost)        → reverse benefits (treat as full refund)
        └── charge.dispute.funds_withdrawn      → reverse benefits (provisional)
                  │
                  ▼
        ProcessedStripeEvent.create(eventId) ──► commit dedupe lock
                  │
                  ▼
        return 200
```

Implementation: [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts).

## Ledger model — `PaymentEvent`

Every billing action becomes a row in `PaymentEvent` with one of these `type`s:

| `type` | Written when | Holds in `data` |
|---|---|---|
| `BenefitsGranted` | Successful payment for membership / one-time / mini-draw | `grants` ledger (entries, packageId, lastMonthDelta, rewardsPoints, milestoneIds, promoIds...) |
| `RefundProcessed` | Full refund completed AND benefits reversed | reverse-grants summary, `reversalIssues[]` for any non-blocking failures |
| `RefundPartial` | Partial refund detected (no reversal performed) | `status: "partial-skipped"` for admin visibility |
| _(others)_ | _TODO: enumerate full type set in next refresh_ |

The ledger is the **single source of truth** for "what benefits were granted." Refunds replay the ledger backward — see [rules](./rules.md#ledger-symmetry).

## Refund reversal architecture

(Migrated from former `docs/REFUND_REVERSAL.md`.)

### Principle

**Ledger symmetry:** every side effect of a successful payment is recorded on the `BenefitsGranted` `PaymentEvent` (`data.grants`). A full refund replays that ledger **backward** (`reverseLedgerBenefits` → `RefundProcessed`), so we don't re-derive benefits from package type alone.

### Code paths

| Step | Location |
|---|---|
| Grant | [src/utils/payment/payment-processing.ts](../../src/utils/payment/payment-processing.ts) — `grantBenefits` / `processPaymentBenefits` updates `data.grants` |
| Reverse | [src/utils/payment/refund-processing.ts](../../src/utils/payment/refund-processing.ts) — `processRefundReversal` |
| Ledger replay | [src/utils/payment/refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts) — `reverseLedgerBenefits` orchestrates `src/utils/payment/reversers/` |
| Webhook | [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) — `charge.refunded`, `charge.dispute.closed` (lost), `charge.dispute.funds_withdrawn` |
| Admin replay | `POST /api/admin/users/[id]/payment-events/[eventId]/reverse` → `replayRefundReversalForBenefitsGrantedEvent` |

### Invariants

1. **Full refund only** reverses benefits. Partial refunds → `RefundPartial` row with `status: "partial-skipped"` (admin-visible).
2. **`RefundProcessed-<paymentIntentId>`** (same key as `BenefitsGranted`, e.g. `invoice_in_…` for subscriptions) is the idempotency lock.
3. **`rewardsPoints`** are always decremented from the ledger when present.
4. **`subscription.lastMonthAccumulatedEntries`** atomic `$inc` by `-grants.lastMonthDelta`, `$max` 0, then `$unset` when no non-refunded membership `BenefitsGranted` remain (`countNonRefundedMembershipGrants`).
5. **Promo / campaign / milestone** rollback failures append to `RefundProcessed.data.reversalIssues` — they don't block core user/draw updates.

### Klaviyo

After DB writes + 500ms barrier, `trackRefundedOrder` and `ensureUserProfileSynced` run; failures → `reversalIssues` entry `klaviyo-sync`.

## Anchor billing — 24th of month

(Detail in [subscription/architecture.md](../subscription/architecture.md#anchor-billing-day) and [subscription/rules.md](../subscription/rules.md#billing-anchor-24th).)

The helper `getSubscriptionCreateParamsForAnchor(joinDate)` lives in [src/utils/billing/anchor-billing.ts](../../src/utils/billing/anchor-billing.ts) and is consumed by:
- `/api/stripe/create-subscription/route.ts`
- `/api/stripe/create-subscription-existing-user/route.ts`
- `/api/stripe/renew-subscription/route.ts`

Migration script: `scripts/migrate-anchor-billing-24.ts` (`npm run migrate:anchor-billing-24:dry` for dry-run).

## Service inventory — `AllowlistService`

[src/services/allowlist/AllowlistService.ts](../../src/services/allowlist/AllowlistService.ts) gates **auto-allowlisting** of cards that Stripe has issuer-directed-blocked, and exposes the bulk admin operations (apply / reverse / read) backing `/admin/blocked-transactions`.

**Three callers:**
1. **Webhook** — the `payment_intent.payment_failed` branch in [src/app/api/stripe/webhook/route.ts](../../src/app/api/stripe/webhook/route.ts) calls `service.evaluateAndApply()` best-effort when the failed PI's charge looks blocked (see [gotchas](./gotchas.md#stripe-issuer-directed-auto-block--allowlist-override)).
2. **Admin bulk page** — `/admin/blocked-transactions` lists candidates and POSTs the selected rows to `/api/admin/allowlist/apply` (`source: "admin_bulk"`). Each row also has a per-row "Allowlist" button that calls the same endpoint with a single-row payload.
3. **Admin reverse button** — same page; `POST /api/admin/allowlist/reverse` removes a previously-allowlisted fingerprint.

**Constructor DI** — `{ repo: AllowlistRepository, stripeRadar: Stripe["radar"], stripeClient?: Stripe }`. The singleton at [src/services/allowlist/index.ts](../../src/services/allowlist/index.ts) wires the real Stripe client + `MongoAllowlistRepository`; tests inject fakes.

**Filter rule** — never auto-allowlist if the decline_code ∈ `{lost_card, stolen_card, pickup_card, fraudulent}` (real fraud signals), or ∈ `{expired_card, incorrect_cvc, invalid_account, invalid_number, invalid_expiry_year, invalid_expiry_month}` (permanent / customer-action-required issues), or no User can be resolved from the customer, or the user has zero successful `PaymentEvent` rows. Skip reasons recorded as `filter_fraud_signal`, `filter_permanent_issue`, or `filter_not_member` respectively. Admin override is available via the bulk page button.

**Source-of-truth split** — Stripe's `allow_card_fingerprint` Radar value list **is** the live allowlist; our `AllowlistAction` collection is the audit log of decisions (added / skipped / removed) and is never assumed to mirror Stripe's value-list state.

**Webhook dual-write for blocked PIs** — alongside the allowlist eligibility check, the `payment_intent.payment_failed` branch also persists the blocked PI to the [BlockedTransaction](./models.md#blockedtransaction) collection via `upsertBlockedTransaction()` from [src/services/allowlist/blockedTransactionRepo.ts](../../src/services/allowlist/blockedTransactionRepo.ts). Both writes are best-effort and wrapped in *independent* try/catch blocks so a failure in one cannot block the other. The persisted rows back the planned read-path migration for the admin `/admin/blocked-transactions` page (Phase C — see [gotchas](./gotchas.md#blocked-cards-route-paginates-every-pi)). The shared `buildBlockedTransactionRecord()` projector is reused by [scripts/backfill-blocked-transactions.ts](../../scripts/backfill-blocked-transactions.ts) so historical and live rows have identical shape.
