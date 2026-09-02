# Admin — Architecture

## Layout

| Path | Role |
|---|---|
| [src/app/admin/](../../src/app/admin/) | Admin panel pages (tab-based, `/admin/[tab]`) |
| [src/components/admin/](../../src/components/admin/) | Admin-specific components (UserDetailModal, ChargePastDueModal, etc.) |
| [src/app/api/admin/](../../src/app/api/admin/) | Admin API routes — catch-all for routes not owned by another domain |
| [src/features/admin/](../../src/features/admin/) | Admin feature modules |
| [src/server/admin/](../../src/server/admin/) | Server-only admin code (e.g. `chargePastDueJob.ts` chunked-charge engine, `chargePastDueShared.ts`) |
| [src/hooks/useAdminDateToolbarSlot.ts](../../src/hooks/useAdminDateToolbarSlot.ts) | Admin-specific UX hook |

## Auth

Per [auth rules R1-R2](../auth/rules.md): middleware gates `/admin/**` PAGES; per-handler `requireAdmin(session)` gates `/api/admin/**` ROUTES. Both layers required.

## Tabbed admin panel

`/admin/[tab]/` — single dynamic route hosts the tabbed interface. Each tab renders a different feature surface (users, payments, draws, promo, errors, etc.).

## Key admin features

- User detail modal (with subscription tab → cancel subscription)
- Charge past-due modal (bulk retry failed renewals — now a client-driven **chunked** job with a live progress bar; see [api.md](./api.md#post-apiadmininvoicescharge-past-due--chunked-charge-job) and [backend.md](./backend.md#server-only-code))
- Error reports triage
- Promo / campaign management (see also: `PromoPurchaseEntriesPreview` for live per-package entry preview in Toggle Promos modal)
- **Upsell Multiplier panel** — `GET/PUT /api/admin/upsell-multipliers`; singleton `UpsellMultiplierConfig` document with three knobs (`membership`, `oneTime`, `additional`). See [frontend.md](./frontend.md#upsell-multiplier-panel-promomanagement--upsell-multipliers-tab--2026-05-14) and [billing-stripe/backend.md](../billing-stripe/backend.md#upsell-stripe-descriptions).
- Affiliate management
- Draw management
- Dashboard stats daily snapshot — `src/services/admin/dashboard-stats/` subsystem. See [backend.md](./backend.md#services) and [models.md](./models.md#dashboardstatsdailysnapshot).

## User Detail Modal

### Draw entry picker (Activity tab → Edit Entries)

The "Manage Draw Entries" form (admin edit mode in the Activity tab) uses
`src/components/admin/DrawSelect.tsx` to pick draws by name and image
instead of pasting ObjectIds. Two hooks back it:

- `useAdminMajorDrawsList` → `GET /api/admin/major-draw/history?limit=100`
- `useAdminMiniDrawsList`  → `GET /api/admin/mini-draw/list?limit=100`

Both are lazy (`enabled` bound to `activeEditTab === "activity"`) and cached
for 5 minutes. The payload sent to the existing
`/api/admin/users/[id]` route is unchanged — `drawId` / `miniDrawId` are
still ObjectId strings.

### Prize-image cleanup on draw save (2026-06-11)

When a major draw is saved via `PUT /api/admin/major-draw/update` ([route](../../src/app/api/admin/major-draw/update/route.ts)) and `prize.images` is part of the update, the route fires a **best-effort** cleanup: [`deleteRemovedPrizeImages(oldImages, newImages)`](../../src/utils/draws/delete-removed-prize-images.ts) (draws domain) permanently deletes the Cloudinary assets for any image dropped from the prize, reclaiming storage.

Safety guards:
- An image is **never** deleted if it's still referenced by a `Winner` record (its `prizeSnapshot.images` or `imageUrl`), so historical winner artwork can't be 404'd.
- The helper swallows its own errors and never throws, so a Cloudinary hiccup can't block (or fail) the admin save. Deletion uses [`deleteCloudinaryImageByUrl`](../../src/lib/cloudinary.ts) (see [infrastructure/backend.md](../infrastructure/backend.md#upload--images)).

### Edit Draw links (2026-06-11)

The [`MajorDrawEditModal`](../../src/components/modals/draws/MajorDrawEditModal.tsx) has a **Draw Links** section with two optional fields, persisted on the `MajorDraw` model:

- **View Results Link** → `resultUrl` (the randomdraws verification page).
- **Watch Draw Link** → `watchUrl` (the Facebook live-draw / announcement video).

Wiring (full chain): the [history route](../../src/app/api/admin/major-draw/history/route.ts) returns both fields per draw → `DrawResults.tsx` `convertToMajorDrawData` pre-fills them into the modal (so re-saving never clobbers an existing link with an empty string) → [`PUT /api/admin/major-draw/update`](../../src/app/api/admin/major-draw/update/route.ts) validates (`z.string().trim().max(2000)`, empty string clears) and `$set`s them.

**Locked-draw exception:** both fields are in the route's `allowedFields` allowlist and the modal leaves them enabled even when `configurationLocked` is true — these links are normally added *after* a draw completes (and locks).

Public surfacing of these two fields is documented in [draws/frontend.md](../draws/frontend.md#draw-level-result--watch-links-2026-06-11). (These draw-level reads are **not** mirrored to Norm; could be added if useful.)
