# Rewards-Redeemables — Rules

## R1. Atomic redemption

Redemption must be atomic: validate → burn → fulfill. If fulfillment fails after burn, the issuance status must roll back OR an admin-visible reversalIssues record must be written. No silent loss.

## R2. Idempotent issuance

`RedeemableIssuance` writes use a stable issuance key (`${campaignId}:${userId}` or `${drawId}:${userId}` etc.) to prevent double-issuance from webhook retries or campaign re-runs.

## R3. Refund reversal — only un-redeemed issuances

Refund reverser un-issues only `status: "active"` (not yet redeemed). Already-redeemed issuances are surfaced in `RefundProcessed.data.reversalIssues[]` for admin awareness — they aren't reversed automatically.

## R4. Wallet conservation under pause

When a user is "rewards-paused" (e.g. abuse), existing issuances are NOT revoked. They remain in the wallet but redemption is gated via `rewardsGuard.ts`. Admin can manually revoke if needed.

## R5. Targeting purity

`TargetingService` filters must be pure (no side effects during evaluation). Side effects (writing issuances) only happen in the `CampaignService.run()` step after targeting completes.

## R6. CSV import preview before commit

Bulk CSV imports must offer a dry-run / preview that lists who would receive what, before actually writing issuances. _TODO: verify this is implemented in `CsvImportService.ts`._

## R7. Top-percentile computed against MajorDraw, not subscription

`topMajorDrawPercentile.ts` computes percentiles across draw participation, not subscription tier. A high-tier non-participant doesn't qualify; a low-tier active participant might.
