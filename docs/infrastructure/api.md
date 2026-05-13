# Infrastructure — API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health/` | Public | Liveness check |
| GET/POST | `/api/cron/**` | Cron secret | Scheduled jobs |
| POST | `/api/upload/**` | Session | Cloudinary upload signing |
| GET | `/api/images/**` | Public/session | Image serving |

> _TODO: read each handler under [src/app/api/health/](../../src/app/api/health/), [src/app/api/cron/](../../src/app/api/cron/), [src/app/api/upload/](../../src/app/api/upload/), [src/app/api/images/](../../src/app/api/images/) and document._

## Known cron routes

| Path | Schedule (UTC) | `maxDuration` / `memory` | Purpose |
|---|---|---|---|
| `/api/cron/dashboard-stats-daily-snapshot` | `0 14 * * *` and `0 15 * * *` | 300s / 1024MB | Re-upserts 90-day sliding window of `DashboardStatsDailySnapshot` rows. Idempotent. Second fire heals first-run failures. |

See [architecture.md](./architecture.md#vercel-cron-schedules) for the full cron table.
