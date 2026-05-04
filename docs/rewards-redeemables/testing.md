# Rewards-Redeemables — Testing

## Suites

| Script | Covers |
|---|---|
| `npm run test:redeemables` | Redeemables service tests under [src/services/redeemables/__tests__/](../../src/services/redeemables/__tests__/) |

> _TODO: enumerate exact test files in `__tests__/`._

## Test conventions

- Standalone tsx scripts (per CLAUDE.md).
- Pure-policy helpers (`campaignAudienceFilter`, `topMajorDrawPercentile`, `cancellation-upsell-eligibility`) testable directly.
- Service tests can stub the repository layer to focus on logic.

## What's NOT well tested

- End-to-end campaign run + redemption + refund-reversal cycle
- CSV import at scale
- Prize-catalog rendering edge cases

> _TODO: identify specific gaps as the suite grows._
