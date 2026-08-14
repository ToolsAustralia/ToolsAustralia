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
| `--current-cycle` | Oracle mode that mirrors `getCurrentCycleRenewalProgress()` exactly: cycle start = last completed draw date + 1 day (AEST), cycle end = now; numerator = distinct succeeded/recovered `MembershipRenewalCycle` rows in the cycle; denominator = `getRenewalBaseAsOf(cycleStart)`. Use this to cross-check the headline KPI card value. |

Use this to validate that the dashboard KPI card matches raw DB counts. See [admin/backend.md](../admin/backend.md#renewal-rate-kpi-2026-05-29-updated-2026-06-02) for the service-layer definition.

**`npm run find:klaviyo-legacy-fields`** enumerates Klaviyo templates/flows/segments via GET and reports any that still reference the legacy camelCase properties `first_name` / `last_name` / `user_id`. Add a `--json` flag when the output may feed another tool.

**`npm run find:direct-attribution`** (`scripts/find-direct-attribution.ts`) — classifies the "direct" conversion bucket: for every non-renewal `BenefitsGranted` with `convertingPlatform` `direct`/null in the window, checks the persisted touch evidence (event `data.utmSource` → `user.signupAttribution`) through the resolver's own `normalizeUtmToPlatform` and buckets it as `paid-touch-in-window` (the real leak — cookies lost to ITP/cross-device), `paid/klaviyo-touch-expired` (correctly direct under the window model), `unrecognized-source`, `organic-no-signal`, or `null-unstamped`. Options: `--days=N` (default 35), `--env=FILE` (e.g. `--env=.env.production` for a prod read), `--verbose` (per-row lines, userId only — no PII), `--limit=N`. Read-only; prints counts/percentages + median expired-touch age.

## `migrate:backfill-mini-draws-participants` (2026-08-13)

`scripts/migrations/2026-08-13-backfill-mini-draws-view-participants.ts` grants
`miniDraws.viewParticipants` to every role that already holds `miniDraws.view`.

Second instance of the **carve-out backfill** pattern (after
`2026-08-13-backfill-users-view-detail.ts`). The shape is fixed and worth reusing verbatim
whenever a permission is split out of an existing one:

- **Dry-run by default**, `--apply` to write, `--production` to target `.env.production`.
  `dotenv.config()` must run *before* importing anything that reads `MONGODB_URI` — `src/lib/mongodb.ts`
  resolves it at import time and throws if unset.
- **`$all: [VIEW], $nin: [NEW]`** to select, `$addToSet` to write — idempotent and re-runnable
  within a single deploy window.
- **It must NOT go in `migrate-seed-staff-roles.ts`.** That script is re-runnable by design; this
  one is not. Once an operator deliberately revokes the new permission from a role, that role
  still holds the old one, so a re-seed would match it again and silently re-grant what they just
  removed — a routine re-seed becoming a privacy regression.

Run it **with** the deploy that adds the permission, not after: until it runs, every custom role
loses the access the carve-out took away.
