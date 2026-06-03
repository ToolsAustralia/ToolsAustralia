# Subscription — Testing

Per CLAUDE.md, this repo has **no jest/vitest**. Tests are standalone `tsx` scripts under `__tests__` directories, each wired to its own `package.json` script.

## Tests in this domain

| File | Script | Covers |
|---|---|---|
| [`src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts`](../../src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts) | `npm run test:stripe-collection-pause` | `pauseCollectionPolicy` clearing rules and `describePauseCollection` formatting. Imports the pure helpers directly to avoid mocking Stripe. |
| [`src/utils/payment/__tests__/subscription-entries-calculator.test.ts`](../../src/utils/payment/__tests__/subscription-entries-calculator.test.ts) | `npm run test:subscription-entries-calculator` | `calculateUpgradeEntries` Mode A / Mode B math and the `calculateSubscriptionEntries` dispatcher routing for upgrade + `hasMembershipGrantInCurrentDrawPeriod` flag combinations. 11 cases (Mode A primary / no-promo / fresh, Mode B renewal-then-upgrade / initial-then-upgrade, three defensive inputs, three dispatcher integration cases). |
| [`src/services/subscription/__tests__/find-recoverable-subscription.test.ts`](../../src/services/subscription/__tests__/find-recoverable-subscription.test.ts) | `npm run test:find-recoverable-subscription` | `findRecoverableSubscriptionForCustomer` / `stripeCustomerHasManageableSubscription` re-validate each listed sub's real `.status`. Regression for the Stripe `list({status:"trialing"})` leak of `incomplete` subs that falsely blocked resubscribe (see [gotchas.md](./gotchas.md)). Uses a mock Stripe client — no live calls. |
| [`src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts`](../../src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts) | `npm run test:cancel-incomplete-subscription` | `cancelIncompleteSubscriptionAndVoidInvoice` helper: only cancels when real Stripe status is `incomplete`, voids the initial invoice only when `open`, handles invoice-void errors best-effort without throwing, and is idempotent (no-ops on already-cancelled subs). Mock Stripe client — no live calls. |

> _TODO: enumerate any additional `__tests__` files under subscription as they're added._

## Cross-cutting tests that exercise subscription paths

These live in other directories but exercise subscription logic:

| Script | What it tests |
|---|---|
| `npm run test:anchor-billing` | Billing-anchor logic (`scripts/test-anchor-billing.ts` or the matching `__tests__` file). The default `npm test` runs this one. |
| `npm run test:stripe-collection-pause` | Pause-collection policy (also listed above; it's the same suite). |
| Various `npm run test:*` | Per CLAUDE.md, every test file needs a matching `test:*` script in `package.json` to be discoverable. |

## DST tests

Date-sensitive billing logic uses `date-fns-tz` Australia/Sydney. There's a dedicated DST regression script:

```bash
tsx scripts/test-dst-transitions.ts
```

This was originally documented in root-level `TESTING-TIMEZONE-DST.md` (to be merged into this file in a refresh pass — _TODO_).

It exercises the anchor calculation across DST start/end, ensuring renewal day stays the 24th regardless of the spring-forward / fall-back transition.

## How to run

```bash
# Run the default test suite (currently anchor-billing only)
npm test

# Run a specific subscription suite
npm run test:stripe-collection-pause

# Run a non-suite ad-hoc tsx script
npx tsx src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts
```

When **adding** a new test file in this domain:

1. Place under `src/services/subscription/__tests__/` or appropriate `__tests__` location.
2. Add a `test:<name>` entry to `package.json` matching the file pattern.
3. Verify discoverability with `npm run test:<name>`.

## What good tests look like here

The existing test imports policy helpers directly (no Stripe mocking):

```ts
import { shouldClearPauseCollectionAfterPaidInvoice } from "../pauseCollectionPolicy";
// not from "../SubscriptionCollectionPauseService"  ← that imports `stripe`
```

Apply this when writing new tests in this domain — keep policy and IO separate so tests don't need a Stripe mock. See [patterns P1](./patterns.md#p1-pure-policy-split-for-testability).

## What's NOT well-tested

(Honest gap report.)

- `cancelSubscription()` end-to-end — exercises Stripe + Mongo + Klaviyo + partner queue. There is no integration harness for this; manual smoke is needed for behaviour changes. _TODO: consider extracting a pure "compute cancellation result" helper that can be unit-tested without the side-effect chain._
- `resolveCancellableStripeSubscription()` — pure-ish (only Stripe IO) but lacks a dedicated test file. _TODO: add coverage for the dead-id repair branches._
- Webhook handlers — covered by `npm run test:stripe-webhook` (in [billing-stripe](../billing-stripe/) domain) but no dedicated subscription-status-transition tests.
