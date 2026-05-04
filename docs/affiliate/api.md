# Affiliate — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/affiliate/**` | Affiliate auth, dashboard data, link management |

> _TODO: read [src/app/api/affiliate/](../../src/app/api/affiliate/) and document each handler._

## Authorization

Affiliate routes use the affiliate-specific auth (`affiliate-auth.ts`), NOT the main NextAuth member session. Don't mix the two — they have different access models.
