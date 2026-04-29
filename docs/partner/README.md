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
- [models.md](./models.md) — PartnerApplication, PartnerDiscount
- [testing.md](./testing.md) — _TODO_

## Related domains

- **[subscription](../subscription/)** — cancel service calls `handleSubscriptionQueueUpdate(user, "end")` on immediate cancel
