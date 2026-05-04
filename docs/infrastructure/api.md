# Infrastructure — API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health/` | Public | Liveness check |
| GET/POST | `/api/cron/**` | Cron secret | Scheduled jobs |
| POST | `/api/upload/**` | Session | Cloudinary upload signing |
| GET | `/api/images/**` | Public/session | Image serving |

> _TODO: read each handler under [src/app/api/health/](../../src/app/api/health/), [src/app/api/cron/](../../src/app/api/cron/), [src/app/api/upload/](../../src/app/api/upload/), [src/app/api/images/](../../src/app/api/images/) and document._
