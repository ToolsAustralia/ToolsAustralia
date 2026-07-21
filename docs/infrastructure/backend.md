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

## Zod helpers

[src/lib/zod/](../../src/lib/zod/) — shared schemas (e.g. ObjectId validator, common request shapes). Use these instead of duplicating validation logic across handlers.

## Date utilities

[src/utils/dates/](../../src/utils/dates/) — Sydney-aware date helpers using `date-fns-tz`. Anchor billing, draw timing, etc. all flow through these.

## Validation

[src/utils/validation/](../../src/utils/validation/) — generic input validation helpers (sanitize strings, validate ObjectIds outside Zod, etc.). `admin-user-update.ts`'s subscription-update schema accepts `status`, `isActive`, and the dates but **not** `autoRenew` (removed 2026-07): the admin form used to write that flag straight to the DB with no Stripe call, desyncing from `cancel_at_period_end`. Scheduling/undoing a cancellation is Stripe-backed via the cancel modal instead — see [docs/admin/frontend.md](../admin/frontend.md).

## Webhook

[src/utils/webhook/](../../src/utils/webhook/) — generic webhook helpers (signature verification, payload parsing, retry handling). Stripe webhook is handled in [billing-stripe](../billing-stripe/).
