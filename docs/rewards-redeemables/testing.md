# Rewards-Redeemables — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:redeemables` | Redeemables service tests under [src/services/redeemables/__tests__/](../../src/services/redeemables/__tests__/) |
| `npm run test:redeemables-purchase-gate` | [purchase-eligibility.test.ts](../../src/utils/redeemables/__tests__/purchase-eligibility.test.ts) — 16 assertions covering `hasQualifyingPurchase(...)` across all four `purchaseRequirement` values, window bounds (inclusive `startsAt`/`endsAt`, `neverExpires` → `now`), and the regression that an active member does NOT auto-pass a `"one-time"` requirement. |

> _TODO: enumerate remaining test files in `services/redeemables/__tests__/`._

## Test conventions

- Standalone tsx scripts (per CLAUDE.md).
- Pure-policy helpers (`campaignAudienceFilter`, `topMajorDrawPercentile`, `cancellation-upsell-eligibility`, `purchase-eligibility`) testable directly.
- Service tests can stub the repository layer to focus on logic.

## What's NOT well tested

- End-to-end campaign run + redemption + refund-reversal cycle
- CSV import at scale
- Prize-catalog rendering edge cases

> _TODO: identify specific gaps as the suite grows._
