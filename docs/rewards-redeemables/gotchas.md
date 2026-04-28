# Rewards-Redeemables — Gotchas

## Pause behaviour

(Migrated from `docs/rewards-pause.md`.)

> _TODO: read root file and merge._

Brief: when a user is "rewards-paused" (abuse handling), `rewardsGuard.ts` blocks new issuance and redemption but leaves existing wallet contents intact. Admin can revoke individually if needed.

## Prize catalog

(Migrated from `docs/prize-catalog.md`.)

> _TODO: read root file and merge._

## Already-redeemed reversal

When refunding a payment that issued redeemables, only un-redeemed issuances are reversed. Already-redeemed ones surface in `RefundProcessed.data.reversalIssues[]`. Admin must manually adjudicate (revoke compensation, request return, etc.) — there's no automatic claw-back.

## Top-percentile timing

`topMajorDrawPercentile.ts` queries draw participation. If run too early in the cycle (e.g. during `active` status), the percentile is incomplete. Best to run after `frozen` transitions. _TODO: verify whether the campaign scheduler enforces this._

## Cancellation upsell eligibility

`cancellation-upsell-eligibility.ts` decides who sees the cancel-upsell offer based on:
- Recent redeemable issuance history
- Subscription state
- _TODO: enumerate the full eligibility rules_

Wrong eligibility → user sees offer they don't qualify for, or doesn't see one they should — both have CS implications.

## CSV import scale

CSV bulk import is admin-triggered. For very large lists (>10k users), consider chunked processing. _TODO: confirm whether chunking is implemented or if the route times out at scale._
