# Infrastructure — Backend

## Health

`/api/health/` — basic liveness check. Used by uptime monitoring and load balancers.

## Cron

`/api/cron/` — scheduled job endpoints. Each route is invoked by the cron runner (Vercel cron or external scheduler).

Known crons:
- `/api/cron/major-draw-transition` — daily 1:30 UTC ([draws](../draws/))
- _TODO: enumerate others_

Cron routes should authenticate via a shared secret (env var) before running, otherwise anyone can trigger cron logic by hitting the endpoint.

### `/api/cron/monthly-redeemables-issuance` — trigger campaigns are excluded (2026-08-25)

The campaign selection is `campaign.monthKey === monthKey && !campaign.validForHours`.

`validForHours` marks a **trigger campaign**: each customer gets their own expiry window, minted one customer at
a time when the Klaviyo flow for their eligibility moment calls `POST /api/bonus-codes/v1/issue`. A cron
mass-mint would stamp the
entire targeted audience with one shared deadline and burn every one-per-lifetime grant with no customer action
and no email. `CampaignService` already refuses cron mass-mints defensively; this filter is the **second lock**,
so the cron does not even attempt one. Legacy (non-`validForHours`) campaigns are unaffected.

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

## Package scripts — `seed:bonus-code-campaigns` (2026-08-27)

`scripts/seed-bonus-code-campaigns.ts` creates the three per-customer bonus-code campaigns the Klaviyo
flow webhook mints against (BACKIN200 / LOCKIN100 / EXTRA100 — feature docs in
[docs/rewards-redeemables/](../rewards-redeemables/gotchas.md)).

- `npm run seed:bonus-code-campaigns:dry` — dry run (also the bare script's default).
- `npm run seed:bonus-code-campaigns` — writes. Add `--prod` to target production.

**Why a script when the admin UI can do this.** It reads the codes straight out of
`src/config/bonusCodes.ts`, so `code` cannot drift from what the marketing email hardcodes — the one
silent failure in the whole feature (a mismatch means the endpoint answers `200`, the email sends, and
every customer's code is refused at checkout with nothing alerting). The admin UI is otherwise the
better route: it carries the `StaffActivity` audit trail this script does not.

**`endsAt` is the open-ended sentinel, not a dated backstop (changed 2026-08-27).** It used to default
to "5 years out" and instruct a human to put a calendar note on 2031 — when that date passed, minting
would have stopped silently while the flow kept emailing. It now writes `NEVER_EXPIRES_ISSUANCE_DATE`
(`9999-12-31T23:59:59.999Z`) with `neverExpires: false`, meaning "no minting backstop; issues until an
admin disables it in Admin → Monthly Coupons". `neverExpires` stays **false** on purpose: that flag is
the *customer's* clock and would make the coupons themselves immortal — these expire in 72 hours. The
`--ends-at=` override and its `resolveEndsAt()` helper were deleted with the landmine.

Idempotent: `MonthlyEntryCampaign.code` is uniquely indexed, an existing campaign is reported and left
completely untouched, and the script never updates or deletes. Exit codes: `0` ok · `1` fatal · `2`
completed with errors.

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

## New env var: `DASHBOARD_STATS_AD_RESTATEMENT_WINDOW_DAYS` (2026-09-01)

Optional. How many trailing complete AEST days `/api/cron/dashboard-stats-daily-snapshot`
re-fetches from the ad providers on each run; older days reuse their stored `adChannels`
instead of calling Meta. **Unset → 10**; below 1 or unparseable also falls back to 10.

It exists because the cron rewrote a **90-day** window **three times a day** — ~270 Meta
Marketing API calls/day for days that cannot change — and Meta's per-app hourly limit was
being exhausted 9–13×/day. 10 covers the 7-day-click attribution window plus margin, and
strictly contains the 8-day window `sync-meta-ads` / `sync-tiktok-ads` themselves re-pull.
Widening is always the safe direction (it just fetches more). Registered in `.env.example`;
set it in Vercel **and** every `.env.local` if you ever change it (CLAUDE.md §9). Full
reasoning and the branch that must never be "optimised" away:
[admin/gotchas.md](../admin/gotchas.md#only-the-newest-10-days-are-re-fetched-from-the-ad-providers-2026-09-01).

New npm script alongside it: `npm run test:dashboard-stats-ad-restatement`.

## `migrate:remove-upsell-stats` (2026-08-27)

Strips the dead `upsellStats` sub-document from every user after the upsell tracker was
deleted (`docs/upsell/gotchas.md`).

```bash
npm run migrate:remove-upsell-stats:dry -- --prod   # report only
npm run migrate:remove-upsell-stats -- --prod       # perform it
```

`$unset` only — it touches no other field and cannot alter entries, billing or draw
participation. Batched by `_id` (1,000/batch) so no long single write sits on the hot `users`
collection, and an interrupted run resumes because already-unset documents stop matching.
Idempotent. Exit 0 clean / 1 fatal / 2 partial.

**Safety gate:** it counts `upsellStats.totalShown > 0` first and **refuses to run** if any
user carries real tracking data, so it cannot silently discard something that turned out to be
live. Verified against production 2026-08-27: 0 of 56,882 users had any, 56,882 to strip.

## `find:missing-retention-entries` (2026-08-26)

Read-only report of members who redeemed the 100-entry cancellation retention offer but never
received the draw entries it promised, caused by a silent-skip defect in the redeem route
(see `docs/upsell/gotchas.md`).

```bash
npm run find:missing-retention-entries -- --prod        # summary + first 15
npm run find:missing-retention-entries -- --prod --csv  # full list to CSV
```

Reports totals, a breakdown by redemption month, and (with `--csv`) the full list. Exit 0 when
none found, 2 when affected members exist. **The CSV contains customer emails — treat as PII and
do not commit it.**
## `RedeemableIssuance` (campaignId, code): sparse → partial (2026-08-27)

`scripts/migrations/2026-08-27-redeemable-issuance-partial-code-index.ts`

```bash
npm run migrate:issuance-partial-code-index:dry        # local, dry (default)
npm run migrate:issuance-partial-code-index            # local, apply
npm run migrate:issuance-partial-code-index:prod:dry   # PRODUCTION, dry
npm run migrate:issuance-partial-code-index:prod       # PRODUCTION, apply
```

Replaces `redeemableissuances.campaignId_1_code_1` — `unique + sparse` — with the same key as
`unique + partialFilterExpression: { code: { $exists: true } }`.

**Why it is a migration and not just the `schema.index()` change.** MongoDB does not re-option an
index that already exists: a `createIndex` with the same key and different options is either ignored
or an `IndexOptionsConflict`. The declaration on `src/models/RedeemableIssuance.ts` therefore only
helps **fresh** databases. Every existing environment needs the old index dropped and the new one
built. Full reasoning for the index itself in
[docs/rewards-redeemables/models.md](../rewards-redeemables/models.md#redeemableissuance) — in short,
a compound *sparse* index indexed code-less rows as `(campaignId, null)`, so a
`campaignMode: "global"` campaign could enrol exactly one customer, ever.

**Drop-then-create, and it has to be.** Building the replacement under a temporary name first — so
the unique guard is never absent — is not possible: Mongo refuses a second index with the same key
and the same options under a different name (`IndexOptionsConflict`, code 85; hit on the first run of
this script against dev, which is why the script now does it this way). There is a sub-second window
with `(campaignId, code)` unguarded. Acceptable: the only writer of a per-user `code` is
`generateUniqueCode`, whose output is random per call and which already retries on collision, and
this runs as a deliberate ops action rather than under load.

**Behaviour.** Dry-run by default; `--apply` writes; `--prod` targets production via
`connectOpsDb`/`PROD_MONGODB_URI`. Prints up-front counts (total / code-bearing / code-less, plus
code-less rows per campaign — every campaign reads `n=1` while the bug is live, because a second was
never insertable), the full index list before and after, adaptive progress lines, and a final
summary. **Pre-flight refuses** (exit 2, nothing written) if the code-bearing rows contain a
duplicate `(campaignId, code)` pair, because the recreate would fail and leave the collection with no
uniqueness guard on codes at all. Idempotent — a collection already carrying the partial index exits
0 untouched, and a run interrupted part-way is simply re-runnable (it drops **every** index on the
key, so a leftover temporary one from an older run is cleaned up too).

**Exit codes:** `0` applied or already correct · `2` refused by a pre-flight check, or the swap did
not reach the expected end state · `3` fatal.
