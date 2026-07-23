# E2E — How to run

## Prerequisites

1. **Stripe CLI installed and logged in to TEST mode** — `stripe login`. The orchestrator calls
   `stripe listen --print-secret` before booting the server; if this fails, any run other than
   `--env-only`/`@smoke`-only throws immediately with an explanatory error. Purchase (`@purchase`)
   specs cannot run without webhook forwarding. Verify quickly:
   ```bash
   stripe listen --print-secret
   ```
   A `whsec_...` value confirms you're logged in. Stripe CLI API keys expire periodically — if
   this hangs or errors, run `stripe login` interactively (cannot be done non-interactively /
   by an agent).
2. **`E2E_MONGODB_URI` set in `.env.local`** — a **dedicated** MongoDB database whose name
   contains `"e2e"`, distinct from `MONGODB_URI`. The suite **wipes this database on every run**
   — `assertE2eSafety()` refuses to run if it's unset, equals `MONGODB_URI`, or its db name
   lacks `"e2e"` (see architecture.md). `E2E_PORT`, `E2E_TEST_USER_EMAIL`,
   `E2E_TEST_USER_PASSWORD` are optional per-folder overrides (fallbacks exist for all three).
   These are allowlisted in `scripts/check-env.mjs` as legitimately per-folder — not declared in
   `.env.example`. Run `npm run check:env` to confirm nothing declared is missing.
3. **`STRIPE_SECRET_KEY` in `.env.local` must be a `sk_test_...` key** — `resolveE2eEnv()`
   refuses to run against a live key.
4. **Port `3799` (or your `E2E_PORT`) must be free** — the orchestrator pre-flight-checks this
   and refuses to boot on top of a stale/zombie server (see gotchas.md).

## npm scripts

| Script | What it does |
|---|---|
| `npm run e2e` | Full suite, every project, every tag. Runs as two sequential phases (see architecture.md's "full-run split"): phase A is everything except `@purchase`, all projects, normal parallelism; phase B is `@purchase` only, auto-sequenced per browser project. Expect this to take significantly longer than a single-project run — purchase specs alone run 3x (once per project). |
| `npm run e2e:smoke` | `--grep @smoke` — fast, non-mutating specs only (marketing, auth, account/admin boundary, registration bridge, legal-copy guard). This is the tag to reach for during normal development iteration. |
| `npm run e2e:purchase` | `--grep @purchase` — the real-Stripe money-path suite (subscribe, one-time, decline, idempotency, webhook replay). Sequences per browser project automatically. Requires the Stripe CLI prerequisite above. |
| `npm run e2e:proof` | `--proof` — sets `E2E_PROOF=1`, switches the Playwright profile to `workers: 1, retries: 0, video: "on", slowMo: 200`, and runs `e2e/proof/post.ts` afterward to produce narrated `.mp4` bundles. Always pass `--grep @demo` (see proof-mode.md) — running proof mode over the whole suite is slow (1 worker) and most specs carry no narration. |
| `npm run e2e:env` | `--env-only` — boots the server + seed + webhook forwarder and **holds the process open** (does not run any tests) until you Ctrl+C or kill it. This is the MCP/codegen authoring bridge — see below. |
| `npm run e2e:ui` | Passes `--ui` through to `playwright test` — opens Playwright's interactive UI mode against the orchestrator-booted server (same env/seed/webhook guarantees as any other run). |
| `npm run e2e:report` | `playwright show-report e2e-artifacts/report` — opens the HTML report from the last run. |
| `npm run test:e2e-env` | Regression test for `resolveE2eEnv()`/`assertE2eSafety()` (`e2e/lib/__tests__/env.test.ts`) — no server boot, runs in under a second. |
| `npm run test:e2e-srt` | Regression test for the proof-mode `.srt` cue math (`e2e/proof/__tests__/srt.test.ts`). |

All of the above accept Playwright passthrough args after `--` (e.g.
`npm run e2e:smoke -- --project chromium-desktop`, `npm run e2e -- --grep "@a11y"`). Any argument
containing a space (e.g. `--grep "lens self-tests"`) needs the win32 quoting the orchestrator
already handles internally — see gotchas.md's win32 quoting note if you're calling
`e2e/run.ts` some other way (a raw `spawnSync`/CI wrapper) that doesn't go through it.

**Prod-build mode**: set `E2E_BUILD=1` before any of the above (most commonly combined with
`e2e:smoke`, since a full `npm run build` + `next start` cycle takes minutes). Runs `next build`
then `next start -- -p <port>` instead of `next dev`. Any failure that occurs ONLY in this mode
and not in normal dev mode is a real prod-only bug (CSP route class, `removeConsole` stripping a
`console.log` the app or a spec depends on, etc.) — see gotchas.md and troubleshooting.

**`npm run build` fixed (2026-07-21), `E2E_BUILD=1` still blocked**: a plain `npm run build` (or
`next build`) previously failed outright (a `<Html>` import error prerendering `/500`) —
root-caused to Turbopack bundling the `ai` package's transitive `@opentelemetry/api` dependency
into server chunks and mismatching Next's built-in error-page fallback. Fixed by adding
`"@opentelemetry/api"` to `serverExternalPackages` in `next.config.ts`; a plain `npm run build`
now completes cleanly (359/359 pages, verified repeatedly on a fully clean `.next`). **However**,
`E2E_BUILD=1` mode specifically remains blocked: the harness's env overlay (`e2e/lib/env.ts`)
remaps `NEXTAUTH_URL`/`NEXT_PUBLIC_API_URL` to `http://localhost:<E2E_PORT>`, and that remap alone
(verified in isolation, no other var involved) deterministically reproduces the **same failure
class** on a different route (`/404` instead of `/500`) — i.e. the underlying Turbopack
module-graph fragility around `@opentelemetry/api` isn't fully eliminated, just no longer
triggered by the *default* env's chunk-splitting order. This does not affect real production
deploys (Vercel's `NEXTAUTH_URL` is fixed to the canonical prod URL and never remapped mid-build),
but it does mean `E2E_BUILD=1` cannot currently complete a build. See gotchas.md's "`next build`"
entries for the full repro matrix.

```bash
# PowerShell
$env:E2E_BUILD="1"; npm run e2e:smoke; Remove-Item Env:E2E_BUILD

# bash
E2E_BUILD=1 npm run e2e:smoke
```

## The full-journey mode (`npm run e2e:journey`)

The flagship flow — the longest single journey the platform supports, under a
production-style promo, with TWO real Stripe test payments:

```bash
npm run e2e:journey         # run it as a test
npm run e2e:journey:proof   # render it as the narrated flagship demo video
```

Both expand to `tsx e2e/run.ts --promo 10 --grep "full customer journey" --project
chromium-desktop`. The `--promo <5|10>` flag sets `E2E_PROMO`, which makes wipe-and-seed
insert an active {n}× membership promo (`e2e/seed/promo.ts` — the exact doc the admin
promo-toggle route creates; the resolver reads it uncached, so it's live immediately).

The journey (`e2e/specs/membership/full-journey.spec.ts`): stranger on "/" → prize-showcase
→ ENTER NOW → register (guest bridge) → real payment → webhook grants 15×{promo} entries
exactly-once → the app's own payment-proofed auto-login + router.push to /my-account → the
post-purchase upsell offer opens with the PROMO-CORRECT artwork
(`membership/apprentice-{promo×10}x.webp`, asserted present AND actually loaded — the
broken-image guard born from finding #10) → ACCEPT one-click charges the saved card ($9.99)
→ upsell webhook grants 3×10×{promo} more entries exactly-once → the dashboard EntryWallet
displays the combined total (450 at 10×).

**Why a dedicated mode:** an active membership promo multiplies EVERY subscription grant
(webhook: base × promo), so a promo visible to a shared run breaks the sibling purchase
specs' exact-count assertions (toBe(15)) and invalidates the /membership + /my-account
visual baselines — and purchase legs run spec files in parallel within a leg, so a
spec-scoped insert/delete can leak mid-purchase. The journey spec therefore self-skips
unless `E2E_PROMO` is set (visible skip reason in every ordinary run), and journey mode
scopes itself to this one spec on one browser.

## Testing a deployed environment (staging)

Setting `E2E_TARGET_URL` flips the orchestrator into **EXTERNAL mode**: instead of wiping/
seeding the local `e2e` database and booting `next dev`/`next start`, it points Playwright's
`baseURL` straight at the deployed URL you give it. This is for read-only smoke coverage
against a real deployed environment — it is **not** a replacement for the local suite, and it
is deliberately narrow.

```bash
# bash
E2E_TARGET_URL=https://staging.toolsaustralia.com.au npm run e2e:smoke
```

```powershell
# PowerShell
$env:E2E_TARGET_URL="https://staging.toolsaustralia.com.au"; npm run e2e:smoke; Remove-Item Env:E2E_TARGET_URL
```

Any of the `npm run e2e*` scripts accept it the same way (e.g. `E2E_TARGET_URL=... npm run e2e
-- --grep "@a11y"`), with two hard exceptions below.

**What runs:** marketing/landing, mini-draws, membership modal render, legal-copy guard, and
`@a11y` (already desktop-scoped) — anything that only reads public pages.

**What skips, and why:**
- **`login`, `registration`, `my-account`, `admin-gate`, `visual`** — all `test.skip` themselves
  at the describe level with reason `"needs the seeded isolated environment"`. There is no
  local seed step in EXTERNAL mode, so there's no known member/admin account to sign in with,
  and the `setup` project (storage-state capture) skips itself too (`external target — no
  seeded credentials` in `e2e/setup/auth.setup.ts`) rather than failing — Playwright's
  `dependencies: ["setup"]` chain proceeds normally past a *skipped* (not failed) dependency.
  `visual`'s baselines were captured as PNGs against the local seeded environment, so even its
  non-auth captures (landing hero, membership tiers) would never pixel-match a deployed build's
  live content — skipped wholesale rather than half-skipped.
- **`@purchase` and `@admin`** — refused outright, not just skipped. `e2e/run.ts` ALWAYS
  appends a hard-coded `--grep-invert "@purchase|@admin"` in EXTERNAL mode (not overridable by
  any passthrough flag), and REFUSES to start at all if your own `--grep` explicitly asks for
  either tag. Mutating/privileged suites (real Stripe money paths, admin-gated pages) must
  never point at a shared or deployed environment. The `@purchase` spec files also each carry
  their own belt-and-suspenders `test.skip` for the case where someone bypasses `e2e/run.ts`
  and invokes `playwright test` directly.
- **No DB assertions anywhere** — EXTERNAL mode never opens `E2E_MONGODB_URI` and makes no
  Stripe calls (no `stripe listen` forwarder either), so any spec that reaches into Mongo/Stripe
  directly (helpers under `e2e/helpers/db.ts`, `e2e/helpers/payment.ts`) is out of scope by
  construction, not just by tag.
- **`--proof` and `--env-only` are refused with a clear error**, not silently ignored — narrated
  proof-mode runs and the MCP/codegen hold-open bridge both assume the seeded local environment
  (known creds to demo with, a local server to hold open); neither concept applies to a deployed
  target.

**Caveat:** staging's content is whatever's actually deployed there, not what's on your branch.
A `legal-copy` hit or an `@a11y` violation from a staging run is a genuine finding about the
**deployed build**, not your local changes — treat it accordingly (don't "fix" it by editing
this branch unless the same code path exists here too).

**Third-party CSP blocks are annotations, not failures.** A deployed build runs its real
tracking config, and some third-party beacons are CSP-blocked *by design* — `csp.ts:55-58`
documents the rotating `*.on.aws`/`*.run.app` Contentsquare-module collectors as deliberately
not allowlisted. So in EXTERNAL mode only, the QA watchdog downgrades console errors matching
`Content Security Policy` **whose blocked target is not our own origin** to per-test report
annotations (`external-csp-block` — open the HTML report to see exactly what was blocked).
Same-origin CSP violations still fail the test: our own script or asset being refused (e.g. a
nonce regression) is a real bug in the deployed build. First live staging run (2026-07-22)
surfaced one genuine gap this way: TikTok's SDK now beacons to `analytics-ipv6.tiktokw.us`
(TikTok's US-entity domain) but `connect-src` only allowlists the stale
`analytics-ipv6.tiktok.com` — recorded as an open product finding, owner's call whether to
update the CSP.

## The `e2e:env` MCP/codegen authoring bridge

`npm run e2e:env` boots the full stack (fresh seed, dev server, webhook forwarder) and holds it
open indefinitely instead of running Playwright at all. Use this when **authoring or refining a
spec** and you need to see the real, live DOM rather than guess a selector from source:

1. Run `npm run e2e:env` in a terminal (or background it). Wait for
   `[e2e] Environment held open at http://localhost:3799`.
2. Attach against `http://localhost:3799` with either:
   - **Playwright MCP** (if configured in your Claude Code / agent session) — navigate, inspect,
     and try selectors against the live, seeded app.
   - **`npx playwright codegen http://localhost:3799`** — records real interactions as Playwright
     code you can adapt into a spec.
3. The seeded member email is printed (`e2e.member@e2e.local` unless overridden); its password is
   whatever `E2E_TEST_USER_PASSWORD` resolves to (`E2e!Passw0rd` by default).
4. Ctrl+C (or kill the process) to tear everything down — the same signal-handler teardown path
   used by every other run mode (see architecture.md), so no orphaned server/stripe-listen
   processes are left behind.

This is how every "selector refinement" documented in adding-a-spec.md and the task reports was
actually verified — never by reading component source and guessing a label/role, but by looking
at the real rendered DOM through this bridge (or an `error-context.md`/trace snapshot from a
failed run).

## Reading results

- **HTML report**: `npm run e2e:report`, or open `e2e-artifacts/report/index.html` directly.
- **Logs**: `e2e-artifacts/logs/{server,stripe-listen}.log` — the dev/prod server's full stdout
  and the webhook forwarder's relay log (useful for confirming a webhook actually round-tripped;
  see the Stripe-resend gotcha in gotchas.md).
- **Traces/screenshots/videos**: `e2e-artifacts/test-results/<test>/` (Playwright's own
  `trace.zip` on first retry, `only-on-failure` screenshots, `retain-on-failure` video outside
  proof mode).
- **Proof bundles**: `e2e-artifacts/proof/<date>-<branch>/<test-slug>/` — see proof-mode.md.

All of `e2e-artifacts/` is gitignored.

### Full-run split — exclusions

The bare `npm run e2e` split (parallel non-purchase phase + sequenced purchase legs)
only engages when the caller passed no `--grep`, no `--grep-invert`, no explicit
`--project`, and is not in proof or UI mode. An explicit `--grep-invert` keeps the
caller's own filter authoritative (phase A must never append a conflicting invert);
bare proof/UI runs keep single-invocation behavior under their own profiles.
