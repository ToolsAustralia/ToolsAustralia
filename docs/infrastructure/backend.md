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

## Product image formats (2026-08-21)

`src/constants/product-images.ts` is the single list, imported by both the client picker
(`ImageUpload`) and the server guard (`/api/upload`). It was previously typed out in three
places, which is how a format ends up accepted by the file input and rejected by the API —
the upload appears to start and dies with "File type not supported".

Accepted: **JPEG, PNG, WebP, AVIF, HEIC/HEIF**. HEIC is the one that mattered in practice —
it is what an iPhone photographs in by default, so staff shooting a product on a phone hit
the rejection constantly with no hint that the fix was "export as JPEG". Cloudinary
transcodes all of them on ingest, so `next/image` never sees a HEIC.

Deliberately excluded: `image/gif` (animation has no place in a product shot) and
`image/svg+xml` (an SVG can carry script — an XSS vector, not a photograph).

The server list is the one that matters. The client `accept` attribute only filters the file
picker and a determined caller can POST anything; never rely on the client half for safety.

## `cleanup:abandoned-shop-orders` (2026-08-21)

Retires pending shop orders left by two now-fixed bugs (the duplicate-checkout mint and the
invalid `"failed"` status write — see [cart-shop-products/backend.md](../cart-shop-products/backend.md)).
Both fixes are forward-only; this clears what is already in the collection.

```bash
npm run cleanup:abandoned-shop-orders:dry     # always first
npm run cleanup:abandoned-shop-orders
```

**The safety rule:** an order is only retired once STRIPE says its payment cannot succeed.
The PaymentIntent is retrieved first, and anything `succeeded` or `processing` is left
untouched and written to the CSV as needing reconciliation — that is a **paid order whose
webhook never landed**, and touching it would destroy the only record of money owed goods
for. The final summary calls that count out separately for exactly that reason.

Retire means `status: "cancelled"` with a `notes` reason, not deletion — the audit trail
survives and every counting surface already excludes cancelled. The update is gated on
`status: "pending"`, so a webhook landing mid-sweep always wins.
