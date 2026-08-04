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
- `verify-*.ts` → verify:* npm script (read-only drift/consistency checks; exit non-zero on detected drift)
- `scripts/codemods/sweep-*.ts` → sweep:* npm script (UI codemod sweeps)

Plus:
- `scripts/migrations/` — date-prefixed migrations
- `scripts/seed-*.ts` — dev seeds. Currently:
  - `scripts/seed-admin-data.ts` — admin user
  - `scripts/seed-variation1-vs-variation2-experiment.ts` — landing-page variation 1 vs 2 A/B experiment (npm `seed:variation-experiment[:dry]`). Idempotent: populates an empty admin-created draft of the same name in place, or creates a fresh one. See [ab-testing/api.md](../ab-testing/api.md#seed-scripts).
  - `scripts/seed-promo-theme-experiment.ts` — promo landing default-theme (light vs dark) A/B experiment (npm `seed:promo-theme[:dry]`), targeting the sentinel slug `__promo-theme__`. Idempotent: populates an empty draft of the same name in place, or creates a fresh one. See [infrastructure/testing.md](./testing.md#ab-seed-promo-landing-default-theme-light-vs-dark) (detailed) / [ab-testing/testing.md](../ab-testing/testing.md) (cross-reference).
- `scripts/fix-*.{ts,mjs,js}` → fix:* npm script — one-off corrective scripts; **must** ship with a `:dry` sibling that disables writes
- `scripts/codemods/` — UI/Tailwind codemod scripts (see [dev-tooling architecture](../dev-tooling/architecture.md))

### Asset-conversion scripts (`convert:*`)

One-shot build-asset converters that turn numbered design exports into the brand-named, web-optimized files the app ships. Each removes its source(s) after a successful run. The first three are **sharp-based** (the `sharp` dependency, pure-JS/native, no external binary):

- `convert:upsell-webp` → `scripts/convert-upsells-to-webp.ts`
- `convert:multiplier-banners-webp` → `scripts/convert-multiplier-banners-to-webp.ts`
- `convert:promo-landing-webp` → `scripts/convert-promo-landing-to-webp.ts`
- `convert:drawn-tonight-tomorrow-webp` → `scripts/convert-drawn-tonight-tomorrow-to-webp.ts` (sharp) — converts the numbered "drawn tonight/tomorrow" landing-hero PNG exports to brand-named WebP stills and converts the shared `bg-desktop`/`bg-mobile` hero-stage background; removes the PNG sources.
- `convert:drawn-tonight-tomorrow-videos` → `scripts/convert-drawn-tonight-tomorrow-videos.ts` (**ffmpeg-based**) — remuxes the numbered drawn-hero MP4 exports into brand-named files (audio stripped, `faststart`) and encodes matching VP9 WebM; removes the numbered source folder.

- `convert:draw9-landing-webp` → `scripts/convert-draw9-landing-to-webp.ts` (sharp) — ingests the draw 9 landing export (228 stills) into the resolver's brand folders.
- `convert:draw9-landing-videos` → `scripts/convert-draw9-landing-videos.ts` (**ffmpeg-based**) — the clip twin, 228 clips → 456 outputs (MP4 remux + VP9 WebM).

> **The draw 9 pair differs from every converter above it in three ways**, all deliberate:
> 1. **`--dry-run` by default.** They only write with `--apply`, and take `--src` for the export
>    location, because they read from wherever the art drop landed rather than from a fixed path
>    inside `public/`.
> 2. **They do NOT delete their sources**, unlike the older converters. The export lives outside
>    the repo and is the only copy.
> 3. **They are not a filename parse.** Nine files in the draw 9 export carried a name that
>    disagreed with their artwork, so `convert-draw9-landing-to-webp.ts` holds an `EXCEPTIONS`
>    table recording what each file actually shows. The video script **imports** that table
>    rather than duplicating it — see `docs/promo/gotchas.md`.

> **External-tool dependency:** the WebP/PNG converters above only need the `sharp` npm dependency, but `convert:drawn-tonight-tomorrow-videos` and `convert:draw9-landing-videos` shell out to **`ffmpeg`, which must be on `PATH`** — it is an external binary, not an npm package, so it is **not** installed by `npm install`. Both fail immediately if ffmpeg is absent.

### Generated manifests chained into `prebuild` / `predev`

`build:landing-manifest` (stills) and **`build:landing-video-manifest`** (clips, added draw 9)
emit `src/generated/landingImageManifest.ts` / `landingVideoManifest.ts` — the on-disk sets the
promo resolvers consult so they never emit a URL for an asset that isn't there. Both are chained
into `prebuild`/`predev` beside the upsell, Norm and chat-knowledge generators, so a fresh clone
or a new asset drop is picked up without anyone remembering to run them.

### Dashboard stats snapshot backfill + drift check

- [`scripts/backfill-dashboard-stats-snapshots.ts`](../../scripts/backfill-dashboard-stats-snapshots.ts) — idempotent backfill. Upserts `DashboardStatsDailySnapshot` rows for a date range. Supports `--dry-run`, `--start-date=YYYY-MM-DD`, `--end-date=YYYY-MM-DD`. Defaults: site launch (2025-11-27) → yesterday-AEST. npm scripts: `backfill:dashboard-stats-snapshots` (live), `backfill:dashboard-stats-snapshots:dry`.

- [`scripts/verify-dashboard-stats-snapshot-drift.ts`](../../scripts/verify-dashboard-stats-snapshot-drift.ts) — read-only drift check. Samples N random snapshot dates, re-aggregates revenue live, reports per-bucket delta. Exits non-zero on any drift. npm script: `verify:dashboard-stats-drift`. Accepts `--samples=N`.

### Core index ensure migration

- [`scripts/migrate-ensure-core-indexes.ts`](../../scripts/migrate-ensure-core-indexes.ts) — runs `ensureCriticalIndexes()` out-of-band (moved off the webhook hot path after the 2026-05-15 504 storm). npm scripts: `migrate:ensure-core-indexes` (live), `migrate:ensure-core-indexes:dry` (preview). **Must run on every index-affecting deploy and BEFORE deploying webhook receiver changes** — it creates `paymentIntentId_1_eventType_1_unique` on `PaymentEvent`, the dedup-layer-4 unique index. See [mongodb/architecture.md](../mongodb/architecture.md#index-management--deploy-time-not-request-path) and [billing-stripe/gotchas.md](../billing-stripe/gotchas.md) (2026-05-15 504 storm).

### Stripe webhook queue `processedAt` backfill

- [`scripts/backfill-stripe-webhook-queue-processed-at.ts`](../../scripts/backfill-stripe-webhook-queue-processed-at.ts) — one-shot backfill for dead-row TTL anchoring. Matches `{ status: "dead", processedAt: null }` and sets `processedAt = updatedAt` so the 30-day `dead_processedAt_ttl` index can actually expire them. Idempotent (re-runs after completion are no-ops). npm scripts: `backfill:webhook-queue-processed-at` (live), `backfill:webhook-queue-processed-at:dry`. See [billing-stripe/STRIPE_WEBHOOK_QUEUE.md](../billing-stripe/STRIPE_WEBHOOK_QUEUE.md#backfilling-processedat-on-dead-rows) for context.

### Converting-platform attribution backfill

- [`scripts/backfill-converting-platform.ts`](../../scripts/backfill-converting-platform.ts) — backfills `convertingPlatform`, `attributionConfidence`, and `isRenewal` onto **historical** `BenefitsGranted` `PaymentEvent` rows that were written before the single-platform resolver shipped (filter: `{ eventType: "BenefitsGranted", convertingPlatform: null }`). Attribution is derived via `deriveBackfillAttribution` from `data.utmSource`/`data.utmMedium`, the indexed `attribution*` Meta ad-id fields, and `data.billingReason`. All rows written by this script are tagged `attributionConfidence: "inferred_backfill"` so the dashboard can segment them separately from live `click` / `utm_only` resolutions.

  **Idempotency:** the `convertingPlatform: null` filter means re-runs only touch unresolved rows — live-resolved and already-backfilled rows are never overwritten.

  **CLI flags:** `--dry-run` (default-safe — always run first), `--limit=N`, `--batch-size=N`, `--csv-path=<path>` (append-mode audit log), `--no-csv`.

  **Exit codes:** `0` = clean run, `2` = per-row errors (rows skipped; check `grep ',error,'` in the CSV), `3` = outer-fatal (script aborted), `1` = unhandled exception.

### Klaviyo attribution cycle reconciliation

- [`scripts/backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts) — **windowed, bidirectional** reconciliation of a draw cycle's `BenefitsGranted` `PaymentEvent` rows against the **current live** owned-channel (Klaviyo) attribution logic. It scopes to rows whose persisted UTM (`data.utmSource`/`data.utmMedium`) normalizes to `klaviyo_email`/`klaviyo_sms`, then calls the **same shared function the live path uses** — [`reconcilePersistedAttribution`](../../src/services/attribution/reconcilePersistedAttribution.ts) — on each row, so the script can never drift from live behaviour. npm scripts: `backfill:klaviyo-cycle` (live), `backfill:klaviyo-cycle:dry`.

  **Both directions (per row):**
  - **UP-CREDIT** `direct`/other → `klaviyo_*` when the Klaviyo touch is **within** the 5-day owned-channel window (the cookie-only edge resolver can't see a Klaviyo touch captured at signup, so those conversions leaked to `direct`).
  - **DOWN-CORRECT** `klaviyo_*` → `direct` when the Klaviyo touch is **stale** (outside the window) — e.g. a user who joined via Klaviyo months ago and bought again with no recent click.
  - **KEEP** rows whose `attributionConfidence === "click"` (a real paid ad won at the edge — paid-priority), and rows already on the correct channel within the window. Writes set `attributionConfidence: "utm_only"`.

  **Window touch time:** `data.attributionSource === "session" ? event.timestamp : user.createdAt` (signup times batch-fetched). The window value (5d Klaviyo) comes from the single source of truth `platformPriority.windowDaysFor` via `reconcilePersistedAttribution` — not hard-coded here.

### Paid-UTM attribution recovery (historical)

- [`scripts/backfill-paid-attribution-recovery.ts`](../../scripts/backfill-paid-attribution-recovery.ts) — **up-credit-only** reclassification of `convertingPlatform: "direct"` `BenefitsGranted` rows that qualify under the live **signup-anchored strict-window PAID recovery** rule (2026-07-19 — the cookie-gap leak; see `docs/tracking/backend.md` §"Persisted-UTM reconciliation"). Scopes to direct rows whose persisted UTM normalizes to a tier-1 paid platform (`meta`/`tiktok`/`snapchat`/`google`, derived from `PLATFORM_PRIORITY`, not a forked list), then applies the **same** `reconcilePersistedAttribution` the webhook runs, evaluated at the original purchase time with the live dating rule: `attributionSource === "signup"` → `resolveSignupTouchAtMs(signupAttribution.visitedAt, user.createdAt)` (the captured ad-visit time; account age only as legacy fallback), anything else (session-carried / unknown) → `null` → never flips. **No down-correction** — rows already credited to a paid platform are never touched. Writes set `attributionConfidence: "utm_only"` and are guarded with `{ convertingPlatform: "direct" }` in the update filter (idempotent; a flipped row leaves the scope). npm scripts: `backfill:paid-attribution` (live), `backfill:paid-attribution:dry`. Flags: `--prod`, `--dry-run`, `--start`/`--end` (AEST, default 2026-06-01 → tomorrow), `--no-csv`, `--csv-path`. Exit codes: 0 clean / 2 per-row write errors / 3 fatal. First prod dry-run (2026-07-19, window 2026-06-01→07-20): 121 rows / $3,695.91 flip direct→meta; 222 signup-stale and 0 session-undatable correctly stay direct.

  **CLI flags:** `--dry-run` (run first), `--prod` (target `.env.production`; omit = local `.env.local`), `--start=YYYY-MM-DD` / `--end=YYYY-MM-DD` (AEST; default **2026-06-28 → 2026-07-28**, the current cycle), `--no-csv`, `--csv-path=<path>`. Idempotent (re-running reproduces the same end state); every old→new (with `ageDays`) is logged to the CSV for trivial reversal.

  **Exit codes:** `0` clean · `2` per-row write errors · `3` fatal.

  **Real prod run, this cycle:** down-corrected 10 stale rows ($309.99) klaviyo→direct, up-credited 2 fresh rows ($37.50) →klaviyo; truthful windowed Klaviyo = **3 conversions ($77.50)**.

**Post-merge runbook:**

1. `npm run backfill:converting-platform:dry` — inspect console platform tally and the CSV; verify counts look plausible.
2. `npm run backfill:converting-platform` — live run. Re-runnable; `grep ',error,'` the CSV for any per-row failures and re-run to retry them.
3. Optionally: `npm run backfill:dashboard-stats-snapshots` to repaint completed-day snapshots with the newly backfilled attribution (the dashboard's live recompute already covers the visible rolling window).

**Note on ROAS exclusion:** the dashboard's renewal-exclusion logic uses `packageType + data.billingReason`, not the `isRenewal` flag — so setting `isRenewal` here has no effect on ROAS figures. The flag is populated for completeness and future use.

### Refund entry-corruption audit + repair

Two scripts ship for finding and fixing the major-draw entry-row corruption documented in [draws/gotchas.md](../draws/gotchas.md) and [payment/gotchas.md](../payment/gotchas.md):

- [`scripts/find-refund-entry-corruption.ts`](../../scripts/find-refund-entry-corruption.ts) — read-only audit. Replays each user's `BenefitsGranted` + `RefundProcessed` ledger to derive the expected per-draw state, then diffs against live MajorDraw rows. CSV out, progress to stderr. Run as `npm run find:refund-entry-corruption -- [--since=YYYY-MM-DD] [--userId=X | --email=X] [--verbose]`.
- [`scripts/fix-refund-entry-corruption.ts`](../../scripts/fix-refund-entry-corruption.ts) — repair. Same replay, but writes the expected state back. **Defaults to dry-run** (printout only) unless `--apply` is passed. The `:dry` npm variant force-disables `--apply` regardless. Optional `--restore-cancellation-upsell` re-adds the 100-entry retention bonus to the draw that was active when the user redeemed (looked up by `cancellationUpsellRedeemedAt`).

**Destructive script convention:** Scripts that delete or mutate production data should default to dry-run and require an explicit `--live` flag to actually execute. The `:dry` npm variant is the bare invocation; the live variant passes `--live`. See `scripts/cleanup-membership-backfill-rows.ts` for a current example, or `scripts/backfill-subscription-end-dates.ts` for the equivalent pre-existing pattern.

**Codemod sweep convention:** Codemod scripts under `scripts/codemods/` default to dry-run (no args = preview only); pass `--apply` to write. The `:dry` npm variant is the preview; the bare sweep:* variant applies. Always run dry first, verify the plan, then apply.

### Klaviyo profile resync (post-outage)

- [`scripts/sync-klaviyo-profiles.ts`](../../scripts/sync-klaviyo-profiles.ts) — throttled, dry-run-first re-sync of user profiles to Klaviyo after the June 2026 "fetch failed" outage left some profiles stale. Runs **locally** as a long-lived `tsx` process (no Vercel freeze/thaw, so the undici keep-alive race doesn't apply) against the already-fixed Klaviyo client; safe to run before the Vercel deploy. **No npm script** — invoke directly: `npx tsx scripts/sync-klaviyo-profiles.ts`.
  - **Dry-run is the default** (prints a sample of emails, no writes). Pass `--apply` to perform real Klaviyo writes against the **production** Klaviyo account (key from `.env.local`).
  - **Flags:** `--prod` (connect to `PROD_MONGODB_URI` Production db via `connectOpsDb`), `--apply` (live writes), `--members-only` (only users with a subscription document), `--limit N` (cap result set for testing).
  - **Throttle:** wraps `syncMultipleUserProfilesToKlaviyo()` (already throttled at 8 concurrent / 700ms pause per batch) in chunks of 80 to emit a progress line per chunk — does **not** re-implement the throttle. Per-user errors are swallowed internally and surface as `console.error` lines; the final summary counts "processed" (attempted), not "succeeded".
  - **Run off-peak.** Klaviyo's Profiles rate limit is per-account and shared with live registration upserts; a whole-DB sweep takes time even at ~5–10 req/s — run overnight when traffic is low.
  - Distinct from [`scripts/sync-klaviyo-past-due-profiles.ts`](../../scripts/sync-klaviyo-past-due-profiles.ts) (npm `sync:klaviyo-past-due[:dry]`), which targets only past-due subscribers.

### Klaviyo bulk-import resync (fast path)

- [`scripts/sync-klaviyo-profiles-bulk.ts`](../../scripts/sync-klaviyo-profiles-bulk.ts) — the **fast path** for the same post-outage backfill, using Klaviyo's async **Bulk Import** endpoint (`POST /profile-bulk-import-jobs/`) instead of the per-profile Profiles API. One job upserts up to 10,000 profiles; this script chunks to **≤2,000 profiles/job** (via [`chunkProfilesForBulkImport`](../../src/utils/integrations/klaviyo/bulk-import.ts), size-capped at 2,000 count / 4.5MB / 100KB-per-profile) for payload safety. Like the per-profile script it runs **locally** as a long-lived `tsx` process against the already-fixed Klaviyo client. **No npm script** — invoke directly: `npx tsx scripts/sync-klaviyo-profiles-bulk.ts`.
  - **Data-only upsert.** Never changes list membership/consent (no list relationship) — only profile attributes/properties. Safe for users who have unsubscribed.
  - **Dry-run is the default** (builds up to 5 sample profiles, shows how they chunk and the projected job count; no writes). Pass `--apply` to create real Klaviyo jobs against the **production** Klaviyo account (key from `.env.local`).
  - **Flags:** `--prod` (connect to `PROD_MONGODB_URI` Production db via `connectOpsDb`), `--apply` (create live jobs), `--members-only` (only users with a subscription document), `--limit N` (cap the result set).
  - **Streaming + bounded memory.** Streams users with a Mongo cursor and flushes in pages of 2,000 (build → chunk → POST job(s) → poll each to completion → report → clear), so memory stays bounded regardless of DB size. The target draw + cutoff are computed **once** up front and passed to every `userToKlaviyoProfile` call (no per-user draw lookup). Each created job is polled to `complete`/`error` (≈3-minute ceiling) and its per-profile import errors are reported.
  - **When to use which:** prefer **bulk** for large whole-DB sweeps — far fewer API calls (≈1 request per 2,000 profiles vs 2 per profile). Prefer the **per-profile** script ([`scripts/sync-klaviyo-profiles.ts`](../../scripts/sync-klaviyo-profiles.ts)) for small/targeted re-syncs. **Both are data-only** (neither changes list membership/consent).

## Vercel cron schedules

[`vercel.json`](../../vercel.json) lists the registered cron paths and schedules. Times are UTC.

| Path | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/major-draw-transition` | `0 14 * * *` | Daily — advances draw lifecycle |
| `/api/cron/process-partner-discount-queues` | `0 15 * * *` | Daily — clears partner discount queue |
| `/api/cron/ab-testing-experiments` | `0 * * * *` | Hourly — A/B test scheduling |
| `/api/cron/ab-testing-aggregate-metrics` | `0 3 * * *` | Daily — A/B test metrics roll-up |
| `/api/cron/sync-meta-spend-by-url` | `30 2 * * *` | Daily — Meta ad spend sync. Bearer `CRON_SECRET` gate (added 2026-07-16 — see [gotchas.md § Cron auth bypass](./gotchas.md)). |
| `/api/cron/sync-tiktok-ads` | `45 2 * * *` | Daily — re-syncs a trailing 8-day window of TikTok ad-level insights into `TikTokAdInsightsDaily` (delegates to `TikTokInsightsSyncService`; the TikTok analogue of `sync-meta-ads`). Bearer `CRON_SECRET` gate; no-ops when the TikTok Marketing-API env is unset. `maxDuration: 300s`. |
| `/api/cron/membership-daily-snapshot` | `0 14 * * *` and `0 15 * * *` | Daily ×2 — writes yesterday's `MembershipDailySnapshot` per package. Idempotent upsert; the second fire is a no-op for redundancy. |
| `/api/cron/dashboard-stats-daily-snapshot` | `0 14 * * *` and `0 15 * * *` | Daily ×2 — re-upserts a 90-day sliding window of `DashboardStatsDailySnapshot` rows. The second fire heals first-run failures. Idempotent. `maxDuration: 300s`. |
| `/api/cron/cancellation-retention-resume` | `0 16 * * *` | Daily — **backstop for the `paused` retention-pause membership state** + metadata cleanup. The Stripe webhook is the PRIMARY driver of the `active↔paused` flips; this cron catches missed events: (a) flips `active→paused` once a member's freeze window has started (`now >= pausedFrom`) and a retention pause is live on Stripe, (b) **payment-gated** restore `paused→active` (mirroring Stripe's status — only restores to `active` on a confirmed PAID resume invoice; mirrors `past_due`/`unpaid`/`canceled`, leaving an unsettled sub `paused` for the payment webhook) when Stripe has already resumed, and (c) clears stale `pauseReason="retention"` metadata once the pause window (next cycle boundary) has elapsed (prevents future recovery-pause mis-identification by `decideClearPause`; defensively resumes `pause_collection` if Stripe hasn't). All idempotent + Stripe-truth-based. `maxDuration: 300s`. |
| `/api/cron/cancellation-retention-maturity` | `0 17 * * *` | Daily — matures saved cancellation-flow events ≥90 days old by setting `CancellationFlowEvent.retention90` to `retained`/`churned` from the member's CURRENT subscription state (mirrors `getActiveSubscriptionFilter`). Read-only on user/subscription (only writes `retention90`). Bounded date-window query, idempotent via `retention90:null` filter. Scheduled one hour after the resume cron to spread load. `maxDuration: 300s`. |

`Australia/Sydney`-anchored crons fire at 14:00 UTC = 00:00 AEST / 01:00 AEDT, and 15:00 UTC = 01:00 AEST / 02:00 AEDT — both are after Sydney midnight in either DST regime, so they reliably write "yesterday" in local time. See [`docs/subscription/architecture.md`](../subscription/architecture.md) for the full membership-snapshot flow and `scripts/test-membership-snapshot-dst.ts` for the DST verification test.

## Function compute configuration

**Memory / CPU is dashboard-controlled, not in `vercel.json`.** Vercel removed the `memory` property from `vercel.json` — setting it there is silently ignored and surfaces a "custom overrides … gets ignored" warning on the Function CPU settings panel. Compute is selected by the **Function CPU** tier in the Vercel project settings: this project runs **Standard (1 vCPU / 2 GB)**, applied to every function. (Performance = 2 vCPU / 4 GB exists but is unnecessary — the workload is I/O-bound on Mongo, not CPU-bound; revisit only if SSR is CPU-starved after the hot-path query fixes.)

[`vercel.json`](../../vercel.json) `functions` block therefore sets **only `maxDuration`** per route:

- **Default** (`src/app/api/**/route.ts`): `maxDuration: 10s` — covers light read-heavy GETs (the majority of routes). A short cap so a hung request fails fast instead of holding a compute slot + Mongo connection for minutes.
- **Heavy I/O** (Stripe webhook, Cloudinary upload, admin exports/participants/sync, dashboard recent-activities, dashboard stats, activity log): `maxDuration: 30–60s`. `/api/admin/dashboard/stats` is here because the all-time read fans out across `paymentevents`, `users` (~10 countDocuments), `majordraws`, plus the membership analytics bundle — the 10s default was insufficient.
- **Crons** (every `/api/cron/*` plus `/api/admin/klaviyo/**`): `maxDuration: 300s`.

The dashboard **Default Max Duration** project setting is **300s** — it applies only to functions *without* an explicit `vercel.json`/code `maxDuration` (chiefly SSR page routes); the per-route values above take precedence over it.

**Region:** Functions run in **`syd1` (Sydney)** only, co-located with the MongoDB Atlas cluster (also AWS Sydney, `ap-southeast-2`, tier **M10**). This keeps every DB round-trip in-region (~1–3 ms). Do **not** add a second function region unless the data layer is also replicated there — multi-region functions against a single-region DB force cross-region (~200 ms) round-trips for any request routed to the far region, which at ~5 DB round-trips per authenticated request is ~1 s of added latency.

**⚠ Pattern ordering matters — first match wins.** Vercel evaluates the `functions` block top-to-bottom and uses the **first matching pattern**. The catch-all `src/app/api/**/route.ts` MUST be the **last** entry in the block, with all specific overrides above it. Putting the catch-all first silently shadows every override and reverts those routes to the default — Stripe webhook → 10s timeout, crons → 10s timeout, etc. (This bit us once already; see commit history.)

## Env handling

`lib/environment.ts` validates and exposes env vars. Don't access `process.env.X` directly — go through this module so missing/invalid vars fail fast at boot.

[`.env.example`](../../.env.example) is the **registry: the single source of truth for WHICH
env vars exist** — every var the app reads must be listed there with a comment and a *safe
placeholder*, never a real secret. `.gitignore` line 36 has a `!.env.example` negation against
the blanket `.env*` rule so it ships with the repo, which is what lets a completed registry
propagate to every branch and worktree on merge.

> **Corrected 2026-07-31.** This section previously described `.env.example` as "opt-in, not
> exhaustive… currently `STRIPE_WORKER_INTERNAL_SECRET`". That has not been true for a long
> time — it declares **97** vars today — and it contradicted CLAUDE.md §9, which is the rule
> that actually governs. Believing the old text would mean adding a var and never registering
> it, which is exactly the drift `npm run check:env` exists to catch.

Values live in `.env.local`, which is gitignored and **never merges**: `wt-new.sh` copies it
main → new worktree at creation, and there is no reverse. So a branch that adds a var must set
the value in its own `.env.local`, in the **main folder's** `.env.local`, **and in Vercel**, at
the time it is added — not at merge. Detect drift with `npm run check:env` (this folder) or
`npm run check:env:all` (main + every worktree); it reports **MISSING** (declared but unset
here) and **EXTRA** (set locally but unregistered). `PORT` and `E2E_*` are allowlisted as
legitimately per-folder. A quiet `--warn` runs in `predev`, so drift surfaces on every
`npm run dev`.

`lib/environment.ts` validates and exposes the vars it knows about; the registry is broader
than that module, so being absent from it is not a reason to skip registering a var.

**Client-readable vars (`NEXT_PUBLIC_*`) are inlined at build time**, so changing one requires
a **redeploy**, not just an env edit — and a `NEXT_PUBLIC_` twin of a server flag must be
flipped together with it (the partner-SSO pair is the standing example). A recent addition,
`NEXT_PUBLIC_PARTNER_PORTAL_URL`, follows the safe-degrade pattern worth copying: unset means
the feature renders **no link at all** rather than a broken one — see
[partner/frontend.md](../partner/frontend.md).

## Migrated from `src/docs/ENVIRONMENT_SETUP.md`

> _TODO: read root file and merge._

## Site-wide interaction smoothness — Phase 1 dependencies (2026-05-09)

[`package.json`](../../package.json) adds `embla-carousel-fade@^8.6.0` and `embla-carousel-class-names@^8.6.0` alongside the existing `embla-carousel-react`. Both are consumed exclusively by the [shared-ui Embla wrappers](../shared-ui/architecture.md#embla-carousel-wrappers) — features import the wrappers, not the raw plugins.

[`src/app/globals.css`](../../src/app/globals.css) has a device-tier CSS token block at the bottom (`--ta-blur`, `--ta-shadow-card[-hover]`, `--ta-card-hover-y`, `--ta-transition-dur`, `--ta-marquee-state`) keyed off `html[data-tier="…"]`, plus `@media (prefers-reduced-motion)` / `(prefers-reduced-transparency)` overrides, an iOS Safari `-webkit-backdrop-filter` mirror for any `[class*="backdrop-blur"]`, and a `@media print` block hiding `[data-tracking-pixel]` / `[data-floating-widget]` / sticky headers. Behaviour and consumption rules live in [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09).

[`src/app/providers.tsx`](../../src/app/providers.tsx) mounts `<MotionConfig reducedMotion="user">` and `<DeviceTierProvider />` once at the root so per-page consumers don't have to. Provider composition order is documented in [client-state/frontend.md](../client-state/frontend.md#root-providers-2026-05-09).
