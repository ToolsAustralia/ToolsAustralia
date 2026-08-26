# Infrastructure — Backend

## Health

`/api/health/` — basic liveness check. Used by uptime monitoring and load balancers.

## Cron

`/api/cron/` — scheduled job endpoints. Each route is invoked by the cron runner (Vercel cron or external scheduler).

Known crons:
- `/api/cron/major-draw-transition` — daily 1:30 UTC ([draws](../draws/))
- _TODO: enumerate others_

Cron routes should authenticate via a shared secret (env var) before running, otherwise anyone can trigger cron logic by hitting the endpoint.

## Upload / Images

`/api/upload/` — produce signed Cloudinary upload URLs. Server signs with Cloudinary API secret; client uploads directly to Cloudinary.

`/api/images/` — image serving / processing endpoints (e.g. dynamic transformations).

Cloudinary client lives at [src/lib/cloudinary.ts](../../src/lib/cloudinary.ts). Besides the upload helpers it exposes two **deletion** helpers (added 2026-06-11 for prize-image cleanup):

- `cloudinaryPublicIdFromUrl(url)` — reverse-engineers a Cloudinary `public_id` from a stored `secure_url` (we persist URLs, not ids). Strips the optional transformation segments + the `v<version>/` prefix and the file extension; returns `null` for non-Cloudinary / unparseable URLs.
- `deleteCloudinaryImageByUrl(url)` — best-effort `uploader.destroy` by URL. Returns `true` on `"ok"` or `"not found"`, `false` on any failure; **never throws** (logs via `console.error`), so callers can fire-and-forget without risking the request.

These back the draws-domain prize-image cleanup-on-save — when a draw's prize image is removed and saved, its Cloudinary asset is permanently deleted to reclaim storage, guarded so images still referenced by a `Winner` record are kept (see [docs/admin/architecture.md](../admin/architecture.md)).

## Package scripts — partner catalogue (2026-07-24)

Entries added for the rewards-return feature (partner domain — full docs in
[docs/partner/](../partner/)): `build:partner-catalog` (regenerates
`src/generated/partnerCatalog{Offers,Preview}.ts` from the committed vendor CSV at
`src/data/partner-catalog/offers-list-breakdown.csv`; **wired into `prebuild`/`predev`** like the
sibling generators — the output is committed, so a CSV edit without regeneration fails the next
build via the script's pinned totals; a genuine catalogue update means consciously re-pinning
`EXPECTED_TOTAL`/`EXPECTED_CUMULATIVE`), `test:unlock-packages`, and `test:portal-return` (tsx
regression tests for `src/utils/partner-discounts/{unlock-packages,portal-return}.ts`).

## Zod helpers

[src/lib/zod/](../../src/lib/zod/) — shared schemas (e.g. ObjectId validator, common request shapes). Use these instead of duplicating validation logic across handlers.

## Date utilities

[src/utils/dates/](../../src/utils/dates/) — Sydney-aware date helpers using `date-fns-tz`. Anchor billing, draw timing, etc. all flow through these.

## Validation

[src/utils/validation/](../../src/utils/validation/) — generic input validation helpers (sanitize strings, validate ObjectIds outside Zod, etc.). `admin-user-update.ts`'s subscription-update schema accepts `status`, `isActive`, and the dates but **not** `autoRenew` (removed 2026-07): the admin form used to write that flag straight to the DB with no Stripe call, desyncing from `cancel_at_period_end`. Scheduling/undoing a cancellation is Stripe-backed via the cancel modal instead — see [docs/admin/frontend.md](../admin/frontend.md).

## Webhook

[src/utils/webhook/](../../src/utils/webhook/) — generic webhook helpers (signature verification, payload parsing, retry handling). Stripe webhook is handled in [billing-stripe](../billing-stripe/).

## `reconcile-klaviyo-profiles` cron (2026-08-26)

Two schedules on one route
([`src/app/api/cron/reconcile-klaviyo-profiles`](src/app/api/cron/reconcile-klaviyo-profiles/route.ts)):

| schedule | mode | purpose |
|---|---|---|
| `*/5 * * * *` | incremental | re-sync users whose `updatedAt` moved since the watermark |
| `7 * * * *` | `?mode=full` | hourly pass over a rotating cursor, for time-derived properties that dirty no document (~7-day circuit at 56k profiles, ~27 days at 4x) |

Auth **fails closed** (matches `reconcile-renewal-grants` / `charge-past-due`): a missing
`CRON_SECRET` returns 401 rather than leaving the endpoint open. Findings are reported via
`console.error` with a greppable `[reconcile-klaviyo-profiles]` prefix — the only log level
that survives `compiler.removeConsole` — matching the sibling `reconcile-*` crons. Four
findings lines: sync failures, time-budget exhaustion on an incremental run, backlog above
threshold, and entry-ledger divergence.

`maxDuration = 60`, and the service self-limits at `MAX_RUN_MS = 45s`. That limit is measured,
not guessed: a 500-user page took 66.6s, and a Vercel-killed run would have lost its work and
left the watermark unmoved. Brings `vercel.json` to **24** cron entries.

## Klaviyo profile accuracy scripts (2026-08-26)

| script | npm |
|---|---|
| backfill all profiles with corrected properties | `backfill:klaviyo-accuracy` / `:dry` |
| verify the result (read-only) | `verify:klaviyo-accuracy` |

The backfill runs the **same service the cron runs** in `full` mode, paged by an
`afterUpdatedAt` cursor — there is no separate backfill logic to keep true. `--dry-run` is the
default; `--live` writes; `--prod` targets `PROD_MONGODB_URI` via `connectOpsDb`. It appends a
CSV audit trail, logs `processed/total (%) · rate/sec · ETA` on ~20 lines, and exits 0 / 1 / 2.

A **live** run additionally requires `KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true` — the script
deliberately does not set it, because that is the point of the guard.

Also registered three pre-existing scripts that had no npm entry and were therefore
undiscoverable: `sync:klaviyo-profiles`, `sync:klaviyo-profiles-bulk`,
`migrate:klaviyo-draw-properties`.

## New env var: `KLAVIYO_ALLOW_DEV_PROFILE_WRITES`

Off by default. Dev and production share one Klaviyo account, so profile **mutation** is
refused outside `KLAVIYO_MODE=production` unless this is `"true"`. Events are unaffected —
they carry a `[DEV]` prefix. Set it explicitly for a sanctioned ops backfill, never in a
script. Registered in `.env.example`.
