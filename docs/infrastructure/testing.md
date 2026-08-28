# Infrastructure — Testing

> `test:discount-visit` (`tsx src/utils/partner-discounts/__tests__/record-discount-visit.test.ts`) covers the partner-discount page-analytics core: dedup **fails open** (a timed-out dedup read still records the visit), `accessPct` absent stays absent rather than collapsing to 0%, locked opens are clamped to a subset of offer opens, a seam cannot be "reached" where none was rendered, first-touch UTM beats the landing URL, and engagement **never** creates a visit row. Also `norm:smoke:partner-discount-analytics` — needs a running dev server, and is the only check that catches a schema↔output mismatch (a runtime 500 `tsc` cannot see). See [partner/analytics.md](../partner/analytics.md).

> `test:dashboard-stats-aggregator` gained merchandise coverage (2026-08-21): a `packageType: "shop"` PaymentEvent carrying a converting platform must land in the `shop` bucket and in `total` while touching NOTHING in `byPlatform`. That makes `sum(byPlatform) === total` no longer an identity — the assertion is now `sum(byPlatform) + buckets.shop.revenue === total`, kept in that form so it still catches a leak in either direction. Mutation-tested: letting merch into the platform block fails 5 assertions.

> `test:climb-series` (`tsx src/utils/membership/__tests__/climb-series.test.ts`) covers the `/membership` climb-chart accumulation math (`buildClimbSeries`).
> `test:plan-package-id` (`tsx src/utils/membership/__tests__/plan-package-id.test.ts`) pins that `convertToLocalPlan` carries the catalog `_id` as `metadata.packageId`, and that resolving a tier from `LocalMembershipPlan.id` instead yields the **wrong** tier — a bare `"tradie"` hits the one-time ladder (40% / 734 offers) rather than the subscription (50% / 917). Both failure modes are silent: no throw, no type error, just a wrong figure rendered confidently by the package-inclusions comparison table. Includes a control that an off-ladder percent returns `null` rather than a plausible count. Mutation-tested (changing `apiPlan._id` to `apiPlan.id` fails 3 of 5). No DB/env. See [subscription/frontend.md](../subscription/frontend.md).

> `test:package-card-surface` (`tsx src/utils/package-colors/__tests__/packageCardSurface.test.ts`) covers the shared package-card chrome (`getPackageCardSurface`) that the membership section card and all three package modals render — most importantly the three cross-tier light-theme background remaps, which no colour scheme exposes. See [shared-ui/patterns.md](../shared-ui/patterns.md) "Package card surface".

## QA member-state seeds (real Stripe TEST objects)

Two `tsx` seeds create a login-ready member in a specific state so you can eyeball the dashboard without waiting for real billing. Both **hard-refuse any non-`sk_test_` key**, tag their Stripe objects for cleanup, write the DB state **atomically** (`updateOne`, dodging the webhook `__v` race — see gotchas.md), and support `--dry-run` + `--cleanup`:

- **`npm run seed:past-due-member -- --email=<addr>`** — was-active-then-`past_due` (via a Stripe **test clock** that advances past a failing renewal), with a real open invoice + a restored good card so the resolve/recovery flow can succeed.
- **`npm run seed:active-member -- --email=<addr> [--renews-in-days=N]`** — an **active** member with **zero major-draw entries**, whose renewal is anchored **`N` days out (default 1 = tomorrow)** via `trial_end` — so Stripe reports it `trialing` (the 25-27th anchor-day artifact) with `current_period_end` = the renewal date, while the DB stores `active` with `endDate` = that date. Use it to see the dashboard's "**{N} free entries will be added upon renewal on {date}**" note (active member, 0 entries, renewal coming). It does NOT add `MajorDraw` entries; run with `stripe listen` STOPPED if a running app would otherwise grant them.

## Isolated-database repros (`.env.local` is PRODUCTION)

`.env.local`'s `MONGODB_URI` points at the live Atlas cluster — a `norm:smoke` against it returns
~948 users and ~762k draw entries. **Any repro that must write therefore cannot use it.** The
pattern established 2026-08-28 while proving the shop and auth defects:

```bash
docker run -d --name ta-repro-mongo -p 27018:27017 mongo:7
MONGODB_URI=mongodb://127.0.0.1:27018/ta_repro npx tsx scripts/seed-takeover-repro.ts <cus_test_id>
MONGODB_URI=mongodb://127.0.0.1:27018/ta_repro NEXTAUTH_URL=http://localhost:3100 \
  npx next dev --turbopack -p 3100          # a SECOND server, so the main one keeps its own DB
```

`scripts/seed-takeover-repro.ts` seeds a synthetic member plus one active `MajorDraw` (without the
draw the purchase gate returns 403 and every repro dies at step 1 for the wrong reason). Two rules
every script in this family follows, and new ones must too:

- **Refuse to run against anything but a local host.** Both smoke repros hard-exit unless
  `MONGODB_URI` matches `127.0.0.1|localhost` and `STRIPE_SECRET_KEY` starts with `sk_test`. A repro
  that *can* hit production eventually will.
- **Never reuse a real member's identifiers.** Production `stripeCustomerId`s are live-mode, so they
  cannot be bound by a test-mode key anyway — but the point is to keep real customers out of it.

**A repro that "passes" is guilty until proven innocent.** The first attempt at the takeover chain
printed a cheerful `✅ Chain broken` — it had actually died on `headers() was called outside a
request scope`, because a route handler invoked directly is not inside Next's request context. Any
repro of an auth or payment defect must run over **real HTTP against a real server**, and its
failure output must be read, not just its exit code.

## Pure unit tests are `tsx` scripts wired as `test:<scope>`

There is no jest/vitest — each test is a standalone `tsx` script under `src/**/__tests__/*.test.ts` that throws on failure, registered as a `test:<scope>` entry in `package.json` (without the entry it's undiscoverable). Added 2026-07-17: `test:packages-focus` (landing-URL membership/one-time classification util), `test:landing-page-focus` (pure `buildLandingPageDailyDocs` aggregation split — mixed-focus rows, `unknown://` rows carry no subdoc), and `test:spend-freshness` (on-read refresh decision logic — trailing-window resolution, historical/future clamping, 5-min throttle; see `docs/metrics-analytics/backend.md` "On-read freshness"). Added 2026-07-20: `test:prize-summaries` (`src/config/__tests__/prize-summaries.test.ts`) — drift + size-budget guard for the `prizes.ts` / `prize-summaries.ts` catalog split (slug/field equality across both modules, ≤40 KB summaries source, no heavy import; see `docs/config-and-data/testing.md`). Added 2026-07-23: `test:privileged-account` (`src/utils/auth/__tests__/privileged-account.test.ts`) — pure guard that the public registration path can never create/overwrite a staff/admin account; anchors that the staff marker is `roleId`/`userType`, NOT the legacy `role` string (see `docs/auth/gotchas.md`). Keep tests pure (no live DB/Stripe/network) by injecting side effects: e.g. `npm run test:promo-visit` exercises `recordPromoVisit` with stubbed `hasRecentVisit`/`recordVisit` deps. Added 2026-07-28: `npm run test:prize-build` (`src/utils/promo-analytics/__tests__/record-prize-build.test.ts`) exercises `recordPrizeBuild` — the functional core behind the prize-build/engagement beacon — with an injected `updateVisitBuild` dep: a bogus built-prize slug or landing slug is rejected before any write, no `anonymousId` is a no-op, no matching visit row returns `no_visit_row` without creating one (mirrors the repository's never-insert rule, see `docs/mongodb/backend.md`), a write failure is reported rather than thrown, and out-of-range switch counts clamp (negative → 0, absurd → the 1000 ceiling) before reaching the database. No DB/env needed. `npm run test:repeat-purchase-analytics` (`src/services/admin/__tests__/repeatPurchaseAnalytics.test.ts`) covers the repeat-purchase reconversion shaper (`summarizeRepeatPurchases`) with an injected `diffAestDays` + fixed `now`, so bucket boundaries, matured-window denominators, and the became-member flag are verified without touching Mongo. Also added 2026-07-28: `npm run test:promo-analytics-aggregation` (`src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts`) — the arithmetic behind the admin promo-analytics dashboard and the Norm external feed. It stubs the `aggregate` statics by call order and calls the REAL `getAggregatedByPage` / `getAggregatedByBuiltPrize`, so it pins the numbers rather than the plumbing: the `buildDistribution` merge keeps both slugs for one page instead of overwriting, an equal-visitors tie sorts `builtPrizeSlug` ascending (deterministic), `topBuiltPrize` equals `buildDistribution[0]`, a build-less page yields `builds: 0` / `[]` / `null`, and — the regression that motivated it — a slug with signups but no builders yields `builderToSignupRate: 0`, never `Infinity`, which would otherwise misreport revenue attribution silently. No DB/env needed. Added 2026-07-29: `npm run test:signup-attribution` (`src/services/attribution/__tests__/signup-attribution.test.ts`) — `buildSignupAttribution` / `mergeSignupAttribution` / `plainSignupAttribution`, moved out of the register route handler by panel F-038 and previously untested despite being the single gate deciding whether a signup's promo page and built prize ever reach the database. Pure, no DB/env. Beyond the persist guard and slug normalisation it carries an **argument-position guard** — four distinct values in one call, each asserted onto its own key — because all four params are optional and stringy, so transposing two type-checks cleanly, and `main` and the feature branch each added a *different* third parameter. Two assertions were added after mutation testing showed the merge's two preservation mechanisms are individually redundant: deleting either one still passed, so one assertion pins the `...previous` spread (the UTM/campaign snapshot) and another pins the explicit preserve branches (via a `next` carrying `promotionSlug: undefined` as a *present* key). See `docs/auth/testing.md`. Added 2026-07-30: `npm run test:draw-revenue` (`src/services/admin/__tests__/drawRevenue.test.ts`) — the pure half of per-draw net revenue (`buildDrawRevenueWindows` / `assignRevenueToWindows`), which is **derived** from `PaymentEvent` because `MajorDraw` has no revenue field. 20 assertions, no DB/env. It pins the boundary semantics that must stay in lockstep with `getTargetMajorDraw`: windows chain off the **previous** draw's `freezeEntriesAt` (not the draw's own `activationDate`, which would drop gap-period money on the floor), the end boundary is **exclusive** so a freeze-instant payment lands in the next draw, an undated or degenerate draw is dropped rather than yielding an Invalid Date window that silently swallows rows, and a missing `data.price` contributes 0 rather than NaN. See `docs/draws/architecture.md`. Added 2026-07-31: `npm run test:promo-analytics-range` (`src/services/promo-analytics/__tests__/promo-analytics-range.test.ts`) — `resolvePromoAnalyticsRange`, the AEST date resolver shared by the three admin promo-analytics routes and their three Norm mirrors. 14 assertions, no DB/env; the resolver takes an injectable `now` **for tests only** (production always omits it), which is what makes DST edges and the retention clamp assertable without hard-coding dates that drift out of the 90-day window as time passes. It pins three things that each shipped broken: every range key is reachable and none collapses to today (the resolver's parameter was named `range` while all six callers passed `dateRange`, so every requested range silently returned today — invisible to `tsc` because the field was optional and the argument non-literal); `yesterday` is DST-correct (an AEST day is 23/24/25 h, and consecutive days abut with no gap or overlap across a Sydney transition); and the window is clamped to `PROMO_VISIT_RETENTION_DAYS` with `clampedToRetention` reported, an entirely-pre-floor window collapsing rather than inverting. See `docs/promo/backend.md`. **Maintenance note:** the sibling `npm run test:promo-analytics-aggregation` stubs `Model.aggregate` **by call order**, so it broke (3 of 7) when the same change altered `getAggregatedByPage`'s pipeline sequence and had to have its stub queue re-ordered — the assertions were always correct. Any future pipeline added to or removed from that method needs the same maintenance. See `docs/promo/testing.md`. Added 2026-08-26: `npm run test:cancel-churn-emit` (`src/services/subscription/__tests__/cancel-subscription-churn-emit.test.ts`) — the cancel-time `"Subscription Cancellation Requested"` emit through the REAL `cancelSubscription` service. It is the repo's second user of the `require.cache` stub-swap pattern (after `test:bonus-code-webhook`): `@/lib/stripe`, `@/lib/klaviyo` and four collaborators are replaced BEFORE the service is `require`d — `require`, never `await import`, which under tsx goes through the ESM loader and bypasses the cache entirely — and the two network-capable stubs are verified by object identity before a single case runs. Use it as the reference when a service under test cannot be reduced to a pure helper. See `docs/subscription/testing.md`. Added 2026-08-26 (fix round 2): `npm run test:campaign-code-metadata` (`src/app/api/stripe/__tests__/campaign-code-metadata.test.ts`) — the same stub-swap pattern applied to four real ROUTE handlers rather than a service, with `@/lib/stripe` itself as the recorder, so the assertion is the argument Stripe would actually have received. It **replaces a text-grep guard** that read each route as a string and checked `src.includes(...)`: nothing executed, so the positive leg passed if the call sat in a dead branch or a comment and the negative leg was defeated by any rewrite of the same bug. Both were demonstrated against the real files. Treat it as the reference for the general rule: **a guard that greps source text pins nothing** — if the invariant matters, drive it. It also documents two costs of loading real route modules in a tsx harness: the routes' own error logging has to be silenced across the handler call (and restored in a `finally`, so a FAIL is never swallowed), and the file must end with an explicit `process.exit(0)` because module-scope rate-limiter `setInterval`s otherwise keep the process alive for ever after the pass line prints. See `docs/billing-stripe/testing.md`. Added 2026-08-27: `npm run test:campaign-code-checkout` (`src/utils/payment/__tests__/campaign-code-checkout.test.ts`) — the same stub-swap pattern on the pre-confirm campaign-code write (`attachCampaignCodeToCheckout`). Its first case is the one worth copying elsewhere: the update payload is asserted to preserve **every** sibling metadata key, because these Stripe update calls take a metadata *map* and a partial payload would destroy `packageId`, the CAPI match keys, the A/B assignment and the attribution **on an object the customer is about to be charged on** — strictly worse than the bug being fixed, and invisible to `tsc`. It also carries a stub-fidelity lesson: the stubbed validator mirrors the real service's own "no code → refuse before any lookup" first line, because a stub *more permissive* than the thing it stands in for silently passes a broken clear path. See `docs/payment/testing.md`. Added 2026-08-28: `npm run test:campaign-refund-reversal` (`src/utils/payment/__tests__/campaign-refund-double-reversal.test.ts`) — the refund double-reversal on monthly-coupon purchases. It introduces a third stubbing style alongside the `require.cache` swap: the **model statics themselves** (`User.updateOne`, `MajorDraw.find`, `RedeemableIssuance.findOne`) are reassigned to recorders, then the REAL `reverseLedgerBenefits` is driven and the assertion is made against the writes production code *attempted*. Use this shape when the unit under test is an orchestrator whose defect is the SEQUENCE of writes rather than any one return value — a pure re-model of the sequence would only have tested the author's assumption, which is exactly how this defect survived review. Provenance worth copying: the repro was re-run with `MONGODB_URI` pointed at a dead host and reproduced identically, which is what proves the arithmetic is DB-independent **and** that no live cluster was touched — `.env.local` points at production Atlas, so any test in this area must be able to demonstrate that. See `docs/payment/gotchas.md`.

Also added 2026-07-31: `npm run norm:smoke:promo-analytics` — not a test but a smoke chain, three `internal-norm-smoke.ts` invocations `&&`-ed together. That chaining only became meaningful once the smoke script started exiting non-zero on a non-2xx (it previously printed a 500 and exited 0). Use it after any change to `src/lib/internal-norm/schemas/promo-analytics.ts`: a `responseSchema` ↔ handler-output mismatch is a runtime 500 that neither `tsc` nor `next build` can see. See `docs/internal-norm/testing.md`.

See `.claude/skills/writing-tsx-test`.

### A `test:*` entry hardcodes paths — moving a tested module breaks it silently

`test:winner-selection` and `test:admin-major-draw` were repointed on 2026-07-30 when the eight draws modals moved to `src/components/modals/draws/`. Both entries name the test file **and** a `--require` asset-stub path:

```
"test:winner-selection": "tsx --require ./src/components/modals/draws/WinnerSelectionModal/__tests__/asset-stubs.cjs src/components/modals/draws/WinnerSelectionModal/__tests__/WinnerSelectionModal.test.ts"
```

The import *inside* the test is relative (`../index`), so it keeps resolving after a move and the file still passes when run directly with `npx tsx`. Only the npm script breaks. **After moving any tested module, re-run its `test:*` script — not just the test file** — or the suite quietly stops being runnable the documented way.

## Health check

```bash
curl http://localhost:3000/api/health
```

Should return 200 with simple JSON status.

## Cron simulation

```bash
curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3000/api/cron/major-draw-transition
```

Most cron routes actually read `Authorization: Bearer $CRON_SECRET`, not `x-cron-secret` — check the handler before assuming. `reconcile-renewal-grants` is read-only, so it is safe to hit by hand:

```bash
curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reconcile-renewal-grants
```

It returns 401 when `CRON_SECRET` is unset (fails closed), so export it first.

## Migration dry-run

```bash
npm run migrate:<name>:dry
```

### Packages-focus aggregate backfill (2026-07-17)

[`scripts/backfill-packages-focus-aggregates.ts`](../../scripts/backfill-packages-focus-aggregates.ts) — one-off, re-runnable rebuild of `LandingPageMetricsDaily` over every date still covered by `MetaAdInsightsDaily` (~60-day TTL window), so resolved rows gain the `packagesFocus` membership/one-time split (see `docs/metrics-analytics/`). It re-runs the same idempotent per-day `recomputeForDateRange` the crons use — deterministic from source collections; older dates keep their rows and read as `unclassified`. `--since=YYYY-MM-DD` narrows the window. Needs `MONGODB_URI` + `FACEBOOK_AD_ACCOUNT_ID` in `.env.local`; run the dry variant against the DB that actually holds Meta insights first.

```bash
npm run backfill:packages-focus:dry   # report dates + row counts, write nothing
npm run backfill:packages-focus       # live rebuild
```

### Targeting production from ops scripts (`--prod`)

The A/B / affiliate ops scripts (`migrate-dedupe-variant-assignments`,
`reconcile-affiliate-commissions`, `seed-static-vs-video-hero-experiment`) share
[`scripts/connect-ops-db.ts`](../../scripts/connect-ops-db.ts). By default they
connect to your local/dev `MONGODB_URI`. Pass **`--prod`** (or use the `:prod`
npm variants) to connect to **`PROD_MONGODB_URI`** instead — the helper forces the
`Production` database (the prod Atlas string has no `/db` path, so a bare connect
would silently hit an empty `test` DB) and rewrites `MONGODB_URI` up-front so
services that call `connectDB()` internally (e.g. `recordAffiliateCommission`) use
prod uniformly. Every run prints `PROD|local · db="…" @ host`; a prod run adds a
"Targeting PRODUCTION" warning. **Always dry-run against prod first.**

### A/B sticky-assignment dedupe (run before deploying the unique index)

`scripts/migrate-dedupe-variant-assignments.ts` collapses duplicate
`VariantAssignment` rows (same identity per experiment → keep earliest, delete
rest) so the new `uniq_experiment_user` / `uniq_experiment_anon` unique indexes
can build, then builds them. **Dry-run by default**; flags split-brain groups
(same identity bucketed into >1 variant). Must run **before** deploying the
`VariantAssignment` model change, or the prod index build silently fails.

```bash
npm run migrate:dedupe-variant-assignments:dry        # dev: report only, no writes
npm run migrate:dedupe-variant-assignments            # dev: delete dups + build unique indexes
npm run migrate:dedupe-variant-assignments:prod:dry   # PROD: report only
npm run migrate:dedupe-variant-assignments:prod       # PROD: delete dups + build indexes
```

### A/B seed: static-image-vs-video hero experiment

`scripts/seed-static-vs-video-hero-experiment.ts` creates a **draft** experiment
+ two 50/50 variants (`Video` control / `Static image` treatment via
`hero.disableVideo`) across the 16 brand landing slugs. Idempotent; activate in
admin → A/B Testing.

```bash
npm run seed:static-vs-video-hero:dry        # dev: preview, no writes
npm run seed:static-vs-video-hero            # dev: create the draft experiment
npm run seed:static-vs-video-hero:prod:dry   # PROD: preview
npm run seed:static-vs-video-hero:prod       # PROD: create the draft experiment
```

> Historical: the promo packages-design experiment (2026-07, concluded — control won) had its own seed/cleanup scripts (`seed:promo-packages-design`, `cleanup:promo-packages-design`); both scripts and their npm entries were removed when the experiment ended.

### A/B seed: promo landing default theme (light vs dark)

`scripts/seed-promo-theme-experiment.ts` creates a **draft** experiment + two
50/50 variants (`Light (control)` / `Dark`, via `promoTheme.defaultTheme`) that
target the **sentinel** slug `__promo-theme__` — never a real prize slug, so it
can't shadow a slug-targeted promo experiment (`findActiveBySlug` is a
`findOne`). The reverse direction — a wildcard `"*"` experiment hijacking the
sentinel — is guarded separately by the exact-match
`ExperimentRepository.findActiveBySentinelSlug`. Idempotent (safe to re-run on
a draft; skips unless `--force`); refuses to touch active/paused/ended
experiments. No `--prod` npm variants exist for this one — it's seeded in
dev/staging first, same as every other draft experiment; add `:prod` variants
on request if a prod seed is ever needed (CLAUDE.md rule 4, don't add
speculative flags/variants).

```bash
npm run seed:promo-theme:dry          # dev: preview, no writes
npm run seed:promo-theme              # dev: create the draft experiment
npm run seed:promo-theme -- --force   # dev: repopulate an existing draft's variants
```

#### Pre-activation check — do not skip

`VariantConfigService.mergeVariantConfig` rebuilds variant config from an
explicit key whitelist. If `promoTheme` were ever dropped from that whitelist,
the config would be silently stripped between MongoDB and the browser — **both**
arms would render light while the admin dashboard still shows a healthy,
evenly-split experiment. That's a silent A/A producing confident, wrong
conclusions, so probe it before every activation, not just the first.

**A bare unauthenticated `curl -X POST /api/ab-testing/assign` CANNOT be used
for this check and must not be.** Traced from `src/app/api/ab-testing/assign/route.ts`:
the route only returns a *specific* variant's config when the request carries
both an admin session **and** the httpOnly `ta_ab_preview_<experimentId>`
cookie (the `previewVariantId && isAdmin` branch). Without both, it falls
through to `VariantAssignmentService.assignVariant(experimentId, userId,
anonymousId)`, which deterministically hashes `experimentId + anonymousId` — a
cookie-less curl gets a fresh anonymous id every call and lands on whichever
arm the hash happens to pick. Two such curls could hit the SAME arm by chance,
see `defaultTheme` present, and the operator would wrongly conclude the
whitelist is fine while the *other* arm is still silently stripped.

The mechanism that actually targets a chosen arm is the **admin preview
cookie** (`src/app/api/admin/ab-testing/preview/route.ts`, permission
`abTesting.edit`), the same one the admin A/B Testing UI's per-variant
**"Preview"** button (eye icon, `ExperimentDetailModal.handlePreviewVariant` in
`src/components/admin/ab-testing/ExperimentDetailModal.tsx`) sets before
opening a promo tab. Per variant:

1. Sign in as a user with `role: "admin"` and keep that browser session (cookie
   jar) for every step below — the assign route's preview branch checks
   `session?.user?.role === "admin"`.
2. Find the variant's `_id` (admin → A/B Testing → open the experiment →
   Variants tab lists `Light (control)` / `Dark`; the id is visible in the
   Preview/Edit/Delete network requests in devtools, or read it directly:
   `db.variants.find({ experimentId: ObjectId("<experimentId>") })`).
3. Set the preview cookie for that variant: click the variant's **"Preview"**
   button in the admin UI, or call `POST /api/admin/ab-testing/preview` with
   `{ "experimentId": "<experimentId>", "variantId": "<variantId>" }` from the
   SAME authenticated session. This sets an httpOnly
   `ta_ab_preview_<experimentId>` cookie (1-hour TTL, path `/`).
4. Still in that session (both the admin session cookie and the preview cookie
   must ride along — e.g. run this from the browser devtools console, or with
   an HTTP client seeded from the browser's cookie jar, never a fresh
   cookie-less request), call `POST /api/ab-testing/assign` with
   `{ "experimentId": "<experimentId>", "slug": "__promo-theme__" }`.
5. Assert the response is `{ ..., isPreview: true }` and
   `variantConfig.promoTheme.defaultTheme` equals the expected arm
   (`"light"` for `Light (control)`, `"dark"` for `Dark`).
6. Repeat steps 2-5 for the other variant.

### Affiliate commission reconciliation (safety net)

The shared core [`reconcileAffiliateCommissions()`](../../src/utils/affiliate/reconcile-commissions.ts)
is the durable backstop for the fire-and-forget commission dispatch: it reconciles
**every** commission type (one-time / upsell / mini-draw / membership-first /
membership-recurring) from the durable `PaymentEvent` ledger, reports gaps + over-paid
commissions on refunded payments, and (with `apply`) backfills the missing rows
idempotently via `recordAffiliateCommission` (correct per-affiliate rate, `$inc` only
on a real insert). It runs two ways from the **same core**:

- **Daily cron** [`/api/cron/reconcile-affiliate-commissions`](../../src/app/api/cron/reconcile-affiliate-commissions/route.ts)
  (auth-gated, **35-day trailing window**, auto-backfill) — self-healing, no manual
  step. Over-paid rows are flagged via `console.error` for manual review (clawback is
  a separate deferred workstream — see `docs/affiliate/gotchas.md`).
- **CLI** `scripts/reconcile-affiliate-commissions.ts` — read-only by default, writes a
  CSV audit to `temp/readonly/`; `--since-days=N` bounds the scan (default = full sweep).
  **Review the CSV before applying.**

```bash
npm run reconcile:affiliate-commissions:dry        # dev: audit + CSV, no writes (exit 2 if gaps)
npm run reconcile:affiliate-commissions            # dev: create the missing commissions
npm run reconcile:affiliate-commissions:prod:dry   # PROD: audit + CSV, no writes
npm run reconcile:affiliate-commissions:prod       # PROD: create the missing commissions
# add e.g. -- --since-days=35 to bound the scan to a trailing window
```

### Affiliate commission dedup-index migration (sparse → partial)

`scripts/migrate-affiliate-commission-pi-index.ts` drops the **legacy `sparse`
unique** dedup indexes on `affiliatecommissions` and lets `syncIndexes()` rebuild
them as **partial** unique indexes from the schema. Required because a *compound*
`sparse` index still indexes a row when **any** key is present (and `affiliateId`
always is), so rows missing the optional id were indexed with that id as `null` and
collided — capping a referred user at **one** such commission. Two indexes were
affected: the PI key (`stripePaymentIntentId`, fixed 2026-01) and the invoice key
(`stripeInvoiceId`, fixed 2026-06 — this had been silently blocking the reconcile
backfill from creating a user's 2nd+ one-time/upsell/mini-draw commission with
`dup key { stripeInvoiceId: null }`). See [docs/affiliate/models.md](../affiliate/models.md).
Run this **before** the reconcile backfill on a DB that still has the legacy index.

```bash
npm run migrate:affiliate-commission-pi-index:dry        # dev: report, no drops
npm run migrate:affiliate-commission-pi-index            # dev: drop legacy + rebuild partial
npm run migrate:affiliate-commission-pi-index:dry -- --prod   # PROD: report
npm run migrate:affiliate-commission-pi-index -- --prod       # PROD: drop legacy + rebuild partial
```

## `reconcile:stale-active` — repair members stuck on a stale `active`

```bash
npm run reconcile:stale-active:dry     # report only (safe; no writes) — .env.local
npm run reconcile:stale-active         # apply
npm run reconcile:stale-active:dry -- --limit=50 --email=someone@example.com
npm run reconcile:stale-active:dry -- --env=../../.env.production   # target production
```

`--env=PATH` selects the env file (relative to cwd, default `.env.local`). A real reconcile targets production, and passing the file explicitly beats exporting `MONGODB_URI` / `STRIPE_SECRET_KEY` into the shell, where they leak into history and process listings. From a worktree, production is `../../.env.production`.

[`scripts/reconcile-stale-active-subscriptions.ts`](../../scripts/reconcile-stale-active-subscriptions.ts) compares Mongo `subscription.status` against the **live Stripe subscription** and mirrors Stripe's status when Mongo wrongly says `active`. It exists because a failed stranded-member re-bill used to notify the member without writing `past_due` back (see `docs/billing-stripe/gotchas.md`); the webhook gap is fixed, this repairs accounts that already drifted.

It detects **two different shapes** that both look like "an `active` member who hasn't paid in months":

| Shape | Condition | Handling |
|---|---|---|
| **A — status drift** | Mongo `active`, Stripe `past_due`/`unpaid`/`canceled`/… | **Repairable.** Writes `subscription.status` / `isActive` / `pastDueAt`. |
| **B — stuck collection pause** | Stripe *and* Mongo both `active`, and the sub carries `pause_collection` with `resumes_at: null` | **Report only. Never auto-fixed.** |

Shape B is deliberately not remediated: unpausing charges the card and moves the billing anchor (`docs/PAST_DUE_REANCHOR.md`, BUSINESS.md §9e). That is money movement and a policy decision, not a reconcile — act on the reported accounts via the admin Recover Stranded panel or per-user Charge. Stripe keeps a paused subscription `active` and simply stops billing it; `resumeAfterSuccessfulRenewalPayment` clears the pause on a successful payment, which for these members never arrived.

**Production dry run, 2026-08-03:** 4,605 active members → 5 with no real payment in 45d → **0 shape A, 2 shape B**, $520 uncollected (one had 4 held drafts stacked since April). The first version of this script looked only for shape A and therefore reported nothing at all — a useful reminder that a clean run can mean the detector is asking the wrong question.

Candidate selection is "`active` with no successful `PaymentEvent` in `--stale-days` (default 45)", **not** charge-job history — a member stuck on a paused subscription may never have produced an `InvoiceChargeLog` row. One aggregation resolves last-payment for all actives, so only the handful of real candidates cost a Stripe call (5 calls, not 4,605).

Notes for whoever runs it:

- **Stripe is the source of truth.** It never infers status from payment history; a member whose Stripe subscription is genuinely `active` is left alone regardless of what the ledger shows. It only ever writes `subscription.status` / `isActive` / `pastDueAt`, never charges or mutates Stripe.
- **Never treat `InvoiceChargeLog` rows as a payment signal.** `PaymentEvent` is the ledger. Recovery step-audit rows carry `status: "success"`/`"failed"` but are machinery (void/finalize), and ordinary Stripe auto-renewals never write to `InvoiceChargeLog` at all — conflating the two made an early draft of this analysis report 202 stale accounts instead of 2.
- Appends `reconcile-stale-active-audit.csv` (gitignored via `*-audit.csv`) with a row per decision **including skips**, and exits `0` clean / `1` fatal / `2` completed-with-per-item-errors.
- Dry-run first, always — and pass `--env` explicitly for production rather than exporting secrets into the shell.

## npm test scripts

New test scripts added to `package.json` follow the `test:<scope>` convention and can be run independently:

```bash
npm run test:past-due-history       # pure aggregation helpers (no env vars needed) — chains 4 files:
                                    #   charge-past-due-totals, chargePastDueHistory, chargeSkipReasons,
                                    #   chargeDeclineReasons (added 2026-07-31: asserts the admin drawer's
                                    #   client-side decline bucketing and the server's Mongo $match encode
                                    #   the SAME rule — they had drifted, producing a bogus "unknown 206"
                                    #   chip while the summary card hid 237 real declines)
npm run test:charge-past-due-post-pay   # post-`invoices.pay` decisions, incl. classifyPayFailureRoute:
                                    #   which thrown Stripe errors mean stand-down vs route-to-recovery
                                    #   vs real card decline (the payment_intent_unexpected_state cohort)
npm run test:attempt-spacing        # the PROACTIVE per-invoice attempt cap + charge-run alerting:
                                    #   3-day spacing predicate incl. the 2h grace that stops a
                                    #   drifting daily run slipping to a 4-day cadence, the Mongo
                                    #   cutoff staying WIDER than the predicate window, and two
                                    #   30-day walks (fixed + drifting run times) both yielding 10
                                    #   submissions vs the 24 measured before it; attempt_spacing
                                    #   bucketing ahead of every sibling reason; the zero_coverage
                                    #   alert for the cap's own collapse mode (run completes having
                                    #   held everything - both other alerts structurally miss it);
                                    #   and the 8% low-success-rate floor pinned against the five
                                    #   real pre-fix runs (2.59-5.97%) plus the 2026-06-29 $0 incident
npm run test:past-due-idempotency-keys  # Stripe idempotency-key builders: bulk key differs across runs (the 2026-06-29 replay guard); one-off key dedupes concurrent submits within a 30s bucket
npm run test:merge-ad-channels      # pure ad-channel merge — preserves prior spend on a failed/expired-token fetch (no DB)
npm run test:cancellation-upsell    # smoke-renders CancellationUpsellModal in 12 prop combos
npm run test:refer-friend           # smoke-renders ReferFriendModal in 3 open + 1 closed combos
npm run test:upgrade-confirm        # smoke-renders UpgradeConfirmModal (3 tiers + full props + closed)
npm run test:downgrade-confirm      # smoke-renders DowngradeConfirmModal
npm run test:renewal-failed         # smoke-renders RenewalFailedModal (open + closed)
npm run test:ui-primitives          # Button, Badge, Card primitives
npm run test:upsell-shell           # UpsellHero, InfoGrid, UrgencyBanner, TrustBar primitives
npm run test:cancellation-flow-hook # pure step-machine reducer (offerPhaseFor/nextOfferState) — locks the cursor-driven OFFER phase incl. the 3-rung `other` waterfall
npm run test:capi-userdata          # Meta CAPI mirror: stripEmpty drops blank PII; guest userData reaches FB CAPI SHA-256-hashed into em/ph/fn/ln
npm run test:purchase-event-time    # CAPI Purchase event_time = charge time (src/lib/tracking/__tests__/purchase-event-time.test.ts): ms-vs-seconds epoch normalization, and timestamps older than Meta's 7-day attribution window clamp to now
npm run test:purchase-pixel-fired   # localStorage guard (src/utils/tracking/__tests__/purchase-pixel-fired-storage.test.ts) that stops the success page re-firing the browser Purchase pixel on revisit/refresh
npm run test:mirror-event-names     # /api/tracking/conversion funnel-event allowlist (src/utils/tracking/__tests__/mirror-event-names.test.ts): the unauthenticated mirror endpoint accepts only funnel events — value-bearing events (Purchase etc.) are rejected, so a Purchase can't be forged through it
npm run test:tiktok-match-signals   # TikTok EMQ regressions (added 2026-07-31, src/lib/tracking/__tests__/tiktok-match-signals.test.ts): ttclid/ttp resolve from RequestContext when userData lacks them (the structural bug that sent every server event with no click id — invisible to tsc), userData still wins, extractTikTokContext's ta_ttclid → legacy ttclid → ?ttclid= precedence, the 256-char guard (an unbounded value reaches Stripe metadata, which hard-fails the whole API call above 500), NO double-decode of a value containing a literal % (Next already decodes on parse), ta_ttclid_ts → legacy ttclid_ts fallback, anonymous external_id hashed identically to a User._id, page.referrer emitted only when real. No DB/env.
npm run test:tiktok-pixel-events    # TikTok BROWSER pixel (added 2026-07-31, src/lib/tracking/__tests__/tiktok-pixel-events.test.ts): the headline case is that a canonical "PageView" MUST reach ttq.page() and NEVER ttq.track — routing it through track registered a CUSTOM `PageView` event beside the standard `Pageview` (3,748 events on their own Events Manager row, which TikTok gives no way to delete). Also pins that a non-PageView event keeps its { event_id } dedup key, and that the hostname gate + missing pixel-id env both suppress everything. `pixelTrack` had NO test before this. Stubs window.ttq; zero network.
npm run test:find-recoverable-subscription # guard re-validates each listed sub's real .status (Stripe list({status:"trialing"}) leaks incomplete subs)
npm run test:cancel-incomplete-subscription # helper only cancels real `incomplete` subs, voids only `open` invoices, best-effort on errors, idempotent
npm run test:http-rejection-severity # pure classifier: 5xx→high, coded 4xx→medium, skip <400/401/403/404/429/codeless-4xx
npm run test:session-invalidation    # fences shouldInvalidateSession (src/lib/queries.ts): only 401 and 404+USER_NOT_FOUND force-sign-out; 403 must NEVER (staff roles with partial permissions 403 routinely — re-adding it auto-logs staff out seconds after login). See docs/client-state/gotchas.md.
npm run test:membership-display-status # fences deriveMembershipDisplayStatus (src/utils/subscription/subscription-helpers.ts) — the admin user-detail header badge derivation: past_due wins over cancelled-while-past-due, trialing displays as Active, active+autoRenew:false = scheduled_cancel, incomplete/unknown → guest. Pure — no DB/env.
npm run test:klaviyo-canonical       # fences canonical property names for new Klaviyo events (added 2026-05-28). Fails when new event drifts to legacy aliases (package_tier/amount/purchase_date/etc.). See docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names".
npm run test:invoice-generated-gate  # fences shouldEmitInvoiceGenerated(billing_reason): the server-side "Invoice Generated" receipt EMITs for subscription_create + one-time/mini/upsell (undefined billing_reason) and SKIPs subscription_cycle/threshold (renewal → Membership Renewal flow) + subscription_update (upgrade → webhook). Guards the 2026-07 move off the dropped-prone client-side /api/invoice/finalize path against re-introducing dropped receipts or double-emails.
npm run test:activity-log-keyset     # fences the admin activity-feed keyset pagination (compareActivitiesNewestFirst + paginateActivitiesByCursor): pages are contiguous (no overlap/gap), ties break by id, and — the core invariant — paginating with a page's cursor returns the SAME window after newer rows are prepended. Locks out the offset-drift duplicate-row bug the feed had before 2026-07.
npm run test:anchor-billing          # date math for both join-anchor and past-due reanchor: clamp 25/26/27→24, short-month last-day clamping, DST boundaries, year rollover, same-day roll, future-floor, invalid input.
npm run test:reanchor-gate           # trigger predicate for past-due reanchor: signal isolation (past_due DB status / pause_collection present / attempt_count>1), all exclusion arms (cancel_at_period_end, autoRenew=false, pauseReason=retention, already-reanchored).
npm run test:trial-invoice           # isZeroAmountTrialUpdateInvoice guard: skips Stripe's $0 'Trial period' subscription_update invoice (stops double-granting entries); real cycle/create/upgrade(>0)/100%-off-cycle still grant.
npm run test:zero-trial-guard        # webhook-LEVEL regression: handleInvoicePaymentSucceeded HONORS the guard. Mocks stripe.invoices.retrieve, spies on User.findOne (the guard returns before the user lookup). Asserts the $0 subscription_update invoice short-circuits (User.findOne NOT reached, no BenefitsGranted row) while a real subscription_cycle renewal AND a paid (>0) subscription_update upgrade both proceed. Catches a regression where the guard is removed/widened/bypassed — which the predicate unit test alone cannot. Needs MONGODB_URI (the handler connectDB()s before the user lookup).
npm run test:ack-gate                # the webhook-queue ACK gate (incident 2026-08-23, 11 members charged $300.00 with no entries): a handler that returns normally is NOT automatically a success. 6 cases / 27 assertions. Asserts an ungranted invoice.payment_succeeded leaves the row retryable and writes NO ProcessedStripeEvent row (that unique row is what blocked replay-based healing); that ordinary non-payment events (shouldMarkAsProcessed:false) still mark succeeded (gating on that flag would dead-letter 25 of the dispatcher's 27 case labels); that a real Stripe 429 requeues with the true error text in lastError; that the $0 trial-bookkeeping invoice still ACKs AND writes its dedup row (else: infinite retry loop); and both halves of the unknown-customer split — a non-subscription invoice ACKs, a subscription invoice stays retryable for the signup/SCA-3DS race. Cases C-F run the REAL dispatcher + handler with only stripe.invoices.retrieve stubbed. Needs MONGODB_URI — seeds/cleans real stripewebhookqueue rows. See docs/billing-stripe/STRIPE_WEBHOOK_QUEUE.md "The ACK gate".
npm run test:renewal-grant-reconciler # the paid-but-not-granted detector behind /api/cron/reconcile-renewal-grants (incident 2026-08-23). 25 assertions on a seeded 2019 window: a paid subscription_cycle with NO BenefitsGranted PaymentEvent is reported; one WITH its grant is not; failed cycles, non-subscription_cycle invoices and rows whose updatedAt is outside the window are not; the row carries userId/amountPaidCents/chargedAt; inserting the missing grant clears the gap. DUNNING RECOVERY (the load-bearing case): drives the REAL upsertRenewalCycleFromFailedInvoice -> upsertRenewalCycleFromPaidInvoice pair, asserts createdAt stays pinned to the FAILURE date while updatedAt is bumped, then that the recovered renewal IS detected while createdAt sits outside the window — a createdAt window would report clean here forever. Also pins status:"recovered" as money kept, dead-row reporting, and orchestrator totals. Needs MONGODB_URI. See docs/billing-stripe/architecture.md.
npm run test:mer                     # pure computeDrawMerRow: blended New Revenue = Σ newRevenue across ALL platforms incl. direct; blended Ad Spend = Σ ad-channel spend; MER = revenue/spend (null when no spend); Meta→amount+MER, TikTok→awaiting+null MER (the spend gap), Klaviyo/Direct→owned; NaN/missing coerce to 0. No env needed. See docs/admin/mer-table.md.
npm run test:platform-revenue-breakdown # covers the per-platform acquisition-revenue-by-category breakdown service (src/services/admin/__tests__/platformRevenueBreakdown.test.ts) backing /api/admin/dashboard/revenue-details/by-platform (the per-platform drill-down hover/expand).
npm run test:landing-draw-day-urgency # pure unit test for the landing draw-day urgency resolver (src/utils/promo/__tests__/landing-draw-day-urgency.test.ts). No DB/env needed.
npm run test:landing-video-resolver  # pure unit test for the landing hero video resolver (src/utils/promo/__tests__/landing-video-resolver.test.ts) — WebM precedes MP4 for every clip tier, drawn tier precedes base fallback. No DB/env needed. See docs/promo/frontend.md "WebM-first, MP4 fallback".
npm run test:prize-builder           # pure presentation model behind the "Build your prize" configurator (src/components/sections/promo/prize-selection/__tests__/prize-builder-model.test.ts): coverflow wrap-around + card geometry (hidden/dimmed/focused), {toolset}-{toolbox} slug round-trip, accent = selected TOOLSET (cash = green), darken(), combo hero copy, the derived POWERSET_*/TOOLBOX_* maps matching the TOOLBOXES/TOOLSETS registries, and the 6x2 contents-preview cap + "+N more" count. It also PARSES src/app/globals.css and asserts the `.prize-builder` reel variables match REEL_METRICS in both breakpoint blocks, so the hand-mirrored numbers cannot drift silently. No DB/env needed. See docs/promo/frontend.md "Prize builder".
npm run test:prize-builder-card      # renderToStaticMarkup smoke test of PrizeBuilderCard (src/components/sections/promo/prize-selection/__tests__/PrizeBuilderCard.test.ts): renders EVERY toolbox x toolset combination, then asserts markup invariants a browser-only bug would break - one focused card per lane, the --pbc-off/-abs/-scale custom properties present on every card, radiogroup/radio + roving-tabindex a11y, no nested or block-content <button>, every <img> has alt, cash mode drops the contents strip and the $5,000 flag, the locked (toolset-landing) lane, all five payment marks, and CLAUDE.md 11 copy safety. Needs the asset stubs: run via the npm script, not tsx directly.
npm run test:prize-gallery           # pure presentation model behind the /promotions "Spotlight" showroom (src/app/promotions/_components/__tests__/gallery-spotlight-model.test.ts): every TOOLSETS x TOOLBOXES combination resolves to a real catalog prize, a combo render that EXISTS ON DISK and a `/promotions/<slug>` link; the opening selection tracks DEFAULT_PRIZE_SLUG rather than a hard-coded pair; cash mode blanks the gear stats and links at cash-prize; every option has a distinct cross-fade key; and the CTA clears **WCAG AA (>= 4.5:1) on every brand accent** — that assertion is what caught white-on-Ryobi-lime at 2.9:1, and it guards a future brand automatically. Also pins `needsMarkOutline` to measured contrast, not a brand list, plus CLAUDE.md 11 copy safety. No DB/env needed. See docs/promo/frontend.md "/promotions Spotlight showroom".
npm run test:signup-attribution      # the signup-attribution gate (src/services/attribution/__tests__/signup-attribution.test.ts): whether a signup's promo page, built prize and paid-click platform reach the database at all. Persist guard is promo OR utm OR click — builtPrizeSlug is deliberately NOT a standalone trigger; an invalid built prize is ABSENT, not undefined-valued (a literal undefined in a $set writes the key); slugs lowercase+trim. Carries an ARGUMENT-POSITION guard (four distinct values, each asserted onto its own key) because all four params are optional and stringy and two branches each added a different third parameter. Also pins the F-019 merge: preserve-when-absent for the promo fields, last-write-wins elsewhere, and BOTH preservation mechanisms independently. No DB/env needed. See docs/auth/testing.md + docs/auth/gotchas.md.
npm run test:my-account-projection   # fences the /api/users/[id](/my-account) wire projections (src/utils/dashboard/my-account-projection.ts): MiniDraw entries[]/winner never ship (the MB-scale 2026-07 leak), wire-bloat + auth-secret User fields stay out, client-consumed fields (subscription, miniDrawParticipation, partnerDiscountQueue, …) stay in, and the lists remain include-lists. No DB/env needed. See docs/auth/gotchas.md.
npm run test:reconcile-attribution   # pure reconciler (src/services/attribution/__tests__/reconcilePersistedAttribution.test.ts): when the cookie-only edge decision is `direct`/absent, recovers an OWNED-channel (klaviyo_email/sms) platform leniently, and (2026-07-19) a PAID platform strictly — only signup-anchored touches affirmatively within the 7d click window; undatable/stale paid UTMs stay `direct`. Locks the live path to the same logic as scripts/backfill-klaviyo-attribution-cycle.ts and scripts/backfill-paid-attribution-recovery.ts. No DB/env needed.
npm run test:decline-guidance        # card-decline guidance pipeline (src/utils/payment/stripe/__tests__/payment-error-decline-guidance.test.ts): formatPaymentError / getCardDeclineGuidance / isStripeCardError / extractPaymentErrorCodes.
npm run test:csp-inline-hashes       # CSP hash-drift guard (src/utils/security/__tests__/inline-script-hashes.test.ts): recomputes sha256 of each constant in src/utils/security/inline-snippets.ts and asserts the token is in the NONCE-variant script-src of buildContentSecurityPolicy, and that the no-nonce fallback keeps 'unsafe-inline' with NONE of the hashes. A drifted constant = silently blocked inline script on every nonce route. No DB/env needed.
npm run test:sms                     # Mobile Message SMS adapter (src/lib/__tests__/sms.test.ts): normaliseAuMobile collapses every form a member, an admin or a legacy row can present (+61…/61…/04…/bare 9-digit/spaces/dashes/brackets) to ONE E.164 string, and is idempotent so a backfill run twice cannot corrupt data. Load-bearing because User.mobile is becoming a LOGIN IDENTIFIER — a number that normalises differently in two places is a silent lookup miss, i.e. a member who appears to have no account. Pins the 5-prefix regression the rewrite fixed (the old formatMobileNumber handled a bare 9-digit starting 4 but NOT 5, so a +615… number reached the gateway as "512345678" and could never deliver), rejects landlines/foreign/wrong-length, toGatewayNumber strips the leading "+" (the gateway rejects it), and isSmsEnabled is exact-string "true" opt-in — "1"/"yes"/"TRUE" must NOT enable spending. Pure: no network, no gateway credentials.
npm run test:mobile-otp              # OTP policy (src/utils/auth/__tests__/mobile-otp.test.ts), the layer above the gateway: generateOtpCode is 6 digits over the FULL 10^6 keyspace, with an explicit guard that codes beginning with 0 stay reachable — randomInt(100000,999999), the form it replaced, silently discards ~10% of them. hashOtpCode is HMAC-SHA256 keyed on NEXTAUTH_SECRET, not bare sha256 (10^6 codes are trivially rainbow-tableable): the same code under a different secret yields a different digest, cross-secret verification fails, hashing REFUSES unkeyed while verifyOtpCode fails closed rather than throwing. Also 10-minute expiry, and the dev-bypass rules — production NEVER bypasses whatever the env says, development bypasses by default, SMS_OTP_RATE_LIMIT_IN_DEV=true forces the limiter back on so it is testable locally. Refusal copy is asserted CLAUDE.md 11 clean and must offer the email fallback rather than dead-end. Pure: no Mongo (the claim path is exercised through the dev bypass).
npm run test:bonus-code-expiry       # exact-offset expiry + re-arm cooldown (src/utils/redeemables/__tests__/expiry-hours.test.ts; replaced expiry-window.test.ts, which was deleted on 2026-08-26 with the calendar-day helper it tested). `expiryAfterHours(from, hours)` — plain epoch-millisecond arithmetic, deliberately no timezone conversion — pinned across a DST spring-forward AND fall-back, a year rollover and a leap day, asserting the ELAPSED millisecond delta (never the shifted wall-clock hour, which legitimately moves by an hour and is correct, not a bug), plus that no `.setUTCSeconds(59,999)`-style rounding is silently reintroduced (the sub-second field of `from` survives untouched), plus zero/negative/fractional-hour guards. Also pins `decideRearm`'s new 4th param, the re-arm cooldown (`REARM_COOLDOWN_DAYS`, default 30 days from `firstIssuedAt`): a lapsed row inside the cooldown refuses even WITH a trigger (the whole point — a webhook caller always supplies one, so the old trigger-only gate can no longer refuse a replay), outside the cooldown it still re-arms, the exact boundary instant re-arms (strictly exclusive on the cooldown's end), `redeemedEverAt` wins over the cooldown, a missing `firstIssuedAt` is a no-op (the caller is expected to fall back to `issuedAt`), and the no-trigger path is byte-identical to before the cooldown existed. No DB/env needed. See docs/rewards-redeemables/architecture.md.
npm run test:issuance-expiry         # resolveIssuanceExpiry precedence chain (src/services/redeemables/__tests__/issuance-expiry.test.ts): the single stamp site for a bonus-code issuance, pinned end to end — validForHours > neverExpires > endsAt > null, including that a personal window OUTRANKS neverExpires (the pair is mutually exclusive upstream, but if a row ever carried both, silently stamping the year-9999 sentinel would hand out a code that never expires), that validForHours < 1 is not a personal window and falls through, and that "nothing usable" returns null so the caller writes NOTHING rather than persisting a deadline-less issuance. Also pins the EXACT-offset arithmetic: the deadline is issuedAt + validForHours hours on the timeline (no calendar-day snap, no 23:59:59.999 rounding — the mint's millisecond component is carried through untouched, which is the guard against anyone re-applying .setUTCSeconds(59, 999)). No DB/env needed. See docs/rewards-redeemables/architecture.md.
npm run test:bonus-code-policy       # pure per-customer bonus-code policy (src/utils/redeemables/__tests__/bonus-code-policy.test.ts): decideRearm's re-arm decision table (redeemedEverAt is permanent even after a refund restores status:"active"; the live window keys off expiresAt, never status:"expired"; re-arming a lapsed window requires an explicit trigger), personalWindowGoverns, and isCampaignRedeemable (endsAt vetoes redemption only for a legacy campaign — a personal-window campaign's endsAt is a minting backstop, not a redemption deadline). No DB/env needed. See docs/rewards-redeemables/backend.md.
npm run test:bonus-code-mint         # THE MINT, against a live DB (src/services/redeemables/__tests__/bonus-code-mint.test.ts). Pins Mongo's own upsert contract first — an includeResultMetadata upsert reports lastErrorObject.updatedExisting false + an `upserted` id on insert and true with no `upserted` on a $setOnInsert-only MATCH — because that single field is how createIssuanceForUser tells "I minted" from "a concurrent trigger won", and TypeScript cannot verify a driver's runtime shape. Then: the mint stamps one row whose persisted expiresAt IS the one handed back for the email; a second trigger inside the live window re-sends the STORED deadline and writes no second row; five concurrent triggers yield exactly one `minted` + four `already_active`, one row, and zero `not_applicable` (the fingerprint of an escaped E11000 — the pre-fix bug that surfaced as "cancel failed" on a subscription Stripe had already cancelled); a lapsed grant re-arms with a fresh deadline while firstIssuedAt survives and notifiedAt/notifyError are cleared; a redeem → refund-reversal → re-trigger cycle still reports `spent` because redeemedEverAt survives the reversal; and legacy parity (no validForHours ⇒ expiresAt = campaign.endsAt to the millisecond, neverExpires ⇒ the 9999 sentinel, and the wallet sweep still enrols into a legacy campaign while refusing a personal-window one). NEEDS DB (.env.local) — creates and deletes its own users/campaigns/issuances. See docs/rewards-redeemables/testing.md.
npm run test:campaign-enrolment      # CampaignService enrolment against a live database (src/services/redeemables/__tests__/campaign-enrolment.test.ts). Renamed from test:bonus-code-trigger on 2026-08-26 when the three internal trigger call sites were deleted; what remains tests CampaignService, not any trigger wiring. Section 1 proves a customer with no active subscription IS enrolled when a trigger is passed to a personal-window campaign — and that the same trigger does NOT widen a legacy campaign — and that the wallet sweep enrols nobody into a personal-window campaign even when the user is explicitly pinned into it. Section 2 pins the email-verified WAIVER from both sides against persisted data: a trigger waives requiresEmailVerified whether Mongoose stored it by schema default (2a) or an admin set it deliberately (2b), while a legacy campaign still gates even WITH a trigger (2c) and the wallet sweep still gates with none (2d). 2a first asserts the campaign row really carries requiresEmailVerified: true — that persisted value is what made the original `?? !triggerIsTargeting` fix dead code, and it is invisible to the pure suite, which builds campaign objects by hand. This is the eligibility contract POST /api/bonus-codes/v1/issue depends on. NEEDS DB (.env.local). Nothing here emits — CampaignService imports no Klaviyo/email client — so the old require.cache stub, identity gate, VERCEL_ENV forcing and BACKIN200 refuse-to-run guard all went with the deleted production-gate sections; the production gate is asserted in test:bonus-code-webhook instead. See docs/rewards-redeemables/gotchas.md.
npm run test:code-visibility         # the code-visibility rule end to end through GET /api/redeemables/status (src/app/api/redeemables/status/__tests__/code-visibility.test.ts): a campaign code is returned ONLY to a customer holding an issuance for THAT campaign. Two customers, two live campaigns, one response each — the holder sees their code in both `activeCampaigns` and the singular `activeCampaign`; the non-holder gets the campaign LISTED but the `code` key absent (a redaction, not a filter); and the customer who holds a DIFFERENT campaign's issuance sees exactly one of the two codes, which is what catches a naive "does this user hold any issuance?" implementation. next-auth is replaced in require.cache to stand in for the session cookie a test process cannot mint; everything downstream is the real handler. NEEDS DB (.env.local).
npm run test:bonus-code-webhook      # the Klaviyo bonus-code webhook end to end through the real POST /api/bonus-codes/v1/issue handler (src/services/redeemables/__tests__/bonus-code-webhook.test.ts). Twelve sections: authorization (missing / wrong / wrong-but-SAME-LENGTH secret all 401 — the last is the only case timingSafeEqual actually compares byte by byte; it THROWS on unequal-length buffers, which is what the byte-length pre-check in auth.ts prevents — and an UNSET server secret answers 500, never 200, which is the fail-closed property asserted rather than assumed); comma-separated rotation (both accepted during the overlap, the old one revoked once dropped); the production assertion (VERCEL_ENV=preview answers 403 and writes no issuance row); the body contract, including that an EMPTY userId and a non-ObjectId userId both fall through to the email instead of 400 — that is what {{ person.user_id }} renders on a newsletter-form profile, and guest checkout-start is the cohort most exposed to it; customer resolution including the identity_conflict refusal when userId and email name DIFFERENT accounts — answered 200 with a body byte-identical to a mint (amended 2026-08-26; see docs/rewards-redeemables/api.md, "Why the identity conflict is not a 409"), with the audit row AND the route's console.error both asserted because the status no longer distinguishes it; the status map's load-bearing split — a thrown mint answers 500 so Klaviyo retries and the grant is recoverable, while "no campaign carries this code" answers 200 so a permanent condition does not manufacture a retry storm (those two were one value before this rework); the window — exactly 259_200_000 ms as a literal, a second call inside it returns already_active WITHOUT extending the deadline or emitting a second email, and a spent grant stays spent; the mint budget (kill switch and exhausted daily cap both 429 with nothing minted); response opacity, asserting the mint body and the "no such customer" body are byte-for-byte identical so the endpoint cannot be used as a customer-state oracle; and an audit row on EVERY path, refusals included, which is what makes the daily cap real since the budget counts those rows. Klaviyo is replaced in require.cache and verified BY OBJECT IDENTITY before production mode is entered; BONUS_CODE_BY_TRIGGER is repointed at per-run fixture codes (restored in finally) so the suite never creates a real BACKIN200/LOCKIN100/EXTRA100 campaign and stays runnable after launch. NEEDS DB (.env.local). See docs/rewards-redeemables/api.md.
```

## QA seed: past-due member for reanchor recovery testing

`scripts/seed-past-due-member.ts` creates (or reuses) a MongoDB user and a set of Stripe test-mode
objects in a ready-to-recover `past_due` state so a human can log in and exercise every recovery
channel of the Past-Due Reanchor feature (admin charge-past-due, force-charge, user renew-subscription
retry, and user pay-failed-invoice) without waiting 30+ days for a real renewal to fail.

The script uses a Stripe Test Clock so the entire dunning cycle (~30 days) completes in seconds.
It refuses any key not starting with `sk_test_`, tags every Stripe object with
`metadata: { seed_past_due_reanchor: "1" }` for safe cleanup, and never touches production.

```bash
# Always dry-run first — validate env + print the plan, create nothing
npm run seed:past-due-member:dry -- --email=qa-reanchor@example.com

# Live seed (creates Stripe test objects + MongoDB user, advances clock, leaves member in past_due)
npm run seed:past-due-member -- --email=qa-reanchor@example.com

# Optional overrides
npm run seed:past-due-member -- --email=qa-reanchor@example.com --password=MyPass1! --package=foreman-subscription

# Cleanup (deletes test clock + customer + user if firstName=QA, lastName=Reanchor)
npm run seed:past-due-member -- --cleanup --email=qa-reanchor@example.com
```

Prerequisite: run the Stripe webhook listener so `invoice.payment_succeeded` reaches the app:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

After seeding, log in with the printed credentials and test each recovery channel. After each
channel test, verify that `User.subscription.endDate` moved to the new anchor day,
`lastReanchoredInvoiceId` is set, a `MembershipStatusHistory` row with
`source: "webhook_past_due_reanchor"` exists, the Stripe sub status is `trialing`, and the
Klaviyo `next_renewal_date` property was updated.

## Stripe test-mode probe: past-due reanchor

`scripts/stripe-probe-reanchor.ts` confirms — against the **live Stripe API in test mode** — the behaviours the past-due reanchor feature assumes before the behaviour flip merges to main (design spec §9 / `docs/PAST_DUE_REANCHOR.md`). It refuses any key not starting with `sk_test_`, creates throwaway test objects, and deletes them afterwards. Reuses the real `getReanchorTrialEndTimestamp` helper so the date math is validated end-to-end against Stripe.

```bash
npm run stripe:probe-reanchor:dry          # validate the test key + print the plan; create nothing
npm run stripe:probe-reanchor              # Part A: trial_end behaviour on an active, just-paid sub
npx tsx scripts/stripe-probe-reanchor.ts --full   # Part A + Part B (real past_due→recovery via a Test Clock)
npx tsx scripts/stripe-probe-reanchor.ts --full --keep  # leave test objects for dashboard inspection
```

Asserts: A1 no new charge after the `trial_end` update, A2 `status==='trialing'` & `items[0].current_period_end===trial_end`, A3 the paid invoice stays paid, A4 (`--full`) the recovery invoice carries `billing_reason==='subscription_cycle'` & `attempt_count>1`, A5 (`--full`) the clear-pause-then-set-`trial_end` ordering succeeds. Exits non-zero if any assertion fails.

### Companion probes (2026-07-20)

Two sibling test-mode probes gate the stranded-recovery billing changes (same `sk_test_`-only + auto-cleanup guarantees):

```bash
npm run stripe:probe-recovery-marker   # dunning_recovery metadata SURVIVES finalizeInvoice (gates the reanchor-on-recovery fix; docs/PAST_DUE_REANCHOR.md)
npm run stripe:probe-rebill-cycle      # unpause + billing_cycle_anchor:'now' on a no_held_draft member → mintCurrentCycleInvoice collects the cycle, moves the renewal ~1mo out, voids the original (gates the no_held_draft re-bill; docs/CHARGE_PAST_DUE_CUSTOMERS.md)
npm run test:mint-current-cycle        # pure unit test of the mint primitive (injected deps; claim/anchor/void/charge-failed/skipClaim branches)
npm run stripe:probe-member-resolve-mint  # MEMBER "Resolve" no_held_draft mint: a decline leaves the minted invoice still_chargeable (NOT stranded → no re-mint), and an add-a-card retry collects on the new default (gates the member mint-on-resolve; docs/FAILED_RENEWAL_PAY_NOW.md)
npm run test:member-resolve-mint       # pure unit test of classifyMemberResolveMintOutcome (mint result → collected / retry_interactively / blocked)
npm run test:force-charge-mint-map     # pure unit test: mint failure reason → ForceChargeResult reason (the force-charge/renew no_held_draft re-bill fallback)
npm run test:rebill-classification     # pure unit test: isRebillPayment / effectiveBillingReasonForRebill (a past-due re-bill success is a RENEWAL, normalized to subscription_cycle everywhere)
```

### Trial-aware upgrade probe (2026-08-24)

`scripts/stripe-probe-upgrade-anchor.ts` is the **merge gate** for the trial-aware tier upgrade
(`docs/PAST_DUE_REANCHOR.md` → *Third `trial_end` trigger*). Same `sk_test_`-only refusal and
auto-cleanup as its siblings; no MongoDB, no test clock needed (~15-30s).

```bash
npm run stripe:probe-upgrade-anchor:dry   # validate the test key + print the plan; create nothing
npm run stripe:probe-upgrade-anchor       # the full 10-assertion gate
npx tsx scripts/stripe-probe-upgrade-anchor.ts --keep   # leave objects for dashboard inspection
```

It exists for one question the docs could not answer: **how many invoices does the pay-first call
produce, and which is `latest_invoice`?** The route hard-fails an upgrade whose `latest_invoice` is
under half the expected charge, so a $0 bookkeeping invoice landing last would return HTTP 500 to a
correctly-charged member *and* skip the anchor re-apply. **U5** answers it: exactly one invoice, full
price, no $0 sibling. **U0** is a control that reproduces the original production 400 verbatim, so
the probe fails loudly if Stripe ever changes the behaviour the workaround is built on. **U8**
confirms `isZeroAmountTrialUpdateInvoice` classifies the real spawned Stripe object, not just the
fixture used by `npm run test:zero-trial-guard`.

A re-bill SUCCESS is `billing_reason: subscription_update` (same as an upgrade) but is a **renewal** — the webhook normalizes it to `subscription_cycle` so labels, revenue/ROAS, and conversion tracking treat it as one (see [docs/billing-stripe/gotchas.md](../billing-stripe/gotchas.md)). Historical events created before that shipped are corrected by the **dry-run-safe, Stripe-confirmed** backfill:

```bash
npx tsx scripts/backfill-rebill-payment-events.ts                 # DRY-RUN (no writes): confirm each candidate is a re-bill via live Stripe
npx tsx scripts/backfill-rebill-payment-events.ts --since-hours=24
npx tsx scripts/backfill-rebill-payment-events.ts --apply         # LIVE: flip confirmed re-bill PaymentEvents → subscription_cycle + isRenewal
```

The `no_held_draft` re-bill mint is now wired into **every** past-due collection entry point: the member "Resolve" (`pay-failed-invoice`), the member "Pay overdue" + admin Force-Charge (`forceChargeCurrentCycle`), the member renew retry (`renew-subscription`), the per-user admin Charge (`chargeOrRecover`), and the bulk run — so no stranded member dead-ends at "no held draft" on any path.

### Retention-pause (`paused` state) verification (2026-07-21)

The 30-day retention-`paused` membership state is covered by fast unit tests plus a Stripe-mechanism probe:

```bash
npm run test:pause-transition          # pure decidePauseTransition (flip/restore decision SHARED by the webhook + retention cron; 8 cases)
npm run test:retention-pause           # computeResumeAt (period_end + 1 month, next-cycle-boundary timing) + retentionPauseBlockReason guards
npx tsx scripts/stripe-probe-pause-lifecycle.ts   # sk_test only: void pause discards the cycle invoice during the freeze (no charge; Stripe stays "active"); Stripe auto-resumes + bills at resumes_at
```

## Cleanup / backfill scripts

```bash
npm run cleanup:abandoned-incomplete:dry   # scan + plan only (no writes); add -- --older-than-hours=0 to include very recent subs
npm run cleanup:abandoned-incomplete       # LIVE: cancel abandoned incomplete subs, void open invoices, repair/clear stripeSubscriptionId pointers

npm run backfill:klaviyo-membership-properties:dry  # compute + sample 10 users; no Klaviyo writes
npm run backfill:klaviyo-membership-properties      # LIVE: re-upsert every active user to backfill 5 new canonical profile properties (membership_status, entries_purchased, giveaways_entered, membership_active_duration_months, next_renewal_date) — see docs/tracking/KLAVIYO_INTEGRATION.md "Profile properties added 2026-05-28"
```

Default window is subs older than 24 hours (normal `incomplete` subs self-expire after ~23h anyway; the real targets are trial+incomplete subs). Use `--older-than-hours=0` to sweep very recent ones. Always dry-run first.

The Klaviyo membership-properties backfill is idempotent (upserts by email) — safe to re-run. At the default 100ms throttle the runtime is roughly `active_user_count / 10` seconds. Run after Phase 2 deploys so the ads team's new segments work from day 1; existing users would otherwise only get the properties on their next webhook event (cancellation, renewal, purchase, etc.).

- `npm run test:variant-config-membership-theme` — standalone `tsx` unit test
  for `VariantConfig.membershipTheme.forceLight` default/merge/validation
  (A/B membership dark-mode test).
- `npm run test:experiment-metrics` — pure unit test for the A/B measurement
  core (`src/utils/ab-testing/experiment-metrics-core.ts`): user-level conversion
  + revenue, 14-day conversion window, renewal-as-separate-line, partial/full
  refund netting, per-user winsorization, and attribution by the user's *assigned*
  variant (not the payment's stamped one). No DB/env needed. See
  `docs/ab-testing/backend.md` "Measurement core v2".
- `npm run test:bayesian` — pure unit test for the Bayesian chance-to-win engine
  (`src/utils/ab-testing/bayesian-test.ts`): Beta-Binomial posteriors, deterministic
  numerical `P(variant>control)`, `isControl` baseline, 3+ variant handling,
  min-sample noise gate, and ship/keep recommendations. No DB/env needed. See
  `docs/ab-testing/backend.md` "Statistics engine v2".
- `npm run test:affiliate-reversal` — pure unit test for `buildCommissionReversalIds`
  (`src/utils/affiliate/reverse-commission.ts`): proves a refund's (paymentIntentId,
  invoiceId) matches every commission storage form — raw `pi_…` (one-time/upsell/
  mini-draw), normalized `invoice_in_…` (membership-first), and `stripeInvoiceId`
  (membership-recurring). Guards the fix for the refunded-renewal commission leak.
  No DB/env needed. See `docs/affiliate/gotchas.md`.

## Dashboard stats snapshot scripts

| npm script | purpose |
|---|---|
| `npm run backfill:dashboard-stats-snapshots:dry` | Dry-run backfill — prints dates that would be written |
| `npm run backfill:dashboard-stats-snapshots -- --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD` | Live backfill for a specific range |
| `npm run verify:dashboard-stats-drift -- --samples=30` | Samples N snapshot dates, re-aggregates live, exits non-zero on drift |

Both scripts load `.env.local` and require `MONGODB_URI`.

## Diagnostic find scripts

| npm script | file | covers |
|---|---|---|
| `npm run find:stuck-paused-users` | `scripts/find-stuck-paused-users.ts` | queries MongoDB for `past_due` users whose Stripe sub has no chargeable invoice; outputs CSV to stdout, progress to stderr; supports `--limit=N` and `--include-orphans` |
| `npm run find:duplicate-subscriptions` | `scripts/find-duplicate-stripe-subscriptions.ts` | finds users with multiple active Stripe subscriptions |
| `npm run find:radar-lists` | `scripts/find-radar-value-lists.ts` | lists Stripe Radar value lists |
| `npm run find:duplicate-mobiles` (`:prod` for production) | `scripts/find-duplicate-mobiles.ts` | **READ-ONLY.** Pre-flight audit for making `User.mobile` a login identifier (SMS OTP login resolves the account *by mobile*). Reports three failure classes: **duplicates** (two accounts sharing a number ⇒ an ambiguous lookup, i.e. a takeover risk), **drift** (rows stored `04…` rather than the `+61…` the model's `pre("save")` hook produces — `updateOne` bypasses the hook, so a normalised lookup silently *misses* these users), and **invalid** (fails the schema validator). Also reports email/mobile verification coverage, since making both mandatory has a per-member SMS cost. Ranks each duplicate group by account value (active sub / active pack / entries / Stripe customer / **privileged**) so a merge can pick a survivor. Flags `--csv <path>`, `--limit <n>`, `--prod`. 3-tier exit: `0` clear · `1` mechanical cleanup needed · `2` contested or privileged groups need a human decision. Issues only `countDocuments` and a projected `find` — safe against production. **Remediation for the drift + duplicates it reports is `migrate:normalise-mobiles`** ([architecture.md](./architecture.md#mobile-normalisation-migration-migratenormalise-mobiles-added-2026-08-27)); re-run this audit afterwards — it must report 0 of both before the unique index on `mobile` is added. |
| `npm run find:duplicate-trial-entry-grants` | `scripts/find-duplicate-trial-entry-grants.ts` | **READ-ONLY.** Lists membership entry-grants double-granted by Stripe's $0 "Trial period" `subscription_update` invoice (see `docs/PAST_DUE_REANCHOR.md` gotcha). A "confirmed duplicate" has a sibling real grant (`subscription_cycle`/`subscription_create`) within ±1 day; standalone update-grants are listed separately and NOT counted. |
| `npm run reverse:duplicate-trial-entry-grants:dry` (drop `:dry` + add `--apply` for live) | `scripts/reverse-duplicate-trial-entry-grants.ts` | **DRY-RUN by default.** Reverses the confirmed `$0`-trial duplicates the find script lists. Flags: `--all` / `--userId=` / `--email=`, `--since=YYYY-MM-DD` (default 2026-01-01), `--include-points` (off by default). Per clean dup: scoped `removeMajorDrawEntries(userId, N, 'membership', drawId)` (drawId from the ledger), `$inc accumulatedEntries −data.entries`, SETs `lastMonthAccumulatedEntries` to the **real sibling renewal's `data.entries`** (only when it's the latest cycle — corrects the compounding baseline; decrement-by-delta is wrong in the concurrent case), writes a `BenefitsReversed` marker **first** as an atomic idempotency claim (unique `{paymentIntentId,eventType}` index), then `$pull`s the invoice from `processedPayments` and DELETEs the spurious `BenefitsGranted` event (clears the bogus "Subscribed to X" activity row). **Anomalous** dups (`data.entries` exceeds scoped `drawGrants` — e.g. empty ledger) and **standalone** update-grants are FLAGGED, never auto-reversed. Never touches Stripe / `subscription.isActive`/`autoRenew`/`endDate` / `Winner` / `TicketEntry`. |
| `npx tsx scripts/fix-major-draw-renewal-entries.ts` (`--apply` for live) | `scripts/fix-major-draw-renewal-entries.ts` | **DRY-RUN by default.** Backfills membership renewals that failed to credit the active `MajorDraw` (the swallowed-`addToMajorDraw` bug). Authoritative basis: live draw membership vs the member's latest in-window membership `BenefitsGranted` `data.entries` (NOT `lastMonthAccumulatedEntries`, which drifts ahead). Confirmed victim = latest renewal has empty `drawGrants` + active sub + renewal not refunded + draw < grant. Credits `grant − current`, back-fills the empty `drawGrants`, idempotent (re-reads before writing). Writes a plan CSV to `temp/readonly/`. |
| `npm run verify:major-draw-entries` (`:dry` for console-only) | `scripts/verify-major-draw-entries.ts` | read-only entry & multiplier audit for the active `MajorDraw`. For every participant: replays the `PaymentEvent` ledger (`drawGrants`) against live `entriesBySource` (catches missing/double/dropped entries), checks `sum(entriesBySource) == totalEntries`, and reconstructs the **applied vs scheduled-grid multiplier per purchase date** — replaying one-time rules (own one-time grid → else derived 10→5/5→3; Additional one-time bought by a member → membership grid). Resolves the grid *as of the purchase moment* (incl. soft-deleted phases) so retroactively-painted days aren't false-flagged. Writes two CSVs to `temp/readonly/`. Flags: `MULTIPLIER_MISMATCH` (grid existed, wrong mult), `NO_GRID_AT_PURCHASE` (bought before the day's grid was painted), `LEDGER_VS_LIVE`, `INTERNAL_INCONSISTENT`. Options: `--drawId`, `--userId`, `--email`, `--limit`, `--dump-grid`, `--dry-run`, `--verbose`. |

Run against production only from a secure machine with `.env.local` set up. The `find:stuck-paused-users` script is a pre-requisite for the Force Charge rollout checklist.

## What's NOT well tested

- Cron endpoint auth thoroughness
- Cloudinary signing edge cases
- Env validation across all consumers

## `test:utm-storage` added (2026-08-10)

`package.json` gained `test:utm-storage` → `src/utils/tracking/__tests__/utm-storage.test.ts`.
Per CLAUDE.md, a `src/**/__tests__/*.test.ts` file is undiscoverable without its own `test:*`
script, since there is no test runner that globs them.

One convention worth copying: the test uses **static** imports plus mocks installed afterwards,
matching `attribution-cookie.test.ts`. Dynamic `await import()` fails here — tsx transforms to
CJS and rejects top-level await. Static imports are safe as long as the module under test
touches `window`/`document`/`sessionStorage` only inside functions, never at module scope.

Rationale for the test itself: [docs/tracking/testing.md](../tracking/testing.md).

## `test:utm-helpers` added (2026-08-10)

`package.json` gained `test:utm-helpers` → `src/utils/tracking/__tests__/utm-helpers.test.ts`,
guarding a bug where `extractAttributionParams(window.location.search)` returned `{}` and
silently disabled all client-side UTM capture. Full write-up:
[docs/tracking/gotchas.md](../tracking/gotchas.md).

## `test:attribution-metadata` added (2026-08-10)

`package.json` gained `test:attribution-metadata` →
`src/utils/tracking/__tests__/attribution-metadata.test.ts`. Guards every Stripe purchase path
against an over-long URL-derived attribution value exceeding Stripe's 500-character metadata
limit, which would fail the charge. Rationale:
[docs/tracking/gotchas.md](../tracking/gotchas.md).

> `test:shop-checkout-reuse` (`tsx src/services/shop/__tests__/checkout-reuse.test.ts`) guards the duplicate-order fix — the money path. DB-backed against `E2E_MONGODB_URI` (it refuses to run unless the URI names an e2e database). Asserts: the same cart twice yields ONE order row; an address edit still reuses and persists the edit; a changed cart retires the old pending order to `cancelled` rather than leaving two open; a pending order older than `PENDING_GRACE_MS` is not reused; and `abandonPendingOrder` cannot clobber an order the webhook already moved to `processing` (the `status: "pending"` filter is the race guard). Mutation-tested — disabling the reuse branch fails 2 of 5. **Fixture trap worth knowing:** Mongoose marks a `timestamps`-managed `createdAt` immutable, so `$set` through the model is silently stripped; the aging step goes through `Order.collection` directly, with a guard assertion that the row actually aged.
## `test:receipts` + `verify:receipts-reconciliation` added (2026-08-17)

`package.json` gained four script families for the admin Receipts ledger:

| Script | Kind | Notes |
|---|---|---|
| `test:receipts` | pure unit | `src/services/admin/__tests__/receipts.test.ts`. Mongoose-free — runs on `tsx` with no env vars. |
| `verify:receipts-reconciliation[:prod]` | live, **read-only** | `scripts/verify-receipts-reconciliation.ts`. Proves the ledger's totals against the dashboard's. Exit 0 = reconciled, 1 = mismatch (a real bug), 2 = the run failed. Safe against production — performs no writes. |
| `migrate:backfill-receipts-view[:dry\|:prod:dry\|:prod]` | one-shot migration | `scripts/migrations/2026-08-17-backfill-receipts-view.ts`. Dry-run by default; `--apply` writes. Grants `receipts.view` to every role already holding `settings.view`. |

The migration follows the established four-variant shape of the other permission backfills
(`:dry` / apply / `:prod:dry` / `:prod`) and loads its env file **before** importing anything
that reads `MONGODB_URI` — `src/lib/mongodb.ts` resolves the URI at import time and throws if
unset, so the `dotenv.config()` call sits between the import groups on purpose.

Rationale: [docs/admin/receipts.md](../admin/receipts.md),
[docs/auth/permissions-catalog.md](../auth/permissions-catalog.md).

## Refund-accuracy scripts added (2026-08-17)

Two more read-only-by-default operational scripts, both supporting the admin Receipts ledger:

| Script | Kind | Notes |
|---|---|---|
| `audit:receipts-refunds[:prod]` | live, **read-only** | `scripts/audit-receipts-refund-accuracy.ts`. Internal consistency of the refund ledger: orphans, duplicates, full-refund amount vs granted price, conflicting refund kinds, plus a Stripe count comparison. Exit 0 = clean, 1 = discrepancies, 2 = run failed. |
| `backfill:missing-refunds[:dry\|:prod:dry\|:prod]` | one-shot backfill | `scripts/backfill-missing-refund-events.ts`. Correlates Stripe refunds to ledger purchases **through the customer** (the id-based join is impossible — see below) and writes the missing `RefundProcessed` rows. Dry-run by default; progress-logged per the ops-script convention. |

⚠️ **Why correlation goes through the customer.** A Stripe refund carries a PaymentIntent; the
ledger keys a subscription payment by its invoice (`invoice_in_…`). In Stripe API v18.5.0
`charge.invoice`, `invoice.payment_intent`, `invoice.charge` and `invoice.payments` are all
absent, so the two ids cannot be joined directly. Matching on the PaymentIntent alone reports
every subscription refund as missing — a false positive that the first version of the audit
produced. That correlation exists in exactly one place (the backfill script); the audit script
reports counts and defers to it.

`backfill:missing-refunds --apply` repairs **revenue only** — it does not reverse entries or
benefits, because the affected draws have already been run. Rationale:
[docs/admin/receipts.md § Refund accuracy](../admin/receipts.md#refund-accuracy--audited-2026-08-17).

## SMS / mobile-OTP test scripts added (2026-08-26)

`package.json` gained three `tsx` scripts with the Mobile Message SMS work; none run in CI.
The two pure unit tests — `test:sms` and `test:mobile-otp` — are in the `npm test scripts`
block above. Both run offline: no Mongo, no gateway credentials, no network.

The third, `npm run smoke:sms-send` ([`scripts/smoke-sms-send.ts`](../../scripts/smoke-sms-send.ts)),
is **not** a unit test — it sends a REAL SMS to a number passed on argv and spends gateway
credits. It refuses to run unless `SMS_ENABLED=true`. Documented with the other live probes in
[dev-tooling/testing.md](../dev-tooling/testing.md).

Two coverage gaps worth knowing, both deliberate:

- `claimOtpSendAllowance`'s real limiter path talks to Mongo, so the unit test exercises it only
  through the **development bypass**. What is pinned instead is the bypass rule itself — production
  can never take that branch — because a bypass leaking into production removes every spend guard.
- The verification/login **routes** are not covered because they do not exist yet. Design:
  [the verification spec](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).
