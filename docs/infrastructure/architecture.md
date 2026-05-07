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
  - [`scripts/migrations/add-shop-order-fields.ts`](../../scripts/migrations/add-shop-order-fields.ts) — backfills `gstAmount`/`shippingCost` and copies legacy `shippingAddress.address` → `addressLine1` for the shop checkout schema. Run via `npm run migrate:shop-order-fields:dry` first.
- `scripts/seed-admin-data.ts` — dev seed
- `scripts/fix-*.{ts,mjs,js}` — one-off operational fixes

**Destructive script convention:** Scripts that delete or mutate production data should default to dry-run and require an explicit `--live` flag to actually execute. The `:dry` npm variant is the bare invocation; the live variant passes `--live`. See `scripts/cleanup-membership-backfill-rows.ts` for a current example, or `scripts/backfill-subscription-end-dates.ts` for the equivalent pre-existing pattern.

## Vercel cron schedules

[`vercel.json`](../../vercel.json) lists the registered cron paths and schedules. Times are UTC.

| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/major-draw-transition` | `0 14 * * *` | Daily — advances draw lifecycle |
| `/api/cron/process-partner-discount-queues` | `0 15 * * *` | Daily — clears partner discount queue |
| `/api/cron/ab-testing-experiments` | `0 * * * *` | Hourly — A/B test scheduling |
| `/api/cron/ab-testing-aggregate-metrics` | `0 3 * * *` | Daily — A/B test metrics roll-up |
| `/api/cron/sync-meta-spend-by-url` | `30 2 * * *` | Daily — Meta ad spend sync |
| `/api/cron/membership-daily-snapshot` | `0 14 * * *` and `0 15 * * *` | Daily ×2 — writes yesterday's `MembershipDailySnapshot` per package. Idempotent upsert; the second fire is a no-op for redundancy. |

`Australia/Sydney`-anchored crons fire at 14:00 UTC = 00:00 AEST / 01:00 AEDT, and 15:00 UTC = 01:00 AEST / 02:00 AEDT — both are after Sydney midnight in either DST regime, so they reliably write "yesterday" in local time. See [`docs/subscription/architecture.md`](../subscription/architecture.md) for the full membership-snapshot flow and `scripts/test-membership-snapshot-dst.ts` for the DST verification test.

## Env handling

`lib/environment.ts` validates and exposes env vars. Don't access `process.env.X` directly — go through this module so missing/invalid vars fail fast at boot.

## Migrated from `src/docs/ENVIRONMENT_SETUP.md`

> _TODO: read root file and merge._
