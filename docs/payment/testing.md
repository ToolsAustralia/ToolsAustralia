# Payment — Testing

## Suites

Tests live under [src/utils/payment/__tests__/](../../src/utils/payment/__tests__/).

> _TODO: enumerate exact test files and matching `npm run test:*` scripts. The pattern is one tsx test per script name in package.json._

| Script (likely names) | Covers |
|---|---|
| `npm run test:anchor-billing` | Anchor billing math (overlap with [billing-stripe](../billing-stripe/) and [subscription](../subscription/)) |
| `npm run test:stripe-collection-pause` | Pause-collection clearing + invoice selection (overlap) |
| `npm run test:redeemables` | Reverser modules for redeemables grants (overlap with [rewards-redeemables](../rewards-redeemables/)) |
| `npm run test:invoice-generated-gate` | Fences `shouldEmitInvoiceGenerated(billing_reason)` — the server-side "Invoice Generated" receipt gate ([backend.md](./backend.md), [gotchas.md](./gotchas.md)). Test lives at `src/utils/integrations/klaviyo/__tests__/invoice-generated-gate.test.ts` (klaviyo/tracking area, not `utils/payment/__tests__/`). |
| `npm run test:purchase-event-time` | Fences the CAPI Purchase `event_time` pipeline used by `grantBenefits` — `normalizeEpochToUnixSeconds` (ms vs seconds) + `resolveEventTime` (out-of-window → "now") ([backend.md](./backend.md)). Test lives at `src/lib/tracking/__tests__/purchase-event-time.test.ts` (tracking area, not `utils/payment/__tests__/`). |
| `npm run test:campaign-code-checkout` | Fences `attachCampaignCodeToCheckout` ([backend.md](./backend.md), [gotchas.md](./gotchas.md)): full metadata preservation on the update payload (the catastrophic-failure case — a partial map destroys `packageId`/CAPI/A-B/attribution on an object about to be charged), clearing via `campaignCode: ""`, the unpaid-only state guard **including the anchor-day `trialing` + open-invoice shape and its already-paid twin**, both possession proofs, identity-from-metadata-not-caller, identity resolution (the `"guest"` / `"new"` placeholders and the `userEmail → User.findOne` fallback — the path that actually shipped broken), and Stripe failures as typed results rather than throws. Stripe is stubbed and verified by object identity before any case runs. **Extended 2026-08-27 (§7):** the recorded checkout intent — that the attach calls `recordCheckoutIntent` with the RESOLVER’s canonical code, against the identity taken from the object’s own metadata, naming the Stripe object being charged, and **before** the Stripe update. The ordering is asserted as an explicit `["intent", "stripe"]` log rather than a call count: a record written after the Stripe write would be missing in exactly the abandoned-request case it exists for, and nothing about the returned result would reveal that. Also pinned: a cleared code and a server-REFUSED code each record a clear, never the code. The caller's applied string (`"  lockin100 "`) and the resolver's canonical answer (`"LOCKIN100"`) are deliberately **different**, so "wrote the resolver's code" cannot pass against an implementation that echoes the caller's input. |
| `npm run test:decline-guidance` | Fences the confirm-time card-decline pipeline ([gotchas.md](./gotchas.md#confirm-time-card-declines-throw--routes-must-return-the-400-payment-failed-shape-fixed-2026-07)): `isStripeCardError` duck-typing, `extractPaymentErrorCodes` across all error shapes (incl. ApiError `.data`), the `DECLINE_CODE_GUIDANCE` map (sensitive-code non-leak + message-length caps), and `formatPaymentError` end-to-end for the production bug shape (`decline_code: invalid_account` carried on `ApiError.data`). Test lives at `src/utils/payment/stripe/__tests__/payment-error-decline-guidance.test.ts`. |
| `npm run test:shop-entries` | Fences the **merchandise entry grant** — the one benefit path that starts in the shop rather than a package. It lives here because the grant runs through `processPaymentBenefits` like every other one ([cart-shop-products/testing.md](../cart-shop-products/testing.md) holds the full assertion list). Runs against `E2E_MONGODB_URI`, never the dev database, because several assertions can only be made by reading a document back out of Mongo. |

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

## Grant assertions must read back from Mongo (2026-08-20)

Anything that credits a benefit is asserted at the **database** level, not by inspecting the
value a function returned. Mongoose strict mode drops keys absent from the schema **silently,
on save rather than on assignment** — so a grant can compute the right number, appear to store
it, and persist nothing, with `tsc` green and the function's own return value correct.

`test:shop-entries` carries a **control** for exactly this: it writes an undeclared key
alongside a declared one and asserts the undeclared key is gone on re-read. Without that
control the positive assertion proves nothing — if strict mode were off, it would pass either
way. This failure mode has shipped twice on `MajorDraw.entriesBySource`.

The same suite also demonstrates why a passing test is not evidence on its own: its multiplier
ladder assertion was **dead for weeks** — it divided both sides of the comparison by the same
variable, so every iteration was algebraically identical and it could not have failed. When
adding a guard here, mutate the code it guards and confirm the test goes red before trusting it.

## What's NOT well tested

- 3DS redirect flow (manual smoke only).
- Saved-payment-method deletion flow with active subscription.
- Refund reversal end-to-end (reverser-step units exist; full orchestration is production-only).

> _TODO: identify specific gaps and add test scripts._
