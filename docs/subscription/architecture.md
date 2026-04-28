# Subscription — Architecture

## What this domain does

Owns the full lifecycle of a member's subscription:

1. **Signup** — checkout → Stripe `customer.subscription.created` → User record gains `subscription` field.
2. **Renewal** — Stripe `invoice.payment_succeeded` (`billing_reason: subscription_cycle`) → benefits applied for next month.
3. **Failure recovery** — `invoice.payment_failed` → `subscription.status = past_due`, optionally Stripe `pause_collection`.
4. **Cancellation** — user or admin → `cancel_at_period_end` (default) or immediate; partner-discount queue, Klaviyo, analytics rows updated.
5. **Resubscribe** — cancelled user resigns; `lastMonthAccumulatedEntries` is preserved for continuity.

## Data flow (signup → renewal → cancel)

```
                          ┌──────────────────┐
                          │  Stripe (truth   │
                          │  for billing)    │
                          └────────┬─────────┘
                                   │ webhooks
                                   ▼
       ┌──────────────────────────────────────────────────────┐
       │  /api/stripe/webhook  (billing-stripe domain)        │
       │  • customer.subscription.created/updated/deleted     │
       │  • invoice.payment_succeeded / payment_failed        │
       └────────┬───────────────────────┬─────────────────────┘
                │                       │
                ▼                       ▼
   ┌───────────────────────┐ ┌─────────────────────────────┐
   │ User document         │ │ MembershipStatusHistory     │
   │ • stripeCustomerId    │ │ (event-sourced audit log    │
   │ • stripeSubscriptionId│ │  of state transitions)      │
   │ • subscription { … }  │ │                             │
   └───────────────────────┘ └─────────────────────────────┘
                │
                ├─► MembershipRenewalCycle (per-invoice cycle row)
                │
                ▼
       ┌────────────────────┐
       │ Hooks read this    │
       │ to render UI:      │
       │ - useStripeSubscr. │
       │ - useMemberships   │
       │ - useActivePackage │
       └────────────────────┘
```

## Layered responsibilities

Per CLAUDE.md's strict layering:

| Layer | What lives here for subscription |
|---|---|
| `src/app/api/subscription/**`, `src/app/api/memberships/**` | Thin handlers — auth, parse, delegate. |
| `src/services/subscription/**` | Cancel logic, pause-collection logic, Stripe-ref repair logic. Pure-policy helpers split out for tests. |
| `src/utils/subscription/**`, `src/utils/membership/**` | Pure helpers (active-package resolution, benefit lookup, downgrade benefit preservation). |
| `src/models/{User,MembershipPackage,MembershipRenewalCycle,MembershipStatusHistory,ChargeJobLock}.ts` | Mongoose schemas. See [models.md](./models.md). |
| `src/hooks/use{StripeSubscription,Memberships,ActivePackage,MembershipModal}.ts` | React hooks — read-only views of subscription state. |

## Source-of-truth split

- **Stripe is truth for billing facts** — current period end, status (`active`/`past_due`/`canceled`/...), `pause_collection`, invoice history.
- **Mongo is truth for our derived state** — `isActive`, `autoRenew`, `endDate`, `cancelledAt`, `pastDueAt`, `previousSubscription`, `pendingChange`. Derived from Stripe events but consumed by the rest of the app (page renders, eligibility checks, partner-discount queue).
- When the two diverge, the **webhook handler reconciles** — see `shouldAdoptPaidSubscriptionOverStored()` in [SubscriptionReferenceService.ts](../../src/services/subscription/SubscriptionReferenceService.ts) for the auto-correction rule.

## Manageable vs dead Stripe statuses

`SubscriptionReferenceService` defines two sets that drive almost every cancel/repair decision:

- **Manageable**: `active`, `trialing`, `past_due`, `unpaid`, `paused` — eligible to be cancelled or treated as "the user's current sub."
- **Dead**: `incomplete`, `incomplete_expired`, `canceled` — never canonical; if `User.stripeSubscriptionId` points to one, repair by searching for a manageable sibling on the same customer.

See [SubscriptionReferenceService.ts:13-32](../../src/services/subscription/SubscriptionReferenceService.ts#L13-L32).

## Anchor billing day

Australian users joining on the **25th, 26th, or 27th** are anchored to renew on the **24th** of the following month. This guarantees ≥ 3 days to recover from a failed renewal before the major-draw window (28th–27th).

Implementation: `getSubscriptionCreateParamsForAnchor(joinDate)` in `create-subscription` / `create-subscription-existing-user` / `renew-subscription` routes (under [billing-stripe](../billing-stripe/)). Period-end resolution lives in `getSubscriptionPeriodEnd(sub)` at [src/utils/payment/stripe/subscription-period.ts](../../src/utils/payment/stripe/subscription-period.ts) and is reused by the cancel API, the webhook, and the migration script.

See [rules.md](./rules.md#billing-anchor-24th) for the full rule set.

## Pause-collection lifecycle

When a renewal fails, Stripe will keep generating invoices each cycle while the subscription is `past_due`, stacking charges. We mitigate by setting `pause_collection: { behavior: "keep_as_draft" }` after the failure — new invoices stay draft until collection resumes.

```
invoice.payment_failed (billing_reason=subscription_cycle)
   └──► pauseAfterRenewalFailure(subId)
            sets subscription.pause_collection = { behavior: "keep_as_draft" }

[time passes; user retries OR admin charges past-due OR auto-recovery]

invoice.payment_succeeded (eligible)
   └──► resumeAfterSuccessfulRenewalPayment(subId)  ← MUST run before benefit application
            clears subscription.pause_collection
```

The `resume` call is **idempotent** — safe to call when not paused. It runs *before* `processPaymentBenefits` in the webhook so a slow benefits path (or Stripe CLI / proxy timeout) cannot leave `pause_collection` orphaned. See [gotchas.md](./gotchas.md#pause-collection-orphans) for the failure modes this protects against.

## Cancellation flow

Single shared service: `cancelSubscription(user, options)` at [CancelSubscriptionService.ts](../../src/services/subscription/CancelSubscriptionService.ts). Used by both the user-facing route (`/api/stripe/cancel-subscription`) and the admin route (`/api/admin/users/[id]/cancel-subscription`).

Behaviour:
- `cancelAtPeriodEnd: true` (default) → `subscriptions.update(id, { cancel_at_period_end: true })`. User keeps access until period end.
- `cancelAtPeriodEnd: false` → `subscriptions.cancel(id)`. Access revoked now.
- **`status === "past_due"` always cancels immediately**, regardless of the option, since there is no current period to preserve.

Side effects (always, in order):
1. Mongo: `subscription.{autoRenew=false, cancelledAt=now, endDate, status, isActive}` updated.
2. **Partner-discount queue** ended via `handleSubscriptionQueueUpdate(user, "end")` — *only when cancelling immediately*.
3. Klaviyo profile sync (non-blocking).
4. `recordCancellationAnalytics()` writes a `MembershipStatusHistory` row (non-blocking).
5. `lastMonthAccumulatedEntries` is **preserved** on the user doc for potential resubscribe.

Cancellation-event analytics emission is centralised in the **`customer.subscription.deleted` webhook**, not the API path, to avoid double-counting.
