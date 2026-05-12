# Tracking — API

## Endpoints

- **`POST /api/tracking/conversion`** — provider-agnostic conversion event. Body is a `CanonicalEvent`. Response: `{ ok, results: { facebook, tiktok, snapchat } }`. See [`src/app/api/tracking/conversion/route.ts`](../../src/app/api/tracking/conversion/route.ts).
- ~~`POST /api/facebook/track`~~ — **removed 2026-05-12**. Use `POST /api/tracking/conversion`.
- `POST /api/tracking/promo-page-visit` — unchanged.

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/facebook/**` | Meta-specific endpoints |
| _TODO_ | `/api/tracking/**` | Generic tracking |

> _TODO: read [src/app/api/facebook/](../../src/app/api/facebook/) and [src/app/api/tracking/](../../src/app/api/tracking/) and document each handler._
