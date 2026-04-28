# Subscription domain

Membership lifecycle: signup, renewal, cancellation, recovery from failed payments. Built on top of Stripe Subscriptions, with denormalised state on the `User` document and event-sourced history in `MembershipStatusHistory`.

## Index

- [architecture.md](./architecture.md) — High-level data flow, Stripe ↔ Mongo sync, lifecycle states
- [frontend.md](./frontend.md) — Hooks (`useStripeSubscription`, `useMemberships`, `useActivePackage`, `useMembershipModal`) and how the UI reads subscription state
- [backend.md](./backend.md) — Services (`CancelSubscriptionService`, `SubscriptionCollectionPauseService`, `SubscriptionReferenceService`) and policy helpers
- [api.md](./api.md) — `/api/memberships`, `/api/subscription/benefits` route reference
- [rules.md](./rules.md) — Hard invariants (no charge after cancel, billing anchor, pause/resume, period-end resolution)
- [patterns.md](./patterns.md) — Recurring conventions: canonical Stripe ID repair, manageable status set, dedupe keys
- [gotchas.md](./gotchas.md) — Known sharp edges (past-due cancel, paused-collection drafts, expand-pitfall, `keep_as_draft` invisible invoices)
- [models.md](./models.md) — `User.subscription`, `MembershipPackage`, `MembershipRenewalCycle`, `MembershipStatusHistory`, `ChargeJobLock`
- [testing.md](./testing.md) — How the standalone tsx tests run

## Related domains

- **[billing-stripe](../billing-stripe/)** — `lib/stripe.ts`, `PaymentEvent`/`ProcessedStripeEvent`/`InvoiceChargeLog` models, the `/api/stripe/**` webhook & helper routes that feed subscription state.
- **[payment](../payment/)** — Payment Intent / Setup Intent flows used for new signups, renewal-failure pay-now, and saved card management.
- **[admin](../admin/)** — Admin cancel-subscription UI and the `chargePastDueShared` operational tool.
- **[promo](../promo/)** — Cancelled-membership comeback promo (separate doc but cross-references subscription state).

## Ownership

Original Cursor agent boundary: `.cursor/agents/stripe-billing.md` — see [patterns.md](./patterns.md) for how to use it.
