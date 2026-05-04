# Draws domain

Major Draw (monthly) and Mini Draws (per-product). Tickets, eligibility, segment snapshots, winners, public results pages.

## Index

- [architecture.md](./architecture.md) — major vs mini, monthly cycle, segment snapshots, transitions
- [frontend.md](./frontend.md) — pages, countdown, share buttons, hooks
- [backend.md](./backend.md) — utils/draws helpers, transition service, segment snapshot logic
- [api.md](./api.md) — `/api/major-draw/**`, `/api/mini-draw/**`, `/api/winners/**`
- [rules.md](./rules.md) — eligibility, purchase cooldown, anchor-day relevance
- [patterns.md](./patterns.md) — gate-http guard, ticket-entry idempotency
- [gotchas.md](./gotchas.md) — major-draw transitions, accumulator preservation
- [models.md](./models.md) — MajorDraw, MiniDraw, TicketEntry, Winner, MonthlyEntryCampaign, SegmentSnapshot
- [testing.md](./testing.md) — draw-ending scripts (1-4), helpers tests

## Related domains

- **[subscription](../subscription/)** — accumulator field on `User.subscription` is consumed for monthly draw eligibility
- **[promo](../promo/)** — multipliers/bonus entries flow into ticket counts
- **[rewards-redeemables](../rewards-redeemables/)** — entry-reward toast and milestone progression
