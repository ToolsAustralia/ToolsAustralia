# Infrastructure — Gotchas

## env vars: `.env.example` is the registry — `npm run check:env` detects drift (2026-07-09)

`.env.example` is the tracked source of truth for **which** env vars exist (rescued from the `.env*` ignore by the `!.env.example` negation in `.gitignore`). `.env.local` holds per-folder **values** (gitignored, never merges — see CLAUDE.md §9); Vercel holds prod. There is **no runtime env validation** — `src/lib/environment.ts` only detects `NODE_ENV` (despite `.env.example`'s old header implying it validates).

Detect discrepancies with **`npm run check:env`** (current folder; exits 1 if a declared var is unset) / **`npm run check:env:all`** (main + every git worktree) — `scripts/check-env.mjs`, read-only, prints **names only** (no secret leakage). It diffs each folder's `.env.local` against `.env.example`: **MISSING** = declared in example but not set here; **EXTRA** = set locally but not registered in example. Per-folder vars (`PORT` from `wt-new.sh`, `E2E_*` test creds) are allowlisted. A quiet `--warn` is wired into `predev`, so drift surfaces on every `npm run dev`.

- **E2E_MONGODB_URI + E2E_PORT are allowlisted as per-folder vars** (like the other `E2E_*` test credentials) — `check-env.mjs` will not report them as EXTRA or MISSING when set locally.
- **`E2E_TARGET_URL` is allowlisted too, but for a different reason** — it's per-invocation, not per-folder (`E2E_TARGET_URL=https://staging.toolsaustralia.com.au npm run e2e:smoke`), so it never belongs in a persisted `.env.local` at all. Setting it flips `e2e/run.ts` into EXTERNAL mode — see `docs/e2e/how-to-run.md`'s "Testing a deployed environment (staging)" section.

**Known gap (2026-07-09):** `.env.example` is currently **incomplete** (~25 of ~93 real vars) and **inconsistent across branches** (main 25, staging 11, origin/main effectively empty). Completing it to a full canonical registry (safe placeholders, no secret values) is the real fix; the drift-detection tooling above is the ongoing guard.

## `CHAT_KILL_SWITCH` is now the *override* for the admin pause toggle (2026-07-08)

`CHAT_KILL_SWITCH` (`.env.example`) is no longer the only way to disable Cobber. It is now the **break-glass override**: `true` still disables Cobber instantly (now also **hides the bubble site-wide**, not just the generative path), and it **wins over and locks** the DB-backed admin "Cobber availability" toggle (Admin → Team → Chatbot). For normal pausing prefer the admin toggle (no deploy); use the env var when the panel is unreachable. Effective state = `env || DB` (`getChatKillSwitchEffective`). It is **not** a `src/config/featureFlags.ts` flag — it stays env-level so it works without a DB read.

## Next dev indicator position is `top-left` (dev-only) (2026-06-26)

`next.config.ts` sets `devIndicators: { position: "top-left" }` so Next's dev build/route indicator (the "N" pill) doesn't overlap the bottom floating widgets (the Cobber support bubble — bottom-left on promotions, bottom-right elsewhere — plus the promotions theme toggle + account FAB). Next only supports the **4 corners** (`bottom-left`/`bottom-right`/`top-left`/`top-right`) — there is **no mid-height option**, and its drag-to-move snaps to the nearest corner too. Set `devIndicators: false` to hide it. It is **never rendered in production**.
## `seed-past-due-member.ts` — write final state ATOMICALLY, not via a stale `.save()` (2026-07-03)

The QA seed (`npm run seed:past-due-member`) creates the member (`__v: 0`), then spends ~30–50s on Stripe **test-clock** work before writing the final `past_due` state. If `stripe listen` is forwarding the seed's own Stripe events to a **running app**, a webhook (first-invoice `payment_succeeded`) re-saves that same user doc and **bumps `__v`** in that window. A subsequent `user.save()` on the *stale* in-memory doc then throws Mongoose **`VersionError: No matching document found … version 0`**, so the past-due write never lands and the member is stranded in the intermediate **active** state (which is why the admin showed "Active").

Fix (Step 11): write the final state with an **atomic `User.updateOne({ _id }, { $set: … })`** (no optimistic-concurrency `__v` check), then **verify + re-assert** it in a bounded loop (~10s) so a concurrently-processing webhook can't win. If the app's **webhook queue** processes the active event *after* the loop, the script warns to re-run with `stripe listen` **stopped** — the seed writes the DB directly and doesn't need the app's webhooks (restart the listener only for recovery-channel testing). **General rule:** any script that mutates a doc across a long async gap (external API calls, `sleep`, test-clock advances) must write with `updateOne`/`findByIdAndUpdate`, never a `.save()` on a doc loaded before the gap.

## `AFFILIATE_JWT_SECRET` — optional, but setting it forces a one-time affiliate re-login (2026-06-19)

New optional env var (documented in `.env.example`). It is the dedicated signing secret for the affiliate portal's `affiliate_token`, separating it from the member/NextAuth key space (`NEXTAUTH_SECRET`).

- **Unset:** affiliate auth falls back to `NEXTAUTH_SECRET`, so the app works without it (no key separation yet).
- **Set it (recommended for prod):** affiliate tokens are signed/verified with a key distinct from members. Because existing `affiliate_token`s were signed with the old key (and carry no audience), **setting or rotating this invalidates all current affiliate sessions — affiliates log in once more.** This is the accepted, intended migration cost. Generate with `openssl rand -hex 32`; set on every deploy target (Vercel Production + Preview).
- Full runbook: [docs/auth/SECRET_ROTATION.md](../auth/SECRET_ROTATION.md).

## Outbound third-party `fetch` must go through `lib/http/outbound.ts` (undici keep-alive race)

**Incident (June 2026):** Klaviyo (`a.klaviyo.com`) and Meta CAPI (`graph.facebook.com`) calls failed in prod with a flood of opaque `TypeError: fetch failed` (and some 30s timeouts), across many endpoints, while Stripe and MongoDB on the same deployment kept working. Root cause: Node's **global `fetch` (undici)** pools HTTP/1.1 keep-alive sockets. On Vercel the function is **frozen between invocations**; a remote closes an idle socket during the freeze, and on thaw undici writes the next request onto the dead socket → `error.cause.code = UND_ERR_SOCKET` ("other side closed") / `ECONNRESET`. Stripe/Mongo are immune because they use their own keep-alive agents / pooled drivers with dead-socket detection — only raw `fetch` was exposed. `keepAliveMaxTimeout` defaults to **600s** in undici, so a socket can be reused long after the freeze.

**The fix** lives in [`src/lib/http/outbound.ts`](../../src/lib/http/outbound.ts) (defense in depth):
- `outboundAgent` — an undici `Agent` with `keepAliveTimeout: 4s`, `keepAliveMaxTimeout: 10s`, `connect.timeout: 10s`. Shrinks the socket-reuse window. Installed `undici` as a direct dep, pinned to match Node's bundled major (Node 22 → undici 6.x).
- `outboundFetch(url, init)` — **global** `fetch` routed through `outboundAgent` via the per-request `dispatcher` option (NOT `setGlobalDispatcher` — scoped so latency-sensitive internal fetches keep undici's defaults and this change can't regress them). Uses global `fetch` on purpose so the result is a global `Response` and `instanceof Response` checks keep working.
- `resilientFetch(url, init, opts)` — `outboundFetch` + per-attempt `AbortController` timeout + bounded retry (network/socket errors, aborts, 429/5xx; never 4xx). A fresh socket on retry almost always succeeds. Tuning alone can't fully close the freeze race ([nodejs/node#47130](https://github.com/nodejs/node/issues/47130)) — the retry is the load-bearing half.
- `describeFetchError(error)` — surfaces `error.cause.code`/`message` (undici hides the real reason). **Always log this** for outbound failures, or the next incident is again an opaque "fetch failed". `UND_ERR_SOCKET`/`ECONNRESET` → keep-alive race; `EAI_AGAIN` → DNS; `UND_ERR_CONNECT_TIMEOUT` → connect stall.

**Rule:** new server-side calls to a third-party HTTP API SHOULD use `outboundFetch` (or `resilientFetch`), never bare global `fetch`. The Klaviyo client (which has its own retry loop) uses `outboundFetch` + `describeFetchError`; the Meta CAPI senders use `resilientFetch`.

## Pin the Node version — a silent Vercel default bump is git-invisible

`package.json` now declares `"engines": { "node": "22.x" }`. Before this, no `engines`/`.nvmrc`/`.node-version` existed, so Vercel chose the Node default; a silent platform Node bump is the one onset vector for transport regressions (like the undici incident above) that leaves **no trace in git**. Keep this pinned and bump it deliberately.

## Read-only audit: Basil downgrade `current_period_end` corruption

`npx tsx scripts/audit-downgrade-period-end.ts [--prod]` ([script](../../scripts/audit-downgrade-period-end.ts)) is a **read-only** audit (no writes) of `subscription.previousSubscription.endDate` corruption caused by the Stripe Basil `current_period_end` bug (see [billing-stripe/gotchas.md](../billing-stripe/gotchas.md)). It classifies each downgrade record as `FALLBACK_SIGNATURE` (~30-day shape), `HARMFUL_EXPIRED` (endDate before downgradeDate → benefits wrongly expired), or `ACTIVE`, and writes a CSV to `temp/readonly/`. Connects via `connectOpsDb` (`--prod` → `PROD_MONGODB_URI` + `Production` db). First prod run (June 2026): 21/21 downgrades corrupted, 10 users materially under-served — the past windows can't be un-expired by rewriting a date, so remediation is a business decision (goodwill), not a data patch.

## Summarizing the ErrorReport store from the CLI

`npm run find:error-reports [-- --days=N --top=N --samples=N]` (`scripts/find-error-reports-summary.ts`) prints a read-only, severity-ranked summary of the in-app `ErrorReport` collection (the durable 90-day error log behind the admin dashboard) — counts by severity / category / status / API endpoint / route, a per-day trend, and the most recent samples. Pass `-- --contains="<substr>"` to switch to **drill-down mode**: full detail (browser / OS / HTTP status / page / stack-head) for every report whose `errorMessage` matches — useful for root-causing one specific error. Read-only (aggregations + `.find().lean()`), safe against prod; connects via the shared `connectDB` (`src/lib/mongodb.ts`) per the no-ad-hoc-connections rule. Caveat: the store **auto-logs expected payment events** (card declines, existing-subscription 409s) — now at `medium`, not `critical` — so a high `medium` count is mostly normal churn, not bugs. Read the samples, not just the severity counts.

## Cloudinary signing with wrong params

Signing must include all params being sent (or use unsigned with strict allowlist). Mismatched params → upload fails with a 401 from Cloudinary.

## Vercel Cron triggers GET — a POST-only cron silently never runs

**Vercel Cron invokes a cron path with a `GET` request.** A route whose real work lives only in `POST` (with `GET` as a health-check stub) is therefore **never executed by the scheduler** — it looks wired up in `vercel.json` but does nothing on schedule.

**Incident (June 2026):** `/api/cron/process-partner-discount-queues` had its sweep in `POST` and a no-op health-check `GET`. The daily job never ran, so partner-discount queues only advanced when a member opened the rewards page (`GET /api/partner-discount/queue`) — which let a finished one-time window sit unswept for weeks and mis-queue later purchases (see [partner/gotchas.md](../partner/gotchas.md)). Fixed by moving the processing into `GET` (auth'd via `isAuthorized` / `CRON_SECRET`) with `POST` kept as a manual alias — mirroring the working `reconcile-affiliate-commissions` cron.

**Rule:** the cron's real work goes in the **`GET`** handler. The canonical, correct pattern is the GET-only crons (`process-stripe-webhook-queue`, `major-draw-transition`, `reconcile-affiliate-commissions`, …). ⚠️ Still POST-only as of this writing and likely affected the same way: `milestone-rewards-issuance` and `monthly-redeemables-issuance` — audit before relying on their schedules.

## Cron auth bypass

If you forget the shared-secret check, anyone can hit `/api/cron/foo` and trigger jobs.

**Incident (July 2026):** `/api/cron/sync-meta-spend-by-url` shipped **without** a `CRON_SECRET` check while its sibling `sync-meta-ads` was gated — so any unauthenticated caller could trigger its heavy paginated Meta Marketing API download + Mongo bulk write. Fixed by adding the standard `Authorization: Bearer ${CRON_SECRET}` gate (`src/app/api/cron/sync-meta-spend-by-url/route.ts`). Copy an existing gated cron's auth block whenever you add a `/api/cron/*` route — middleware does not run for `/api/**`, so the route handler is the only gate.

## Date timezone drift

`Date.now()` returns UTC. `new Date()` in Node returns server local. In Sydney prod, both happen to align with AEST, but DEV machines (especially internationally) won't. Always go through `date-fns-tz` for business logic.

## Webhook payload double-parsing

Some webhook providers send raw body; Next.js's bodyParser may have already consumed it. The webhook helpers in `src/utils/webhook/` handle this — read raw via `req.text()` before any other body access.

## Env var typo

`lib/environment.ts` validation catches missing env vars but typo in the key name = silent fallback to undefined. Verify env keys match what your validators expect.

## Migration drift between dev/prod

Running migration scripts in dev but not prod (or vice versa) leaves state diverged. Track migration runs in a known place.

## Migrated from `src/docs/ENVIRONMENT_SETUP.md`

> _TODO: read root file and merge._

## Turbopack incremental builds can serve STALE route compilations (2026-07-20)

Observed during the perf-tier1 verification: after several successive local `npm run build`s, a route handler's compiled chunk did not reflect its current source (an edited Cache-Control header was absent from the served response and from the compiled chunks; the pre-edit string was absent too). A cold build (`rm -rf .next` first) compiled and served the source correctly. Vercel builds are always cold, so production is unaffected — but when locally verifying a code change's runtime behavior via `next start`, wipe `.next` first if the result contradicts the source. Trust cold builds only.

## `npm run e2e:journey` / `e2e:journey:proof` (package.json, 2026-07-22)

Two dedicated scripts for the flagship full-journey e2e flow: `tsx e2e/run.ts --promo 10
--grep "full customer journey" --project chromium-desktop` (plus the `--proof` variant for
the narrated video). The `--promo <5|10>` orchestrator flag sets `E2E_PROMO`, which makes
wipe-and-seed insert an active {n}× membership promo (`e2e/seed/promo.ts`) — the journey
spec self-skips unless it's set, and no other run mode ever seeds a promo (an active promo
multiplies every subscription grant and would break the sibling purchase specs' exact-count
assertions). Full mechanics: `docs/e2e/how-to-run.md` "The full-journey mode".
