# Subscription — Testing

Per CLAUDE.md, this repo has **no jest/vitest**. Tests are standalone `tsx` scripts under `__tests__` directories, each wired to its own `package.json` script.

## Tests in this domain

| File | Script | Covers |
|---|---|---|
| [`src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts`](../../src/services/subscription/__tests__/SubscriptionCollectionPauseService.test.ts) | `npm run test:stripe-collection-pause` | `pauseCollectionPolicy` clearing rules and `describePauseCollection` formatting. Imports the pure helpers directly to avoid mocking Stripe. |
| [`src/utils/payment/__tests__/subscription-entries-calculator.test.ts`](../../src/utils/payment/__tests__/subscription-entries-calculator.test.ts) | `npm run test:subscription-entries-calculator` | `calculateUpgradeEntries` Mode A / Mode B math and the `calculateSubscriptionEntries` dispatcher routing for upgrade + `hasMembershipGrantInCurrentDrawPeriod` flag combinations. 11 cases (Mode A primary / no-promo / fresh, Mode B renewal-then-upgrade / initial-then-upgrade, three defensive inputs, three dispatcher integration cases). |
| [`src/services/subscription/__tests__/find-recoverable-subscription.test.ts`](../../src/services/subscription/__tests__/find-recoverable-subscription.test.ts) | `npm run test:find-recoverable-subscription` | `findRecoverableSubscriptionForCustomer` / `stripeCustomerHasManageableSubscription` re-validate each listed sub's real `.status`. Regression for the Stripe `list({status:"trialing"})` leak of `incomplete` subs that falsely blocked resubscribe (see [gotchas.md](./gotchas.md)). Uses a mock Stripe client — no live calls. |
| [`src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts`](../../src/services/subscription/__tests__/cancel-incomplete-subscription.test.ts) | `npm run test:cancel-incomplete-subscription` | `cancelIncompleteSubscriptionAndVoidInvoice` helper: only cancels when real Stripe status is `incomplete`, voids the initial invoice only when `open`, handles invoice-void errors best-effort without throwing, and is idempotent (no-ops on already-cancelled subs). Mock Stripe client — no live calls. |
| [`src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts`](../../src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts) | `npm run test:cancel-churn-emit` | The `"Subscription Cancellation Requested"` emit through the REAL `cancelSubscription` (added 2026-08-26, fix round 1). The canonical-shape suite covers only the pure builder with `packageData` handed in ready-made; everything the SERVICE owns lives here: the `isMemberChurn` gate (default = admin route + `switchTierPastDue` emit nothing), the `getPackageById` lookup and `pkg.name.toLowerCase()` tier derivation (`"Tradie"` / `"tradie"`, never the raw id), the emit sitting AFTER `await user.save()` (asserted by counting emits at save time), `access_ends_at` tracking the persisted `endDate` on both the period-end and immediate branches, the unresolvable-package fallback (still emits, package block omitted) and the missing-`cancelledAt` early return (emits nothing). `@/lib/stripe` + `@/lib/klaviyo` are swapped in `require.cache` and verified by object identity before any case runs — no DB, no network, no `.env.local`. Mutation-proven: `tier: pkg._id`, deleting the gate, and moving the emit above the save each turn it red. **Section 5 (added 2026-08-26, fix round 2) pins the CALLER half**, which sections 1–4 structurally cannot: they load the service directly and supply `isMemberChurn` themselves, so they only prove the gate *inside* the service. `isMemberChurn: true` appears at exactly one call site in the repo — `src/app/api/stripe/cancel-subscription/route.ts` — and it defaults to `false`, so deleting it from that route type-checks, lints and leaves every suite green while the cancellation event stops firing for every real customer and the win-back Klaviyo flow (the only consumer of the cancel click, and the flow the `cancel-click` bonus code lives inside) loses its trigger entirely: nobody enters it and nothing errors. Section 5 stubs the `@/services/subscription` **barrel** (a different module from `CancelSubscriptionService.ts`, so sections 1–4 are untouched), plus Mongo, the `User` model, `next-auth` and `@/lib/audit-log`, then POSTs to both cancel routes and asserts the recorded options in **opposite directions**: the member route must ask for churn (`isMemberChurn: true`, `analytics.actor: "user"`), the admin route must not (the key absent entirely, not present-and-false; `analytics.actor: "admin"`). Both stubs are identity-verified before any case runs. Mutation-proven: deleting `isMemberChurn: true` from the member route type-checks, keeps `test:klaviyo-canonical` green, and turns exactly one section-5 assertion red. |
| [`src/utils/subscription/__tests__/membership-display-status.test.ts`](../../src/utils/subscription/__tests__/membership-display-status.test.ts) | `npm run test:membership-display-status` | `deriveMembershipDisplayStatus` (subscription-helpers.ts) — the pure derivation behind the admin user-detail header badge: past_due/unpaid win over cancelled-while-past-due, `trialing` displays as Active (never "trial"), active + `autoRenew:false` = scheduled_cancel, paused (defensive — no DB writer today), terminal cancelled (both spellings), incomplete/unknown → none (guest). Pure — no DB/env. |
| [`src/utils/membership/__tests__/plan-package-id.test.ts`](../../src/utils/membership/__tests__/plan-package-id.test.ts) | `npm run test:plan-package-id` | `convertToLocalPlan` carries the catalog `_id` as `metadata.packageId`, and resolving a tier from the name-derived `LocalMembershipPlan.id` yields the **wrong** tier (bare `"tradie"` → one-time ladder, 40% / 734 offers, not the subscription's 50% / 917). Both failures are silent — no throw, no type error. Includes a control that an off-ladder percent returns `null` rather than a plausible count. Mutation-tested. Pure — no DB/env. |

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
