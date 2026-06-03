# Internal Norm — Merge-to-main strategy

How to land `feature/norm-staging` (the whole internal-norm subsystem + OpenClaw integration) into
`main`. Written after the **2026-06-03 catch-up merge** that brought the branch up to `origin/main`
(`90a3f0df`). Read this before opening or merging the PR.

## What this branch adds to main

`main` has **no** internal-norm code. This branch adds, on top of a now-current main:

- `src/lib/internal-norm/**` — the `withNorm` wrapper, auth (HMAC), registry (`classification.ts`),
  kill switch, rate limits, audit, and all response Zod schemas.
- `src/app/api/internal/norm/v1/**` — 89 wired read routes (thin; each delegates to a service).
- `src/app/api/admin/internal-norm/**` + `src/app/admin/component/internal-norm/**` — the owner's
  Audit / Endpoints / Pending admin tabs (Team → Norm).
- 4 Mongo models (`NormCallLog`, `NormTriggerReceipt`, `NormPendingAction`, `NormEndpointSettings`),
  the manifest generator + generated `src/generated/normToolsManifest.json`, the
  `norm-must-import-service` ESLint rule, the create-norm-user migration, and `docs/internal-norm/`.
- **Service extractions:** several admin routes (`dashboard/stats`, `facebook-ads/{insights,
  hourly-insights,purchase-audit}`, `activity-log`, ab-testing experiment reads) were refactored so
  their logic lives in `src/services/**` and both the admin route and the Norm wrapper share it. The
  catch-up merge ported main's later inline additions to those routes **into** those services, so
  the admin behavior on this branch already equals main's.

## Conflict expectation for feature/norm-staging → main

**Low.** Because the branch just absorbed all of `origin/main`, a PR merge into main should be a
near-fast-forward of the norm additions. The only files both sides touch are the shared ones the
catch-up already reconciled (the manifest in `CLAUDE.md`, `package.json` scripts, the 5 extracted
routes/services, the docs unions). Re-run `git fetch && git merge origin/main` on this branch
immediately before opening the PR to absorb any further main movement; resolve using the same rule:
**keep admin routes thin, port any new inline admin logic into the shared service, keep `norm-context.md`
in lockstep with `classification.ts` + the schemas.**

## Verification gates (all green as of 2026-06-03)

Run before merging:

1. `npm run type-check` — clean.
2. `npm run build` — green (Turbopack; lints `src/**` via next; regenerates the manifest).
3. Tests: `npm test` (anchor-billing), `npm run test:zero-trial-guard`, `test:reanchor-gate`, the
   `test:norm-*` family, `test:facebook-ads-insights-service`, the `test:facebook-ads-health-*` trio.
4. **Live smoke** against a running server (`npm run start`, then with `MSYS_NO_PATHCONV=1` on Git
   Bash): `npm run norm:smoke -- GET /api/internal/norm/v1/health` → 200; same for `/v1/manifest`,
   `/v1/dashboard/stats?dateRange=today`, `/v1/activity-log?limit=5`. Unsigned request must 401.

**Known pre-existing lint debt (NOT introduced by this work, present on main too):** `npm run lint`
(`eslint .`) reports 3 errors in `scripts/migrate-klaviyo-draw-properties.ts` and
`scripts/codemod-dark-text.js`. `next build` does not lint `scripts/`, so the build is green; these
are inherited from main and out of scope for the norm work — fix separately if desired.

## Production preconditions (must be true for Norm/OpenClaw to call the API)

1. **Env vars:** `NORM_BEARER_TOKEN` and `NORM_SIGNING_SECRET` set (missing → 500 on every call).
   Optional `NORM_DISABLED_REGISTRY_KEYS` for env-level kill switch. (Documented in `.env.example`.)
2. **Migration:** run `npm run migrate:create-norm` (creates the `Norm` Role + service-account User).
   Reads bypass the permission check, so reads work without it; write/trigger tiers need it.
3. **Manifest committed:** `src/generated/normToolsManifest.json` is generated in predev/prebuild and
   committed — `/v1/manifest` serves it for Norm's capability discovery.
4. **Kill switch off:** no endpoint disabled in the Endpoints tab / `NORM_DISABLED_REGISTRY_KEYS`.
5. **Network:** Norm runs on the owner's Mac mini and reaches the deployment over the public domain
   (or Tailscale for local dev). No middleware/CSP gating applies to `/api/internal/norm/**` (the
   middleware matcher excludes `/api`).

## Rollout & rollback

- **Rollout:** open the PR `feature/norm-staging → main` (do not self-merge). Reads are inert until
  the env vars + migration are in place, so merging the code is safe even before Norm is pointed at
  production. Flip endpoints on per the owner's pace via the Endpoints tab.
- **Rollback:** the merge commit is the rollback unit (revert the PR merge). The norm surface is
  additive and isolated under `/api/internal/norm/**` + `src/lib/internal-norm/**`; reverting cannot
  affect customer-facing routes. To disable instantly without a deploy: unset `NORM_BEARER_TOKEN`
  (all calls 500/closed) or set `NORM_DISABLED_REGISTRY_KEYS` to the keys to kill.

## New admin-data reads — DONE (2026-06-03, post-merge)

The admin-dashboard-revamp surfaces are now wired through Norm (84 → **89** read endpoints), all
verified (type-check + build green, ultra multi-agent review with 0 defects, live signed smoke 200
on each): `analytics.hourly-revenue`, `klaviyo.analytics`, `facebook-ads.health.insights`,
`facebook-ads.health.settings` (GET), and `cancellation-flow-analytics.users-by-reason` (PII-safe
opaque-userId projection — email/lastName stripped). The new `tiktok` + All-Platforms
`attributedRevenue` is now exposed in the `dashboard.stats` projection. `analytics.hourly-revenue`
and `facebook-ads.health.insights` followed the P3 extract-then-wire pattern (`getHourlyRevenueByPlatform`,
`getFacebookAdsHealthInsights`). The mutating `facebook-ads.health.settings` PUT and
`facebook-ads.health.snooze` POST are roadmap `write_safe` registry entries only (no `responseSchema`,
not in the manifest), matching the reads-only posture.
