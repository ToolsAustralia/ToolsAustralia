# Rewards-Redeemables — Rules

## R1. Atomic redemption

Redemption must be atomic: validate → burn → fulfill. If fulfillment fails after burn, the issuance status must roll back OR an admin-visible reversalIssues record must be written. No silent loss.

## R2. Idempotent issuance

`RedeemableIssuance` writes use a stable issuance key (`${campaignId}:${userId}` or `${drawId}:${userId}` etc.) to prevent double-issuance from webhook retries or campaign re-runs.

## R3. Refund reversal — redeemed issuances are clawed back too

Full-refund reversal revokes milestone issuances granted by the refunded payment; an already-**redeemed** issuance is first un-redeemed (`RedemptionService.unredeemMilestoneRedemption` removes the granted entries + draw entries) and then set `status: "revoked"` ([MilestoneService.revokeIssuancesFromPaymentEvent](../../src/services/milestones/MilestoneService.ts)). A monthly coupon or milestone redemption consumed *on* the refunded purchase is likewise un-redeemed (coupon back to `status: "active"`, its entries removed). `RefundProcessed.data.reversalIssues[]` records reversal-step **failures** only — nothing survives by design, only by error. Steps are registered in `buildLedgerReversalSteps` ([refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)).

## R4. Wallet conservation under pause

When a user is "rewards-paused" (e.g. abuse), existing issuances are NOT revoked. They remain in the wallet but redemption is gated via `rewardsGuard.ts`. Admin can manually revoke if needed.

## R5. Targeting purity

`TargetingService` filters must be pure (no side effects during evaluation). Side effects (writing issuances) only happen in the `CampaignService.run()` step after targeting completes.

## R6. CSV import preview before commit

Bulk CSV imports must offer a dry-run / preview that lists who would receive what, before actually writing issuances. _TODO: verify this is implemented in `CsvImportService.ts`._

## R7. Top-percentile computed against MajorDraw, not subscription

`topMajorDrawPercentile.ts` computes percentiles across draw participation, not subscription tier. A high-tier non-participant doesn't qualify; a low-tier active participant might.

## R8. Purchase-gated coupons require a REAL in-window purchase

A campaign coupon's `purchaseRequirement` (`"none"` | `"membership"` | `"one-time"` | `"any"`) is enforced by the single predicate `hasQualifyingPurchase(...)` in [purchase-eligibility.ts](../../src/utils/redeemables/purchase-eligibility.ts):

- `"none"` → always eligible.
- `"membership"` → an active subscription.
- `"one-time"` → a `oneTimePackages` purchase whose `purchaseDate` falls inside the campaign window `[startsAt, endsAt | now]`.
- `"any"` → membership OR an in-window one-time purchase.

The window floor is the campaign `startsAt` — the purchase must happen **during the campaign**. Lifetime purchase history (and lifetime `accumulatedEntries`) must **never** be used as a purchase proxy.

Both call sites must stay in lockstep on this predicate: `RedemptionService.redeem()` enforces it before the burn (else `ineligible`), and `RedeemablesWalletService.isRedeemableNow` applies the same check so the client "Claim" button stays disabled until the qualifying purchase exists. Changing one without the other lets the button and the endpoint disagree. Both queries must select the user's `subscription` + `oneTimePackages` and the campaign's `startsAt`/`endsAt`.
