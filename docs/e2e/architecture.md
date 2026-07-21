# E2E — Architecture

## Directory map

```
e2e/
  run.ts                  orchestrator — the ONLY entry point (never invoke `playwright test` directly)
  lib/
    env.ts                resolveE2eEnv() — env overlay + assertE2eSafety() guard
    paths.ts               absolute paths for artifacts, auth storage states, proof output, logs
    processes.ts           launch()/killAll() — spawns + tracks child processes, logs to file
    health.ts              waitForHttpOk() — polls the app server until ready or the child dies
  seed/
    index.ts                wipeAndSeed() — re-runs the safety guard, drops the DB, seeds
    users.ts / draw.ts       seed data (member, admin, one active MajorDraw)
  setup/
    auth.setup.ts            Playwright "setup" project — logs in member + admin, saves storage state
  fixtures/
    test.ts                  extended test/expect — watchdog (auto), freshUser, demo, per-worker IP
    demo.ts                   makeDemo() — proof-mode step narration (no-op outside E2E_PROOF)
    ui-audit.ts               uiAudit(page) — overflow + broken-image UI-expert lens
  helpers/
    db.ts                     direct Mongo reads/writes for assertions (MEMBER/ADMIN consts here)
    payment.ts                 Stripe PaymentElement fill, purchase identities, DB outcome polls
    session.ts                 loginViaUi()
  specs/                       the actual *.spec.ts files, grouped by area (see adding-a-spec.md)
  proof/
    srt.ts                     Cue type, toSrt(), holdFor() pacing
    post.ts                    post-run: burns subtitles, synthesizes voice, bundles proof/
playwright.config.ts           projects, tags via testDir grouping, NO webServer (orchestrator owns boot)
```

## Orchestrator flow (`e2e/run.ts`)

`e2e/run.ts` is the single entry point for every `npm run e2e*` script — specs are never run via a
bare `npx playwright test`. Its `main()` does, in order:

1. **Env + guards** — `resolveE2eEnv()` (see below) throws immediately on an unsafe DB or a
   non-test Stripe key. This is the first thing that runs, before any process is spawned.
2. **Stripe webhook secret** — `stripe listen --print-secret` (30s timeout). If it fails (CLI
   missing/not logged in): `--env-only` and `@smoke`-only runs continue with a warning (no
   webhooks needed); any other run throws immediately.
3. **Fresh data** — `wipeAndSeed(env.mongoUri)` drops the e2e database and reseeds member, admin,
   one active MajorDraw. Every run starts from the same known state.
4. **Port pre-flight** — `assertPortFree(env.port)` refuses to boot on top of a stale/zombie
   server already listening on the target port (see gotchas.md).
5. **App server** — `E2E_BUILD=1` runs `npm run build` then `npm run start -- -p <port>`;
   otherwise `npm run dev -- -p <port>`. Either way the child is launched via `launch()`
   (`lib/processes.ts`, stdout/stderr piped to `e2e-artifacts/logs/server.log`) and captured so
   `waitForHttpOk` can detect an early exit, not just a timeout.
6. **Health wait** — `waitForHttpOk(`${baseUrl}/api/test-db`, ...)` polls every 1.5s; 120s budget
   for a prod build (already-built, `next start` is fast), 240s for `next dev` (Turbopack cold
   compile).
7. **Webhook forwarder** — `stripe listen --forward-to localhost:<port>/api/stripe/webhook`,
   launched the same way, logs to `stripe-listen.log`.
8. **Hold-open mode** (`--env-only`) — logs the base URL + seeded member email, then awaits a
   promise that never resolves (Ctrl+C / process kill tears it down via the signal handlers in
   `processes.ts`). This is the `npm run e2e:env` MCP/codegen authoring bridge — see how-to-run.md.
9. **Run the suite** — via `spawnAsync`, not `spawnSync` (see below). A bare full run (no
   `--grep`/`--project`) splits into a parallel non-`@purchase` phase and sequenced-per-project
   `@purchase` legs; an explicit `--grep @purchase` run (no `--project`) uses the same sequenced
   legs directly; anything else is a single invocation. See "Per-project `@purchase` sequencing"
   and "The full-run split" below.
10. **Proof post-processing** (`--proof`) — `tsx e2e/proof/post.ts`, also via `spawnAsync`.
11. **Teardown** — `killAll()` (recorded PIDs; `taskkill /T /F` on win32, `SIGTERM` elsewhere),
    called from `main().then()`/`.catch()` AND from `process.on("exit"/"SIGINT"/"SIGTERM")` in
    `processes.ts`, so a natural exit, a thrown guard, or an external kill of the whole process
    tree all tear down the server + stripe-listen children. No orphaned processes were found
    across any of these paths in verification (Task 4).

## Env overlay + safety guard (`e2e/lib/env.ts`)

`resolveE2eEnv()` loads `.env.local`, then builds the env the app server is booted with:

- **`MONGODB_URI` → `E2E_MONGODB_URI`** — the app server never sees the real database URI during
  an e2e run.
- **`assertE2eSafety(mainUri, e2eUri)`** runs on every call to `resolveE2eEnv()` (not just once at
  startup — `wipeAndSeed` and `connectE2eDb` each call it again at their own point of use):
  - Throws `"E2E_MONGODB_URI is not set — refusing to run."` if unset.
  - Throws `"E2E_MONGODB_URI equals MONGODB_URI — refusing to run against the main database."`
    if the two URIs are identical.
  - Throws if the e2e database name doesn't contain `"e2e"` — the suite **wipes** that database
    every run, so a name check is the last line of defense against pointing it at anything real.
  - Also refuses a non-`sk_test_` `STRIPE_SECRET_KEY`.
- **Dedicated port** — `E2E_PORT` (default `3799`), never the normal dev port.
- **Origin remap** — `NEXTAUTH_URL` and `NEXT_PUBLIC_API_URL` are both repointed at the e2e
  origin. `NEXT_PUBLIC_API_URL` is `src/lib/queries.ts`'s client-side `apiGet`/`apiRequest` base;
  `.env.local` points it at the normal dev port for manual dev, so leaving it unmapped here means
  every client hook that calls it (`useWinnersQueries`, `useMajorDrawQueries`, etc.) fetches an
  unreachable port during e2e runs.
- **Third-party neutering** — server-side keys blanked (`KLAVIYO_ENABLED=false`,
  `SENDGRID_API_KEY`, `FACEBOOK_ACCESS_TOKEN`, `TIKTOK_ACCESS_TOKEN`) and client-side
  `NEXT_PUBLIC_*` ids/flags blanked (`NEXT_PUBLIC_FACEBOOK_PIXEL_ID`, `NEXT_PUBLIC_TIKTOK_PIXEL_ID`,
  `NEXT_PUBLIC_KLAVIYO_COMPANY_ID`, `NEXT_PUBLIC_ENABLE_PIXEL_TESTING`, `NEXT_PUBLIC_GTM_ID`,
  `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_ENABLE_GTM_TESTING`, `NEXT_PUBLIC_HOTJAR_ID`). These matter
  even though `.env.local` sets several of the `_ENABLE_*_TESTING` flags `true` for manual local
  pixel/GTM testing — `src/app/layout.tsx` reads them to force-enable Klaviyo/ConversionPixels/GTM
  in dev, and without blanking them every spec's browser fires real third-party network calls.
  Full incident detail (each one caught live by the QA watchdog before being fixed here): see
  gotchas.md.
- **Deliberately NOT neutered**: `NEXT_PUBLIC_HCAPTCHA_SITEKEY` (functional dependency —
  registration flows may mount hCaptcha) and `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` (the hostname
  gate itself, already non-prod-restrictive).
- **Regression coverage**: `npm run test:e2e-env` (`e2e/lib/__tests__/env.test.ts`).

## Seeding (`e2e/seed/`)

`wipeAndSeed(mongoUri?)` (`e2e/seed/index.ts`) re-runs `assertE2eSafety` at the point of
destruction (defense-in-depth — the guard is checked again immediately before `dropDatabase()`
runs, not just once upstream in `resolveE2eEnv`), drops the e2e database, then seeds:

- **Member** (`e2e.member@e2e.local` by default, overridable via `E2E_TEST_USER_EMAIL`/
  `E2E_TEST_USER_PASSWORD`) — bcrypt cost-12 password, `userType: "customer"`, an active
  display-only Tradie subscription with a **fake** Stripe customer id
  (`cus_e2e_seeded_readonly`) — read-only specs must not open flows that retrieve this id from
  Stripe (see gotchas.md).
- **Admin** (`e2e.admin@e2e.local`) — `userType: "admin"`, not just `role: "admin"` (see the
  admin `userType` gotcha below).
- **One active `MajorDraw`** — `activationDate` yesterday, `freezeEntriesAt` +19 days,
  `drawDate` +20 days, empty `entries: []`.

CLI entry: `npx tsx e2e/seed/index.ts` (useful standalone, without booting the full orchestrator).

## Fixtures (`e2e/fixtures/test.ts`)

The extended `test`/`expect` every spec imports from `../../fixtures/test` (never the bare
`@playwright/test`):

- **`extraHTTPHeaders` (auto)** — gives each Playwright worker its own synthetic
  `x-forwarded-for` (`10.77.<workerIndex % 250>.<parallelIndex % 250 + 1>`) so the credentials
  sign-in rate limiter (5/min per IP, `src/app/api/auth/[...nextauth]/route.ts` via
  `src/utils/security/rateLimiter.ts`) buckets each worker independently instead of every worker
  colliding on the shared loopback IP. The limiter itself is untouched — this only fans it out.
- **`watchdog` (auto)** — the automatic expert eye on console + network. Blocks Klaviyo/GTM/GA/
  Hotjar/Contentsquare requests at the browser edge (context-scoped `route()`, fulfilled
  empty-but-successful), then fails the test if any `pageerror`, non-allowlisted `console.error`,
  or same-origin HTTP ≥500 response occurred during the test. `CONSOLE_ALLOWLIST` is a short,
  deliberately-extended-not-wildcarded regex list (React DevTools banner, Fast Refresh, "third-
  party cookie" warnings).
- **`freshUser`** — worker-safe factory for mutating specs: `e2e+w<workerIndex>-<runId>-<n>@e2e.local`,
  created directly via `createLoginableUser` (the register API creates passwordless users, so
  login-capable users are created straight in Mongo). Disconnects the e2e DB connection on
  fixture teardown.
- **`demo`** — proof-mode step narration; see proof-mode.md.

## Per-project `@purchase` sequencing

A mixed (all-project, no `--project` filter) `@purchase` run is **not reliable on this dev
environment at any worker count** — verified across multiple full attempts at default (~8)
workers, `--workers=3`, and `--workers=2`; all failed most of the 15 purchase tests regardless of
per-test timeout (raised as high as 400s). Every **isolated** single-project run
(chromium-desktop / mobile-chrome / mobile-safari alone) was 100% reliable, repeatedly, at
Playwright's default worker count. Two independent root causes, both fixed:

1. **`spawnAsync` instead of `spawnSync`** for the Playwright test run itself (see below) — a
   frozen event loop was starving the `server`/`stripe-listen` children's log pipes and
   ultimately stalling those children's own stdout writes.
2. **This environment's single `next dev` process + Mongo pool genuinely cannot sustain
   concurrent real-Stripe flows across 3 browser projects at once.** No amount of worker-count
   tuning fixed this alone.

`e2e/run.ts`'s `runSequencedPurchaseLegs(baseArgs, env)` helper runs three separate
`npx playwright test <baseArgs> --project <name>` invocations back-to-back against the **same**
already-booted server/seed (no re-wipe between legs — every purchase spec's email/phone is
already project-suffixed via `purchaseIdentity`, so there's no collision). Each leg's exit code
is collected; the overall run fails if any leg failed. No `--workers` cap is applied to the
sequential legs — isolated single-project runs were proven green at Playwright's default worker
count, so capping would only slow an already-reliable leg. Cost: ~3x wall time for a full
`@purchase` run — accepted, since a suite that actually passes is the point.

This helper is invoked from two call sites — an explicit `--grep @purchase` run (e.g.
`npm run e2e:purchase`) passes its own passthrough args straight through; the full-run split
below (which appends its own `--grep @purchase`) is the other. Passing `--project` explicitly on
the command line bypasses sequencing entirely (single invocation, unchanged) — a caller who
already scoped to one project doesn't need the multi-project protection.

## The full-run split (bare `npm run e2e` — no `--grep`, no `--project`)

A bare full run originally took the same plain single-invocation path as any other non-`@purchase`
`--grep` — `isPurchaseRun` only ever triggered on an **explicit** `--grep` containing `"@purchase"`,
and a bare run's `grep` is empty, so it never matched. That meant a real `npm run e2e` ran
`@purchase` specs **mixed-parallel across all 3 projects** — precisely the configuration proven
always-unreliable above. Found live during Task 13's success-criteria gate: the first true
full-suite runs against this branch showed the mixed load destabilizing `legal-copy`/`@a11y`
specs (real, evidenced findings — not something papered over; see gotchas.md and the Task 13
report) even in a run where the 15 purchase tests themselves happened to all pass (the
mixed-parallel purchase failure mode is load-dependent, not deterministic — passing once doesn't
mean it's safe).

Fixed by splitting a full run (`isFullRun = !hasExplicitGrep && !hasExplicitProject && !hasUi` —
`--ui`, i.e. `npm run e2e:ui`, is deliberately excluded: that's an interactive, human-driven
session, not an automated run, and splitting it would pop a second/third UI window for the
purchase legs the instant the first closes) into two sequential phases inside `main()`'s step 7:

1. **Phase A** — one `runPlaywrightOnce([...passthrough, "--grep-invert", "@purchase"], pwEnv)`
   call: every spec EXCEPT `@purchase`, all three projects together, Playwright's normal
   parallelism (unaffected by the purchase-specific concurrent-Stripe-load problem).
2. **Phase B** — `runSequencedPurchaseLegs([...passthrough, "--grep", "@purchase"], pwEnv)`: the
   same sequenced-per-project strategy described above, scoped to just the purchase specs.

Overall exit status is non-zero if **either** phase failed. Both phases log their own summary
line (`phase A ... finished -> exit N`, `phase B ... finished -> exit N`) in addition to the
existing per-leg lines inside phase B. Trade-off accepted: a full run now re-executes the `setup`
project's member+admin login up to 4 times (once for phase A, once per phase-B leg — Playwright
always runs a project's declared `dependencies` before it, independent of `--grep` filtering,
unless `--no-deps` is passed) instead of once — a few extra tens of seconds against a run that
already takes minutes, in exchange for a full run that's actually reliable.

## `spawnAsync` rationale

`e2e/run.ts` defines a local `spawnAsync()` wrapper (`spawn()` + a `Promise` resolved on the
child's `"exit"`/`"error"` event) and uses it for **both** the Playwright test run and the proof
post-processing step — never `spawnSync` for these. Reason: `spawnSync` blocks Node's entire
event loop for its full duration, and the `server`/`stripe-listen` children (launched via async
`spawn()` + `.pipe()` to a log file in `lib/processes.ts`) need that same event loop to shuttle
their stdout into their log files. With the loop frozen for the 10-25+ minutes a full test run
can take, those pipes stop draining; once a child's OS-level stdout buffer fills (a few tens of
KB on Windows named pipes), that child's own writes to stdout start blocking too — stalling the
dev server and webhook forwarder themselves, not just the orchestrator's ability to observe them.
Verified live: a full purchase run under the old `spawnSync` code showed `stripe-listen.log`
receiving **zero bytes** for the run's entire ~24-minute duration, while tests scheduled later in
the run degraded progressively worse regardless of `--workers` — the signature of a blocked
producer, not a concurrency ceiling. `getStripeListenSecret()` (a fast, <1s call before any other
child is running) is the one remaining `spawnSync` call in `run.ts` — safe because nothing else
is alive yet to starve.

## Projects & tags

`playwright.config.ts` defines four projects: `setup` (runs `e2e/setup/auth.setup.ts`, produces
the member/admin storage states every other project depends on), `chromium-desktop`,
`mobile-chrome` (Pixel 7), `mobile-safari` (iPhone 14). There is **no `webServer` entry** — the
orchestrator owns server boot entirely; running `npx playwright test` directly (bypassing
`e2e/run.ts`) will fail with connection errors.

Tags are plain substrings in each `test.describe`/`test` title, matched via Playwright's
`--grep`: `@smoke` (fast, non-mutating), `@demo` (proof-mode narrated), `@purchase` (real Stripe
money-path), `@a11y` (axe + uiAudit baseline), `@visual` (screenshot baselines), `@admin`
(admin-boundary specs). See adding-a-spec.md for the convention when adding a new spec.
