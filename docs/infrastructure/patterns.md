# Infrastructure — Patterns

## P1. Validated env at boot

`lib/environment.ts` parses + validates env vars at startup. Missing/invalid → throw immediately. Don't lazy-validate (silent runtime failures).

## P2. Cron auth via shared secret

```ts
const secret = req.headers.get("x-cron-secret");
if (secret !== process.env.CRON_SECRET) return new Response("forbidden", { status: 403 });
// run job
```

## P3. Signed Cloudinary URLs

Client-direct uploads (don't proxy through our server). Server returns a signed URL; client POSTs the file directly to Cloudinary.

## P4. Sydney TZ via `date-fns-tz`

```ts
import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
const sydneyNow = utcToZonedTime(new Date(), "Australia/Sydney");
```

## P5. Operational scripts dry-run by default

```ts
const live = process.argv.includes("--live");
if (!live) console.log("DRY RUN — not committing");
// ... compute changes ...
if (live) await commit();
```

## P6. Read-only audit scripts (`find:*` / `list:*`)

Scripts under `scripts/find-*.ts` are read-only — they never write to the DB. They are exposed as `npm run find:*` entries and are safe to run against production. Read-only audits never mutate, so they skip the `--dry-run` / `:dry` rule (there is nothing to make safe) and skip `connectDB()` when they only call a third party. They still load env via dotenv, fail fast on missing credentials, write the report to **stdout** and progress/warnings to **stderr**, and exit non-zero on hard errors.

**`npm run find:renewal-rate`** (`scripts/find-renewal-rate.ts`) — cross-checks the Renewal Rate KPI by querying live data directly. Modes:

| Flag | Behaviour |
|---|---|
| *(default)* | Prints renewal rate buckets for the current and last draw periods |
| `--last-draw` | Restricts output to the last completed draw period |
| `--draw N` | Queries a specific draw by number |
| `--coverage` | Audits `MembershipDailySnapshot` coverage — shows which draw-start dates have a snapshot and which are missing |

Use this to validate that the dashboard KPI card matches raw DB counts. See [admin/backend.md](../admin/backend.md#renewal-rate-kpi-2026-05-29) for the service-layer definition.

**`npm run find:klaviyo-legacy-fields`** enumerates Klaviyo templates/flows/segments via GET and reports any that still reference the legacy camelCase properties `first_name` / `last_name` / `user_id`. Add a `--json` flag when the output may feed another tool.
