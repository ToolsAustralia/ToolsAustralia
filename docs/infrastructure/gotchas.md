# Infrastructure — Gotchas

## `membership-daily-snapshot`'s second daily fire silently overwrote the first — and the reschedule that fixed it needed a second pass (2026-08-24)

`/api/cron/membership-daily-snapshot` is scheduled **twice a day** (see [architecture.md](./architecture.md#vercel-cron-schedules)) so a missed/failed first run still gets a snapshot — but both fires resolve to the SAME `(date, packageId)` key (the "yesterday in `Australia/Sydney`" computation is deterministic per calendar day, not per invocation). The upsert was an unconditional `$set`, so the second fire always won regardless of which run had the more trustworthy numbers.

**The census is NOT point-in-time — this is the load-bearing fact, and an earlier version of this doc got it wrong.** `getMembershipByPackageLiveForSnapshot` (`MembershipAnalyticsService`) has **zero date filtering** — it's four `User.aggregate` calls over CURRENT subscription state, re-run fresh on every cron fire. The `date` field it gets stamped with is only a LABEL (`now − 24h`, formatted in Sydney), not a query boundary. So there is no run that is absolutely "pre-burst" — every fire, first or second, captures "membership state right now" and labels it "yesterday". The only variable is HOW MANY HOURS past the Sydney day boundary (14:00 UTC AEST / 13:00 UTC AEDT) the cron happened to fire: more hours = more of the next day's renewal/churn activity has already landed in a census still labelled with the previous day. The write-once guard's real job is to keep whichever run is CLOSER to the boundary — not to distinguish a "clean" run from a "dirty" one in any absolute sense.

**Fix (guard):** `upsertMembershipSnapshotRow` (exported from [`route.ts`](../../src/app/api/cron/membership-daily-snapshot/route.ts)) now checks for an existing NON-DEGENERATE row at that `(date, packageId)` key before writing; if one exists, the write is skipped (`written: false`) and the second fire becomes a no-op fallback rather than a blind overwrite. **Escape hatch:** a row is "degenerate" when every count is zero — the signature of an aggregate that silently returned nothing (never throws on an empty result). A degenerate existing row is treated as absent, so a bad first write (crash mid-aggregate, empty result) can still be corrected by the second fire instead of a silent zero being locked in forever — nothing else writes this collection, and `getMembershipSnapshotHealth` (see below) only checks that a row EXISTS, not that its counts look sane. The two DB round trips are not atomic, but the two cron fires are scheduled hours apart (never concurrent) and the model's unique `{date, packageId}` index is a hard backstop against a genuine race. Regression test: `npm run test:membership-snapshot-write-once` ([`membership-daily-snapshot.test.ts`](../../src/app/api/cron/__tests__/membership-daily-snapshot.test.ts)) — includes a standalone reproduction of the OLD unconditional-`$set` pattern that asserts the overwrite actually happens (not just that the new function is absent), the real guard's first-write-wins/second-is-no-op behavior, and the degenerate-row self-heal path.

**Fix (missing `maxDuration`):** `vercel.json`'s `functions` block had NO entry for this route, so it silently fell through the `src/app/api/**/route.ts` catch-all's **10s** cap instead of the 300s every other cron gets. Combined with the write-once guard, a timeout mid-loop was a genuine NEW failure mode: run 1 writes package 1 then times out; run 2 sees package 1's row already exists (guard fires) and only writes packages 2-3 — one day ends up with three package rows from two different census moments. Fixed with an **in-file** `export const maxDuration = 300;` in `route.ts` rather than a `vercel.json` entry, specifically to avoid the shadowing trap below.

**`dashboard-stats-daily-snapshot` does NOT need the write-once guard** even though it also fires twice into the same day — its writer (`writeSlidingWindow` → `mergeAdChannels`) already does a field-level merge that prefers a successful fetch over the stored value and only preserves the old value when a provider errors (see [gotchas.md](../metrics-analytics/gotchas.md)), so a later re-run corrects a stale day and can never blank a good one. The two crons' "second fire" have opposite intents: `dashboard-stats-daily-snapshot` wants the second fire to WIN (self-healing); `membership-daily-snapshot` wants the EARLIER fire to win (closer to the day boundary). Don't copy one cron's redundancy pattern onto the other without checking which direction is correct.

**The reschedule needed two attempts.** Both snapshot crons, plus `major-draw-transition` and `process-partner-discount-queues` (also still sitting at the top of the surge hour with no other owner), moved off `0 14`/`0 15 * * *` on 2026-08-24 — those two UTC hours carried 2,235 and 3,551 Stripe webhook events respectively on the 24 Aug renewal night (payment events trail invoice events by ~1h because Stripe finalizes subscription drafts after creating them), so several 300s-budget crons competing with that DB load in the same minute was its own incident.

The FIRST attempt moved the two snapshot crons to `0 18`/`0 19 * * *` — quiet-looking, since no OTHER cron in `vercel.json` is scheduled at those exact hours. That reasoning missed something: `sync-meta-ads` and `sync-tiktok-ads` are fired hourly at the Vercel level (`0 * * * *`) but do REAL work only when gated in-handler against the Sydney wall clock, at local slots `{3,6,9,12,15,18,21}:00` (DST-correct via `date-fns-tz`, since Vercel cron itself is UTC-only and DST-blind). Which UTC hour each Sydney slot lands on depends on the DST regime:

```
AEST (UTC+10): Sydney slot hours map to UTC 02, 05, 08, 11, 17, 20, 23
AEDT (UTC+11): Sydney slot hours map to UTC 01, 04, 07, 10, 16, 19, 22
```

`19:00 UTC` is not a slot hour in AEST — but it IS the Sydney-06:00 slot in AEDT. From the next DST changeover (~4 Oct) onward, the `0 19` fire would have landed exactly on a real `sync-meta-ads`/`sync-tiktok-ads` run — and `dashboard-stats-daily-snapshot` reads the `TikTokAdInsightsDaily`/ad-destination tables those syncs are actively writing, so this wasn't just a load collision, it was the exact ordering hazard the `20 3 * * *` corrector fire already exists to fix (see `sync-tiktok-ads`'s own docblock: "IF YOU MOVE `sync-tiktok-ads`, MOVE THIS TOO"). Nobody had considered moving the SNAPSHOT onto the SYNC's slot.

**The actual fix:** `30 17 * * *` / `30 20 * * *` UTC (17:30 / 20:30) for both snapshot crons — a `:30` minute offset. The Sydney-slot gate above only fires real work at `localMinute === 0` (or local 23:59); it can NEVER match a `:30` UTC time, in either DST regime, regardless of which Sydney hour that time happens to land on. This is structurally robust rather than hour-picked-by-inspection: verify it holds by checking `localMinute===0` for the candidate time in both `+10` and `+11`, not by eyeballing whether the UTC hour "looks free" in today's `vercel.json`. `major-draw-transition` and `process-partner-discount-queues` got their own quiet, non-`:00`, non-slot times: `15 18` and `45 18` UTC.

**Expected side effect — a daily "missing snapshot" window, not a fault.** `getMembershipSnapshotHealth` treats "yesterday" as expected from the moment Sydney rolls past midnight (14:00 UTC AEST / 13:00 UTC AEDT). Before this reschedule that gap was near-zero (the cron fired essentially at the boundary); now there is a real ~3.5–4.5 hour window each day, EVERY day (not just renewal nights), between the Sydney day boundary and the first snapshot fire (17:30 UTC), during which `/api/admin/health/membership-snapshot` and its Norm mirror correctly report `ok:false` for yesterday, `getMembershipByPackageSnapshot` falls back to live data with `snapshotMissing:true`, and the admin MRR trend card omits its trend rather than compare against a live baseline. This is expected and does not indicate a broken cron — see `docs/subscription/architecture.md`'s Health section and the `getMembershipSnapshotHealth` JSDoc.

## The same reschedule made `dashboard-stats-daily-snapshot` serve a HALF-FINISHED day for 3.5h every night (2026-08-25)

**Symptom:** at 00:34 AEST on 25 Aug the Overview's "24 Aug – 24 Aug" view showed revenue **$25,079.95** against an actual closed-day total of **$30,782.43** — 18.5% short — while New signups (431) and Renewals (868) on the *same screen* were correct. Tiles disagreeing with each other is the tell: some read the snapshot, some are live.

**Root cause — a latent bug the reschedule exposed, not the reschedule itself.** `writeSlidingWindow` enumerated `todayAESTDateKey` **inclusively**, so every run also wrote a row for the day still in progress. The `20 3 * * *` fire runs at 13:20 AEST, so it froze ~13 of 24 hours under the `2026-08-24` key (verified: revenue up to that instant was $24,979.95 and `users.newSignups` was 216 against the day's true 431).

That partial had always been written — it just never *mattered*, because `DashboardStatsSnapshotReader` bypasses the snapshot for the current day only (`if (snap && !isToday)`) and the old `0 14`/`0 15 UTC` fires landed at **00:00/01:00 AEST — the instant the day closed**. The complete-day rewrite therefore arrived at almost exactly the moment the reader flipped from live→snapshot. Moving the fires to `30 17`/`30 20 UTC` (03:30/06:30 AEST) opened a **3.5-hour hole**: the day closes at 14:00 UTC, the reader starts trusting the snapshot immediately, and the correcting write does not land until 17:30 UTC.

**Fix:** the window is now the last `windowDays` **COMPLETE** AEST days, ending at yesterday (`resolveSlidingWindowKeys`), and `writeSnapshotForDate` **refuses** any day that has not closed. Note `getDashboardStatsSnapshotHealth` had *always* excluded today from its expected keys — the writer was the half that disagreed. Regression test: `npm run test:dashboard-stats-window`.

**Consequence to expect:** between 14:00 UTC and the 17:30 UTC fire the just-closed day has **no** snapshot and the reader computes it live — correct, just slower — exactly like the membership-snapshot window documented above. Do not "fix" that gap by widening the window back to include today.

**The general rule:** a daily snapshot row is a claim about a WHOLE day. Never write one for a day that has not closed — if a reader anywhere treats "has a row" as "is authoritative", a mid-day write becomes a lie the moment the clock rolls over. Historical days were unaffected (the 90-day sliding window re-derives them); only the freshest day was ever wrong — the same shape as the TikTok-settling bug in [admin/gotchas.md](../admin/gotchas.md).

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

## `npm run e2e:proof:join` (package.json, 2026-07-24)

`tsx e2e/proof/join.ts <out-name> <clipA.mp4> <clipB.mp4> …` — joins several finished proof
clips into one deliverable (video + narration + subtitles). It exists because Playwright fixes
a context's video canvas at context creation and never rescales it, so one test that calls
`setViewportSize` mid-recording composites into a small top-left strip: a spec that must prove
BOTH a phone and a desktop viewport has to be **two tests, one per project**, which yields one
clip each. This joins them back. Unlike the sibling `e2e:*` scripts it does **not** go through
`e2e/run.ts` — it is a post-processing step over files already on disk, so it takes raw paths
rather than orchestrator flags and never touches the DB or a browser. Its only binary
dependency is the already-installed `ffmpeg-static` (no system ffmpeg, no ffprobe — durations
are parsed from `ffmpeg -i` stderr). Full mechanics: `docs/e2e/proof-mode.md` rule 4.

## Vercel crons are UTC — Sydney DST needs handling in the HANDLER

Vercel cron `schedule` has no timezone option; it is always UTC. Sydney runs UTC+10 (AEST) and
UTC+11 (AEDT), so any fixed UTC hour drifts by an hour twice a year. Several existing jobs work
around this with **duplicate entries** (e.g. `0 14` + `0 15`), which relies on the job being
idempotent — fine for a snapshot, **dangerous for anything that moves money**.

`/api/cron/charge-past-due` takes the safer approach: fire often across a window
(`*/5 * * * *`) and let the handler resolve the true local hour via
`formatInTimeZone(now, "Australia/Sydney", "H")`. One entry, no DST maintenance, and the handler
owns the decision. Prefer this for any new time-sensitive cron.

---

## `find:stranded-mini-draw-payments` — why it scans Stripe first, and why it has no denominator (2026-08-20)

`scripts/find-stranded-mini-draw-payments.ts` (read-only) answers: was a mini-draw payment ever captured that could never be granted? See [billing-stripe/gotchas.md](../billing-stripe/gotchas.md) for the defect.

**It starts from Stripe, not Mongo, and that is the point.** The failure mode *is* "the webhook recorded nothing" — no `PaymentEvent{BenefitsGranted}`, no `users.miniDrawPackages` row. Mongo cannot see a purchase it never wrote. So the scan reads Stripe (which definitely holds the charge) and cross-checks **into** Mongo to prove the absence. A Mongo-first audit for this class of bug finds nothing and reports "clean" — a false all-clear.

**It deliberately breaks the up-front-total convention.** CLAUDE.md requires ops scripts to print a denominator. Stripe's list API has no count endpoint, and the only way to learn the total is to page the whole window — doing the job twice. It reports `processed · rate/sec · elapsed` on the same adaptive cadence instead, and prints the date window up front so the run stays bounded. If you add a Stripe-paging script, reuse this justification rather than inventing a fake total.

**Exit codes:** `0` clean · `1` stranded payments found · `2` the script itself failed. CSV to **stdout**, progress and summary to **stderr**, so `> findings.csv` yields a clean file.

It never refunds. `miniDrawId` is unrecoverable for a stranded row (the metadata never held it), so the intended draw cannot be inferred — remediation is a human decision, and the script says so in its exit message.


## `backfill:missing-renewal-grants` — the five guards a prod-writing ops script needs (2026-08-23)

`scripts/backfill-missing-renewal-grants.ts` credits renewals that were charged but granted nothing (defect: [billing-stripe/gotchas.md](../billing-stripe/gotchas.md); detection rationale: [draws/gotchas.md](../draws/gotchas.md)).

```bash
npm run backfill:missing-renewal-grants:dry           # local/dev DB, report only
npm run backfill:missing-renewal-grants:prod:dry      # PRODUCTION, report only
npm run backfill:missing-renewal-grants:prod -- --expect=11   # PRODUCTION, WRITES
```

Each guard below exists because its absence was a live footgun, not for symmetry. Reuse the set when writing the next prod-writing script.

**1. `--dry-run` beats `--apply`.** The `:prod` npm entry already contains `--apply`, so `npm run …:prod -- --dry-run` — the exact thing muscle memory types — would otherwise perform a **live production write** while the operator believed they were dry-running. `--dry-run` now wins unconditionally and says so in a banner and in the summary. **If an npm entry bakes in a destructive flag, the safety flag must override it, not sit beside it.**

**2. Apply requires an explicit `--expect=N`** and refuses if the derived set is a different size. Baking `11` into `package.json` would rot the moment the incident closed; requiring the operator to restate the number they just reviewed does not.

**3. Lifecycle pre-flight.** The grant path (`grantBenefits` → `handleSubscriptionPackage`) unconditionally `$set`s `subscription.isActive: true` / `status: "active"` and `$unset`s `cancelledAt`. That is harmless when the webhook does it at charge time and **actively destructive days later** — it would erase a cancellation the member made after being charged, while Stripe still holds `cancel_at_period_end`. The script prints every target's lifecycle state and refuses to apply if any is cancelled/paused/inactive, unless `--allow-lifecycle-change`. **A backfill replays a code path outside the time window it was written for; re-read every unconditional write in that path with "…but days later" in mind.**

**4. The prod DB name is pinned** via `injectDbName()` from [`scripts/connect-ops-db.ts`](../../scripts/connect-ops-db.ts). The prod Atlas string may carry no `/<dbName>` path, and a bare connect then lands on an empty `test` DB. For a script whose whole job is counting *absences*, that reports **"0 gaps — all clear"** and looks like success. The banner prints `PRODUCTION · db="Production" @ <host>` — never the connection string.

**5. The CSV audit uses `appendFileSync`, not a `WriteStream`.** A stream's `write()` buffers; every `process.exit` path can drop the tail. `appendFileSync` puts the row on disk before the next row is touched. At ops-script row counts the cost is irrelevant and the guarantee is absolute.

**Exit codes:** `0` clean · `2` gaps found (dry-run) or per-row errors/skips/SIGINT-abort (apply) · `3` fatal or a guard refused · `1` unhandled.

**Why it also reads Stripe.** The Mongo join alone has a structural blind spot — `MembershipRenewalCycle` is written by the same handler that failed, after its first Stripe call, and only for `billing_reason=subscription_cycle`. A second pass lists paid Stripe invoices in the window and checks each against `PaymentEvent`, which is the only anchor that cannot lie by omission. Pass 2 is report-only; non-cycle invoices have different entry maths and are never auto-granted. Disable with `--no-stripe-check` (the script then says the count may understate the damage).
