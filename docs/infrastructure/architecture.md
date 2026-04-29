# Infrastructure — Architecture

## Files

| Path | Purpose |
|---|---|
| [src/app/api/health/](../../src/app/api/health/) | Health check endpoint |
| [src/app/api/cron/](../../src/app/api/cron/) | Cron entry endpoints |
| [src/app/api/upload/](../../src/app/api/upload/) | File upload endpoints (Cloudinary signing, etc.) |
| [src/app/api/images/](../../src/app/api/images/) | Image-serving / processing endpoints |
| [src/lib/cloudinary.ts](../../src/lib/cloudinary.ts) | Cloudinary SDK config |
| [src/lib/environment.ts](../../src/lib/environment.ts) | Env var parsing / validation |
| [src/lib/zod/](../../src/lib/zod/) | Shared Zod schemas / helpers |
| [src/utils/dates/](../../src/utils/dates/) | Date utilities (Sydney TZ aware) |
| [src/utils/validation/](../../src/utils/validation/) | Generic validation helpers |
| [src/utils/webhook/](../../src/utils/webhook/) | Webhook signature verification helpers |

## Operational scripts

[scripts/](../../scripts/) — many operational scripts. Per CLAUDE.md naming conventions:
- `migrate-*.ts` → migrate:* npm script
- `backfill-*.ts` → backfill:*
- `cleanup-*.ts` → cleanup:*
- `sync-*.ts` → sync:*
- `stripe-*.ts` → stripe:*
- `find-*.ts` → find:*

Plus:
- `scripts/migrations/` — date-prefixed migrations
- `scripts/seed-admin-data.ts` — dev seed
- `scripts/fix-*.{ts,mjs,js}` — one-off operational fixes

**Destructive script convention:** Scripts that delete or mutate production data should default to dry-run and require an explicit `--live` flag to actually execute. The `:dry` npm variant is the bare invocation; the live variant passes `--live`. See `scripts/cleanup-membership-backfill-rows.ts` for a current example, or `scripts/backfill-subscription-end-dates.ts` for the equivalent pre-existing pattern.

## Env handling

`lib/environment.ts` validates and exposes env vars. Don't access `process.env.X` directly — go through this module so missing/invalid vars fail fast at boot.

## Migrated from `src/docs/ENVIRONMENT_SETUP.md`

> _TODO: read root file and merge._
