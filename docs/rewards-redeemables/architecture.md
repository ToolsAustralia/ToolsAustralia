# Rewards-Redeemables — Architecture

## Two systems in one domain

### Redeemables (wallet-based)

Users earn redeemable items via campaigns and draws. Each issuance is a `RedeemableIssuance` row tied to the user. Users redeem via the `/rewards` page; the redemption updates the issuance status.

### Milestones (tier achievements)

`MilestoneReward` defines tiers (config); `MilestoneIssuance` records when a user achieved a tier. Achieving a tier may auto-issue redeemables.

## Service layout ([src/services/redeemables/](../../src/services/redeemables/))

| Service | Role |
|---|---|
| `RedeemablesWalletService.ts` | The wallet — list user's redeemables, balances, status. |
| `RedemptionService.ts` | The redeem action — burn the issuance, fulfill the reward. |
| `CampaignService.ts` | Campaign-level grants (e.g. "all top-10% members in March get X"). |
| `DrawGrantService.ts` | Draw-tied grants (e.g. winner-of-draw redeemables). |
| `TargetingService.ts` | Audience filtering — who is eligible for a campaign? |
| `RedemptionAnalyticsService.ts` | Reporting on redemptions. |
| `CsvImportService.ts` | Bulk import of redeemables (admin tool). |

Cross-domain helper: [campaignAudienceFilter.ts](../../src/utils/redeemables/campaignAudienceFilter.ts), [topMajorDrawPercentile.ts](../../src/utils/redeemables/topMajorDrawPercentile.ts), [cancellation-upsell-eligibility.ts](../../src/utils/redeemables/cancellation-upsell-eligibility.ts), [purchase-eligibility.ts](../../src/utils/redeemables/purchase-eligibility.ts) (purchase-gated coupon predicate, shared by redeem + wallet).

## Lifecycle

```
[Campaign run] → TargetingService picks users → CampaignService writes RedeemableIssuance per user
                                                          │
                                                          ▼
                                               User sees in /rewards (RedeemablesWalletService reads)
                                                          │
                                                          ▼
                                              User clicks redeem → RedemptionService runs
                                                          │
                                                          ▼
                                       Issuance.status = "redeemed"; reward delivered (varies by type)
```

## Refund integration

When a payment that granted redeemables is refunded:
1. Refund webhook → `processRefundReversal` ([payment](../payment/architecture.md)).
2. `buildLedgerReversalSteps` ([refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)) registers one named step per grant kind and runs them through the generic orchestrator in `src/utils/payment/reversers/`.
3. The redeemables steps claw back grants tied to the payment — **redeemed or not**: milestone issuances are revoked (redeemed ones un-redeemed first, removing their granted entries and draw entries), and a coupon/milestone redemption consumed on the refunded purchase is un-redeemed.

Redeemed value is reclaimed automatically, not written off — only reversal steps that **fail** appear in `RefundProcessed.data.reversalIssues[]` for admin attention.

## Pause behaviour

(Migrated from `docs/rewards-pause.md`.)

> _TODO: read root `docs/rewards-pause.md` and merge here. Brief: rewards can be paused per user (e.g. abuse) without revoking existing issuances._

## Prize catalog

(Migrated from `docs/prize-catalog.md`.)

> _TODO: read root `docs/prize-catalog.md` and merge here. Brief: prize catalog config and how the UI consumes it._

## Cross-domain integration

- **[draws](../draws/)**: `DrawGrantService` is invoked when a draw winner is declared.
- **[promo](../promo/)**: campaign multipliers can reference redeemable types.
- **[payment](../payment/)**: reversers handle refund.
- **[upsell](../upsell/)**: `cancellation-upsell-eligibility.ts` decides who gets the cancel-upsell offer (uses redeemable history).
