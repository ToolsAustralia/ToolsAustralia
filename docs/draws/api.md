# Draws — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/major-draw/**` | Major-draw read & entry-related routes |
| GET | `/api/major-draw/completed` | All `status: "completed"` major draws, newest first, each joined to its `Winner` row (name, state, email, entry number, selection method/selector, `imageUrl`, `drawResultUrl`) plus `participantCount` from `entries.length`. Populates `Winner.userId` / `selectedBy`, so it must **side-effect import `@/models/User`** — see [gotchas.md](./gotchas.md#apimajor-drawcompleted-500d-on-missingschemaerror-model-user-2026-08-03). Not name-formatted — this route returns full names and emails, so keep it off public surfaces (contrast [patterns P5](./patterns.md#p5-public-formatted-vs-internal-data)). |
| _TODO_ | `/api/mini-draw/**` | Mini-draw routes (parallel with major) |
| GET | `/api/winners/all` | Public winners feed (major + mini, optional `?drawType=` filter, `?limit=` default 20). Edge-cached 5min via `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` and `revalidate = 300` segment config. DB queries are pre-`.limit()`ed so cache misses still bound payload size. The major+mini merge lives in the shared loader [`getAllWinners()`](../../src/utils/draws/get-all-winners.ts) (the route is a thin wrapper); the `/draw-results` page calls the same loader for SSR. |
| GET | `/api/winners/major-draws` | Major-draw winners only (already DB-limited; no edge cache). |
| GET | `/api/winners/latest` | Latest winner (cached `revalidate=60`). |

> _TODO: read [src/app/api/major-draw/](../../src/app/api/major-draw/), [src/app/api/mini-draw/](../../src/app/api/mini-draw/), [src/app/api/winners/](../../src/app/api/winners/) and document each handler. Currently only inventoried._

## Cross-domain routes

| Route | Purpose |
|---|---|
| `/api/cron/major-draw-transition` | Daily transition cron (1:30 UTC) |
| `/api/stripe/webhook` | Triggers transitions before payment processing |
| `/api/mini-draw/purchase` | **The** mini-draw pack purchase flow — the only route that stamps `miniDrawId` |
| `/api/stripe/create-one-time-purchase` | Membership / one-time packs ([billing-stripe](../billing-stripe/)). **Rejects mini-draw ids with 400 `MINI_DRAW_PACKAGE_WRONG_ENDPOINT`** — it has no draw in scope, so it cannot grant one |

## Authorization

- **Public reads**: `/api/winners/`, `/api/major-draw/` (current), `/api/mini-draw/` listing — no auth required, used by public pages.
- **Authenticated entry**: ticket entry routes require session (NextAuth) — gate inside the handler, middleware doesn't cover `/api/**`.
- **Admin**: under `/api/admin/**` (the [admin](../admin/) domain) for manual draw management, winner declaration, etc.

## Public pages that consume

- `/major-draw` — current draw + countdown
- `/mini-draws/[id]` — mini-draw detail
- `/winners` — winner gallery (public-safe formatted)
- `/draw-results` — past major-draw results
