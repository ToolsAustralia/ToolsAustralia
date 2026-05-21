# Refund reversal (architecture)

## Principle

**Ledger symmetry:** every side effect of a successful payment is recorded on the `BenefitsGranted` `PaymentEvent` (`data.grants`). A full refund replays that ledger **backward** (`reverseLedgerBenefits` → `RefundProcessed`), so we do not re-derive benefits from package type alone.

## Main code paths

| Step | Location |
|------|-----------|
| Grant | `src/utils/payment/payment-processing.ts` — `grantBenefits` / `processPaymentBenefits` updates `data.grants` |
| Reverse | `src/utils/payment/refund-processing.ts` — `processRefundReversal` |
| Ledger replay | `src/utils/payment/refund-ledger-reversal.ts` — `reverseLedgerBenefits` (orchestrated via `src/utils/payment/reversers/`) |
| Webhook | `src/app/api/stripe/webhook/route.ts` — `charge.refunded`, refund objects, `charge.dispute.closed` (lost), `charge.dispute.funds_withdrawn` |
| Admin replay | `POST /api/admin/users/[id]/payment-events/[eventId]/reverse` → `replayRefundReversalForBenefitsGrantedEvent` |

## Invariants

1. **Full refund only** reverses benefits. Partial refunds create `RefundPartial` with `data.status: "partial-skipped"` (admin-visible).
2. **`RefundProcessed-<paymentIntentId>`** (same `paymentIntentId` key as `BenefitsGranted`, e.g. `invoice_in_…` for subscriptions) is the idempotency lock.
3. **`rewardsPoints`** are always decremented from the ledger when present (membership included).
4. **`subscription.lastMonthAccumulatedEntries`**: atomic `$inc` by `-grants.lastMonthDelta`, `$max` 0, then `$unset` when **no** non-refunded membership `BenefitsGranted` remain (see `countNonRefundedMembershipGrants`).
5. **Promo / campaign / milestone** rollback failures are appended to `RefundProcessed.data.reversalIssues` and do not roll back core user/draw updates.

## Klaviyo

After DB writes + 500ms barrier, `trackRefundedOrder` and `ensureUserProfileSynced` run (failures → `reversalIssues` entry `klaviyo-sync`).

## Runbook

1. **Refund in Stripe Dashboard** (full refund) → webhook runs reversal; confirm `RefundProcessed` row and user totals.
2. **Webhook missed:** admin `POST .../payment-events/[eventId]/reverse` with URL-encoded `BenefitsGranted` `_id` (requires succeeded refunds on the Stripe charge).
3. **Partial refund:** expect `RefundPartial` only; benefits unchanged.

## Adding a new grant type

1. Extend `IPaymentGrantLedger` (`src/types/payment-ledger.ts`).
2. Record the grant in `payment-processing.ts` when the benefit is applied.
3. Add a **reverser step** in `refund-ledger-reversal.ts` / `buildLedgerReversalSteps` (or a new `PaymentReverser` module) and document the invariant here.
