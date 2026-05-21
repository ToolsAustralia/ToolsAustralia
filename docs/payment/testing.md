# Payment — Testing

## Suites

Tests live under [src/utils/payment/__tests__/](../../src/utils/payment/__tests__/).

> _TODO: enumerate exact test files and matching `npm run test:*` scripts. The pattern is one tsx test per script name in package.json._

| Script (likely names) | Covers |
|---|---|
| `npm run test:anchor-billing` | Anchor billing math (overlap with [billing-stripe](../billing-stripe/) and [subscription](../subscription/)) |
| `npm run test:stripe-collection-pause` | Pause-collection clearing + invoice selection (overlap) |
| `npm run test:redeemables` | Reverser modules for redeemables grants (overlap with [rewards-redeemables](../rewards-redeemables/)) |

## Test conventions

- No jest/vitest. Standalone tsx scripts.
- Each test file needs a matching `test:*` entry in `package.json`.
- Pure-policy helpers (no Stripe SDK) tested directly. Stripe-touching helpers are integration-tested or smoke-tested via Stripe CLI.

## Manual smoke testing

```bash
# 3DS test card requiring authentication
4000 0000 0000 0341

# Decline
4000 0000 0000 0002

# Insufficient funds
4000 0000 0000 9995

# Authentication required (3DS challenge)
4000 0027 6000 3184
```

Stripe Dashboard > Developers > Test cards has the full reference.

## What's NOT well tested

- 3DS redirect flow (manual smoke only).
- Saved-payment-method deletion flow with active subscription.
- Refund reversal end-to-end (reverser-step units exist; full orchestration is production-only).

> _TODO: identify specific gaps and add test scripts._
