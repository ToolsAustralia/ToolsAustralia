# Rewards-Redeemables — Backend

## Services ([src/services/redeemables/](../../src/services/redeemables/))

| Service | Responsibility |
|---|---|
| `RedeemablesWalletService.ts` | Read user wallet (active issuances, history, balances). Sets each campaign coupon's `isRedeemableNow` — gates purchase-required coupons via `hasQualifyingPurchase(...)` (loads user `subscription` + `oneTimePackages`), mirroring `RedemptionService` so the "Claim" button matches the redeem endpoint. |
| `RedemptionService.ts` | Execute redemption: validate, atomic burn, fulfillment hand-off. Purchase-gated coupons are enforced with `hasQualifyingPurchase(...)` before the burn (returns `ineligible` otherwise). |
| `CampaignService.ts` | Run a campaign: target users, write `RedeemableIssuance` rows. |
| `DrawGrantService.ts` | Issue redeemables tied to draw outcomes (winners, top-percentile). |
| `TargetingService.ts` | Audience selection helpers — segments, filters, percentile. |
| `RedemptionAnalyticsService.ts` | Aggregate redemption analytics for admin dashboards. |
| `CsvImportService.ts` | Bulk CSV import for admin (large campaigns). |
| `index.ts` | Re-exports for clean imports. |

## Utilities ([src/utils/redeemables/](../../src/utils/redeemables/))

| File | Purpose |
|---|---|
| `campaignAudienceFilter.ts` | Pure-policy filter — given a user, does this campaign apply? |
| `topMajorDrawPercentile.ts` | "Top N%" computation across major-draw participants. |
| `cancellation-upsell-eligibility.ts` | Decides who gets the cancel-upsell offer based on redeemable history. |
| `purchase-eligibility.ts` | Pure predicate `hasQualifyingPurchase(user, campaign, requirement, now)` — resolves a campaign's `purchaseRequirement` (`"none"` \| `"membership"` \| `"one-time"` \| `"any"`) against the user's active subscription and in-window `oneTimePackages`. The single source of truth shared by the redeem endpoint and the wallet's `isRedeemableNow`. |

## Refund integration

The refund-reverser module for redeemables lives in [src/utils/payment/reversers/](../../src/utils/payment/reversers/) — pulls from this domain's models to un-issue unredeemed grants. Already-redeemed grants surface in `RefundProcessed.data.reversalIssues[]`.

## Cron / jobs

Campaign runs are typically admin-triggered, not cron-scheduled. _TODO: confirm whether any scheduled campaigns exist (e.g. monthly top-percentile)._

## Models

See [models.md](./models.md) for the 3 collections owned by this domain.
