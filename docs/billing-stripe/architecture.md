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
        ├── customer.subscription.created       → write User.subscription, write MembershipStatusHistory
        ├── customer.subscription.updated       → reconcile Mongo state with Stripe
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
