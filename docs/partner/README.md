# Partner domain

Partner brand discounts. Partners offer discounts to active members; subscriptions enqueue users into "discount-eligible" windows; cancellation removes them.

## Index

- [architecture.md](./architecture.md) — discount queue, partner catalog, applications
- [frontend.md](./frontend.md) — `/partner/` page
- [backend.md](./backend.md) — partner-discount-queue, catalog-visibility
- [api.md](./api.md) — `/api/partner-applications/`, `/api/partner-discount/`
- [rules.md](./rules.md) — queue lifecycle, cancellation behaviour
- [patterns.md](./patterns.md) — queue-based eligibility, catalog visibility
- [gotchas.md](./gotchas.md) — partner-discount-queue interactions with cancel flow
- [models.md](./models.md) — PartnerApplication, PartnerDiscount, PartnerDiscountVisit
- [analytics.md](./analytics.md) — page analytics for `/discount` + the members' catalogue: what is measured, the four things that are easy to get wrong, and what it cannot tell you
- [testing.md](./testing.md) — _TODO_

## Related domains

- **[subscription](../subscription/)** — cancel service calls `handleSubscriptionQueueUpdate(user, "end")` on immediate cancel
- **[tracking](../tracking/)** — the two discount page-analytics beacons live under `/api/tracking/`
- **[admin](../admin/)** — the funnel is read on the Page Analytics tab
- **[internal-norm](../internal-norm/)** — mirrored at `/v1/partner-discount-analytics`
