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

**Currently blocked**: as of Task 13's gate, `E2E_BUILD=1` fails at the `next build` step itself
(a `<Html>` import error prerendering `/500`) — no test can run until this is fixed. See
gotchas.md's "`next build` currently fails" open finding.

```bash
# PowerShell
$env:E2E_BUILD="1"; npm run e2e:smoke; Remove-Item Env:E2E_BUILD

# bash
E2E_BUILD=1 npm run e2e:smoke
```

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
