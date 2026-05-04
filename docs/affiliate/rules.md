# Affiliate — Rules

## R1. Attribution captured at signup, not at every payment

Affiliate attribution is recorded ONCE on the user record at signup (or first attributable action). Subsequent payments use the stored attribution; don't re-resolve from cookies.

## R2. Idempotent commission per payment

`AffiliateCommission` writes use `(paymentEventId, affiliateId)` as a deterministic key. Webhook retries can't double-write.

## R3. Recurring commissions per cycle

Each renewal `invoice.payment_succeeded` (`subscription_cycle`) creates a NEW `AffiliateCommission` row. Use `(subscriptionId, invoiceId, affiliateId)` as the key.

## R4. Refund reverses commission

`reverse-commission.ts` is invoked by the [payment](../payment/) reverser orchestration. Marks the commission row as reversed; aggregations exclude reversed rows from payouts.

## R5. Payouts only on settled commissions

`payout-processing.ts` only includes commissions that:
- Aren't reversed
- Aren't in pending-refund window
- Meet the minimum payout threshold

> _TODO: confirm exact threshold and waiting period._

## R6. Affiliate session is separate

Affiliate portal users authenticate via `affiliate-auth.ts`. Don't mix with member NextAuth — affiliates aren't members of the main user system.
