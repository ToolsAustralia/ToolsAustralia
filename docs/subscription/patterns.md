# Subscription — Patterns

Recurring conventions you'll see throughout subscription code.

## P0. Package display name helpers — 2026-05-14

Two helpers in `src/utils/membership/` control how package names are shown to users:

### `getPackageDisplayName(pkg)` — catalog surfaces
`src/utils/membership/getDisplayName.ts`. Strips the `"Additional "` prefix from Additional one-time packs (e.g. `"Additional Tradie Pack"` → `"Tradie Pack"`). Used exclusively in catalog cards, modal headers, and plan selectors — anywhere the page context already implies draw scope.

**Rule:** All catalog UI that renders a human-visible package name must call `getPackageDisplayName(plan)` instead of reading `plan.name` directly.

### `getReceiptLabel(pkg)` / `getReceiptLabelByPackageId(packageId, resolvers)` — receipt surfaces
`src/utils/membership/getReceiptLabel.ts`. Appends a context suffix so the same display name is distinguishable across SKUs in a purchase history view:

| SKU | Input `name` | `getReceiptLabel` output |
|---|---|---|
| `tradie-pack` | "Tradie Pack" | "Tradie Pack" |
| `additional-tradie-pack` | "Additional Tradie Pack" | "Tradie Pack (Member)" |
| `additional-tradie-pack-mini` | "Additional Tradie Pack (Mini Draw)" | "Tradie Pack (Mini Draw)" |
| `mini-pack-1` | "Mini Pack 1" | "Mini Pack 1" |

**Rule:** Post-payment success screens, Klaviyo invoice email line items, and any order-history row that renders a package name must call `getReceiptLabel(pkg)` or `getReceiptLabelByPackageId(id, { membership: getPackageById, mini: getMiniDrawPackageById })`. Stripe metadata, Stripe descriptions, admin views, and internal event payloads (`packageName` on PaymentEvent) continue to use `pkg.name` unchanged.

## Site-wide interaction smoothness — Phase 5B (2026-05-10)

`CancellationUpsellModal/DowngradeCard.tsx` and `DowngradeConfirmModal/Hero.tsx` had their package-icon `<Image>` elements without `sizes` hints; Phase 5B added `sizes="48px"` / `sizes="44px"` matching their fixed cells. Markup only — no policy or transition logic touched.

## P0a. Additional-pack discount util — 2026-05-15

`src/utils/membership/additional-pack-discount.ts` — `getAdditionalPackDiscount(planId)`.

Computes the 50%-off discount for Additional packs by pairing each `additional-{tier}-pack` against its matching `{tier}-pack` regular price from `membershipPackages`. Returns `{ regularPrice, discountedPrice, percentOff }` or `null` when there is no genuine discount (inactive pack, no matching regular pack, regular price not higher, non-additional or subscription ids). Accepts the `-member` suffix appended by `useMemberships`.

**Rule:** UI that displays a strike-through "was $X" price for an additional pack must call this util — do not hard-code prices or assume 50%.

## P1. Pure-policy split for testability

Stripe-touching logic and pure-decision logic are separated so the latter can be unit-tested without mocking Stripe.

Example: `pauseCollectionPolicy.ts` exports two pure helpers (`shouldClearPauseCollectionAfterPaidInvoice`, `describePauseCollection`). They're re-exported from `SubscriptionCollectionPauseService.ts` so callers import from one place, but the test file imports from the policy file directly to keep tests dependency-free.

```ts
// pauseCollectionPolicy.ts — pure, no `import { stripe }`
export function shouldClearPauseCollectionAfterPaidInvoice(params): boolean { ... }

// SubscriptionCollectionPauseService.ts — has Stripe client
import { stripe } from "@/lib/stripe";
export { shouldClearPauseCollectionAfterPaidInvoice } from "./pauseCollectionPolicy";
export async function pauseAfterRenewalFailure(id) { await stripe.subscriptions.update(id, ...); }
```

Apply this pattern when adding any new policy decision.

## P2. Canonical-vs-pending Stripe subscription IDs

Every reference to a Stripe subscription on the User document falls into one of two slots:

| Slot | When | Status set |
|---|---|---|
| `User.stripeSubscriptionId` | Confirmed live subscription | Manageable: `active`, `trialing`, `past_due`, `unpaid`, `paused` |
| `User.subscription.pendingStripeSubscriptionId` | Mid-checkout, not yet confirmed | Pre-confirmation states, `incomplete` |

Promote pending → canonical only via `shouldWriteCanonicalStripeSubscriptionId(status)`. Never promote on `incomplete` or `incomplete_expired`.

## P3. Repair-on-read for stale references

When the canonical id points to a dead Stripe sub, repair on the next read by searching the customer for a manageable subscription and adopting the newest. Use `resolveCancellableStripeSubscription(user)` — it does the repair as a side effect of the resolve.

This avoids needing background reconciliation jobs: every read self-heals.

## P4. Status priority for recovery

When listing a customer's subscriptions to find "the real one," prefer in this order:

```
active → trialing → past_due → unpaid → paused
```

Inside one status, newest by `created` wins. Defined in `MANAGEABLE_STRIPE_SUBSCRIPTION_STATUSES` constant order; consumed by `findRecoverableSubscriptionForCustomer()`.

## P5. Stripe error classification

When wrapping a Stripe call, classify the failure into:

- `is404` — `code === "resource_missing"` or `statusCode === 404` → caller treats as "doesn't exist," repairs canonical id.
- `isRetryable` — `code === "rate_limit"` or `statusCode === 429` or `statusCode >= 500` → caller surfaces as 503 with retry-after.
- otherwise → 4xx-class, propagate as a 4xx response.

Pattern used by `retrieveStripeSubscription()`. Apply to other Stripe calls that need consistent error UX.

## P6. Errors as classes with codes, not strings

`SubscriptionReferenceError` carries a typed `code` field (`NO_ACTIVE_SUBSCRIPTION` | `STRIPE_RETRYABLE`). Route handlers `instanceof`-check or call `isSubscriptionReferenceError(e)` and switch on the code to map to HTTP status.

Don't return plain `Error` from services — the route handler can't know whether it's user-error vs infra error.

## P7. Side-effects-as-list, ordered, with `console.error`-not-throw

The cancel service is the canonical example: after the Stripe + Mongo write, it runs:

1. partner-discount queue
2. Klaviyo profile sync (try/catch, errors logged not thrown)
3. cancellation analytics history (try/catch, non-blocking)

Each side effect is independent — a failure in Klaviyo must not roll back the cancel. Use try/catch with `console.error` for non-critical effects so production builds preserve the log line (CLAUDE.md strips `console.log`).

## P8. Single shared service for user + admin paths

Whenever the same operation is exposed to both regular users and admins, factor the logic into a service and have both routes call it. Cancel is the example: `/api/stripe/cancel-subscription` (user) and `/api/admin/users/[id]/cancel-subscription` (admin) both call `cancelSubscription(user, options)`.

Pass an `analytics` option (`actor: "user" | "admin"`) so the service can record the appropriate audit row.

## P9. Webhook is the source of truth for analytics events

External tracking events (Klaviyo `Subscription Cancelled`, Meta CAPI, etc.) are emitted **only** from the matching `customer.subscription.*` webhook. API paths only write the local `MembershipStatusHistory` row.

This prevents double-counting when both API and webhook fire on the same lifecycle change.

## P10. Dedupe keys on history rows

`MembershipStatusHistory.dedupeKey` is a sparse-unique index. Any caller writing a status row should compute a dedupe key like `${userId}:${effectiveAt.toISOString()}:${source}` so a webhook retry doesn't double-write.

## Cursor agent boundary

The Cursor `.cursor/agents/stripe-billing.md` subagent owns this domain (and all `lib/stripe.ts` work). Read its boundary description before non-trivial changes — the orchestrator rule (`.cursor/rules/orchestrator.mdc`) requires QA review for changes touching payments / subscriptions / DB schema.

These are Cursor-specific boundaries — Claude Code can't invoke them — but the boundary still applies to non-trivial PRs in this domain.
