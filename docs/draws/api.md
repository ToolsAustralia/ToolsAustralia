# Draws — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/major-draw/**` | Major-draw read & entry-related routes |
| _TODO_ | `/api/mini-draw/**` | Mini-draw routes (parallel with major) |
| _TODO_ | `/api/winners/**` | Public winners feed |

> _TODO: read [src/app/api/major-draw/](../../src/app/api/major-draw/), [src/app/api/mini-draw/](../../src/app/api/mini-draw/), [src/app/api/winners/](../../src/app/api/winners/) and document each handler. Currently only inventoried._

## Cross-domain routes

| Route | Purpose |
|---|---|
| `/api/cron/major-draw-transition` | Daily transition cron (1:30 UTC) |
| `/api/stripe/webhook` | Triggers transitions before payment processing |
| `/api/stripe/create-one-time-purchase` | Mini-draw package purchase flow ([billing-stripe](../billing-stripe/)) |

## Authorization

- **Public reads**: `/api/winners/`, `/api/major-draw/` (current), `/api/mini-draw/` listing — no auth required, used by public pages.
- **Authenticated entry**: ticket entry routes require session (NextAuth) — gate inside the handler, middleware doesn't cover `/api/**`.
- **Admin**: under `/api/admin/**` (the [admin](../admin/) domain) for manual draw management, winner declaration, etc.

## Public pages that consume

- `/major-draw` — current draw + countdown
- `/mini-draws/[id]` — mini-draw detail
- `/winners` — winner gallery (public-safe formatted)
- `/draw-results` — past major-draw results
