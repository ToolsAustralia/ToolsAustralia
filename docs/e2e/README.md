# E2E domain — Playwright end-to-end testing harness

Real-browser, real-Stripe (test mode), real-webhook end-to-end coverage for the app, driven
entirely through a single orchestrator (`e2e/run.ts`) — never a bare `npx playwright test`.

## Index

- [architecture.md](./architecture.md) — orchestrator flow, env overlay + safety guard, seeding,
  fixtures, per-project `@purchase` sequencing, `spawnAsync` rationale, projects & tags.
- [how-to-run.md](./how-to-run.md) — every npm script, prerequisites (Stripe CLI, `E2E_MONGODB_URI`),
  prod-build (`E2E_BUILD=1`) mode, the `e2e:env` MCP/codegen authoring bridge, reading results.
- [adding-a-spec.md](./adding-a-spec.md) — fixtures import, tags, worker-safe identities
  (`freshUser`/`purchaseIdentity`), the selector-refinement rule, the legal-copy rule for
  captions/assertions, the a11y baseline signoff rule.
- [proof-mode.md](./proof-mode.md) — what `npm run e2e:proof` produces, the `demo.step()`
  narration/pacing model, the best-effort AI voice + its fallback, how to share a bundle.
- [gotchas.md](./gotchas.md) — troubleshooting quick-reference + every resolved gotcha's full
  story (admin `userType`, the API_URL/GTM/Klaviyo/Contentsquare leaks, rate-limit buckets, the
  hydration flake, the Stripe-CLI-resend-same-event-id fact, win32 arg quoting, port pre-flight).
- [a11y-baseline.md](./a11y-baseline.md) — the accessibility burn-down list (every currently-open
  product a11y bug the suite tracks, and where to fix it), plus other product-bug pointers found
  by the suite's lenses.

## What exists today

| Piece | File(s) | Purpose |
|---|---|---|
| Orchestrator | `e2e/run.ts` | Single entry point for every `npm run e2e*` script. Env/guard → Stripe secret → wipe+seed → port pre-flight → boot server (dev or prod build) → health wait → webhook forwarder → run suite → (proof) post-process → teardown. See architecture.md. |
| Playwright config | `playwright.config.ts` | Projects `setup` / `chromium-desktop` / `mobile-chrome` / `mobile-safari`; **no `webServer`** (the orchestrator owns server boot); proof-mode profile via `E2E_PROOF=1`. |
| Path constants | `e2e/lib/paths.ts` | Absolute paths for artifacts, auth storage states, proof output, logs (all under gitignored `e2e-artifacts/`). |
| Env overlay + safety guard | `e2e/lib/env.ts` (test: `npm run test:e2e-env`) | `resolveE2eEnv()` builds the env the app is booted with; `assertE2eSafety()` refuses to run when the e2e URI is unset, equals the main URI, or its db name lacks `e2e`, or the Stripe key isn't test-mode. See architecture.md. |
| Wipe-and-seed | `e2e/seed/` | `wipeAndSeed()` re-runs the safety guard, drops the e2e DB, seeds member + admin + one active MajorDraw. CLI: `npx tsx e2e/seed/index.ts`. |
| Fixtures | `e2e/fixtures/test.ts`, `demo.ts`, `ui-audit.ts` | Extended `test`/`expect`: auto QA `watchdog` (console/network/third-party blocking), per-worker rate-limit-safe IP, `freshUser` factory, `demo` proof-mode narration, `uiAudit` lens. |
| Marketing/membership `@smoke` specs | `e2e/specs/marketing/*.spec.ts`, `e2e/specs/membership/modal.spec.ts` | Landing hero + membership CTAs, `/mini-draws`, `/membership` tier display, and the CLAUDE.md §11 legal-copy guard (bans gambling/sold-entry vocabulary, asserts free-entry framing). |
| Landing countdown tiers (`@demo`) | `e2e/specs/marketing/landing-drawn-states.spec.ts` | Moves the active major draw's `drawDate` and reloads to prove every one of the 15 prize combinations (5 brands x 3 toolboxes) swaps to its own `drawn-tomorrow` / `drawn-tonight` hero still. The mobile test closes on the four Kincrome pages whose first export described the wrong prize, re-walking them to show the 2026-07-27 corrected copy. **Two tests, one per viewport** — a mobile test pinned to `mobile-chrome` and a desktop test pinned to `chromium-desktop`, because Playwright cannot rescale a video canvas mid-recording (see proof-mode.md rule 4); join the clips with `npm run e2e:proof:join`. **Serial** — it mutates the shared seeded draw and restores it in `afterAll`. |
| Auth/account/admin `@smoke` specs | `e2e/specs/auth/*.spec.ts`, `e2e/specs/account/*.spec.ts`, `e2e/specs/admin/*.spec.ts` | Login, the registration guest-bridge (no auto-login), `/my-account` gate, `/admin` gate + member-blocked boundary. |
| Purchase (money-path) `@purchase` specs | `e2e/helpers/payment.ts`; `e2e/specs/membership/{purchase-subscription,purchase-one-time,purchase-decline,purchase-idempotency,webhook-replay,purchase-via-showcase}.spec.ts` | Real Stripe TEST-MODE payments through the real UI + real webhook delivery, DB-level exactly-once assertions. |
| Flagship full-journey (`npm run e2e:journey`) | `e2e/specs/membership/full-journey.spec.ts`, `e2e/seed/promo.ts`, run.ts `--promo` | The longest single flow, under a seeded production-style 10× promo: showcase entry → register → pay (150 entries exactly-once) → auto-login → upsell accepted one-click with the promo-correct artwork asserted loaded (300 entries exactly-once) → dashboard EntryWallet shows 450. Self-skips outside journey mode — see how-to-run.md. |
| Quality lenses | `e2e/specs/quality/{a11y,visual,lenses-selftest}.spec.ts` | axe + `uiAudit` a11y burn-down baseline, visual regression baselines, and self-tests proving the watchdog/axe lenses actually bite. |
| Proof mode | `e2e/fixtures/demo.ts`, `e2e/proof/{srt,post}.ts` | Paced, captioned, best-effort-voiced mp4s of `@demo`-tagged specs for non-technical stakeholders. |

## Project-lead workflow (the playbook)

How the pieces compose across day-to-day work, worktrees, PRs and releases. Command detail
lives in [how-to-run.md](./how-to-run.md); this is the *when-to-use-what* layer.

| Situation | What runs |
|---|---|
| Mid-feature quick check | A Claude session runs the grep'd slice (`npx tsx e2e/run.ts --grep "<feature>" --project chromium-desktop`) and returns verified screenshots/video |
| Finishing a feature | `npm run e2e:smoke` (~12 min); anything money-touching also gets `npm run e2e:purchase` |
| Reviewing a PR | `/panel-review <PR#>` (Claude command) → six-reviewer report with screenshots, videos, F-numbered findings + suggested fixes; `/panel-fix` applies approved ones |
| PR touches payments | Check out the PR branch (worktree) and run the purchase suite locally — full webhook loop + DB-level exactly-once assertions against *their* code |
| PR's deployed behavior | `E2E_TARGET_URL=<vercel-preview-url> npm run e2e:smoke` (read-only EXTERNAL mode; purchase/admin hard-blocked) |
| After a staging deploy | Same EXTERNAL command against staging — catches the CSP/prod-build class of bug local dev can't show |
| Before merging to main | Full `npm run e2e` (~40 min, phased) + the `E2E_BUILD=1` prod-build gate |
| Client/stakeholder evidence | `npm run e2e:proof` → panel-judged narrated mp4s (see proof-mode.md) |

**Worktrees:** the harness runs identically in any worktree (repo convention:
`.worktrees/<branch>`, created with `wt-new.sh`). Run **one e2e run at a time** — worktrees
share the `e2e` database by default. For two simultaneous runs, give the second worktree its
own `E2E_PORT` + `E2E_MONGODB_URI` (both deliberately per-folder allowlisted in `check-env`).

**Claude vs terminal:** the suite and proof videos are plain npm/Playwright — any developer
or CI runs them with no Claude involved. The judgment layers (panel reviews, video rating,
findings write-ups) run in a Claude session via the `.claude/commands/` suite
(`panel-review`, `panel-fix`, `video-review`).

**Purchase tests never run against deployed URLs** (preview or staging): Stripe's webhooks
only reach registered endpoints, the harness can't safely assert against a shared database,
and cross-environment webhook pollution is worse than no coverage. Deployed targets get the
read-only suites; the money path is covered by the local run on the same branch. If deployed
purchase coverage ever becomes a real need, the shape is a dedicated fixed-URL e2e
environment with its own DB + permanently-registered webhook endpoint — not preview URLs.

**Co-developer rhythm:** contributor self-checks with `e2e:smoke` before pushing (no Claude
needed) → lead runs `/panel-review <PR#>` for the evidence package → payments-touching PRs
get the local purchase run → merge after the full suite. Natural future addition at that
point: a GitHub Action running the non-purchase suite on every PR.

## Env vars (per-folder, allowlisted in `check-env` — NOT declared in `.env.example`)

- `E2E_MONGODB_URI` — dedicated e2e database; name must contain `e2e`; **wiped every run**.
- `E2E_PORT` — port the orchestrator boots the app on (default `3799`).
- `E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` — seeded member credentials (fallbacks exist).
- `E2E_BUILD=1` — prod-build mode (`next build` + `next start` instead of `next dev`).
- `E2E_PROOF` / `E2E_RUN_ID` / `E2E_PORT` — set internally by the orchestrator; not meant to be
  hand-set except `E2E_PORT`.

Full detail (including which `.env.local` client-side tracking vars get blanked and why) is in
architecture.md's env-overlay section and gotchas.md's leak write-ups.

## Current state: `npm run e2e` is green

As of Task 13's final verification, a fresh, fully unscoped `npm run e2e` run passes end to end
(exit 0) — the full-run split (architecture.md), its `isFullRun` hardening, and the a11y scoping
decision below are all in place together. See the Task 13 report's Part C for the verbatim run.
The two gaps below remain genuinely open (documented, not silently worked around) but neither
currently blocks a normal `npm run e2e`.

## Known, currently-open gaps (tracked here, not silently worked around)

- **The a11y baseline (`KNOWN_VIOLATIONS` in `e2e/specs/quality/a11y.spec.ts`) has only ever been
  verified against `chromium-desktop`.** Task 13's success-criteria gate ran `@a11y` across all
  three browser projects for the first time and found real, unbaselined axe violations on
  `mobile-chrome`/`mobile-safari`, **confirmed deterministic across two independent full-suite
  runs** — a structural coverage gap, not a flake. Some are the *same* underlying bugs rendering
  with different responsive-utility-class selectors at mobile breakpoints; at least one
  (`scrollable-region-focusable` on `/membership`) appears to be a genuinely different, mobile-only
  node. `@a11y` is now **scoped to `chromium-desktop`** (`test.skip()` on the other two projects,
  commit `cb5e6403`) so a full run no longer fails on this gap — the mobile violations remain
  fully documented in a11y-baseline.md's "Known baseline gap" section and the Task 13 report as a
  deferred, signed-off-scope-narrowing decision, not a silent suppression; they're candidates for
  a future mobile a11y baseline expansion, still requiring triage/signoff before landing in
  `KNOWN_VIOLATIONS` per the burn-down rule.
- **The `/membership` hydration-mismatch race is PARTIALLY fixed.** The dominant class
  (Carousel3D's `useReducedMotion` SSR/CSR divergence) was fixed at source with a two-pass
  render (see gotchas.md). A rarer `useId`-based `stageId` variant remains open — instrumented
  (the watchdog's 2000-char hydration capture names the mismatching element) but not yet
  root-caused; it intermittently trips the watchdog and has self-healed on retry in recent runs.
- **`next build` (`E2E_BUILD=1` prod-build gate): FIXED.** The `/500` prerender failure was a
  transitive `@opentelemetry/api`/Turbopack bundling issue, resolved by adding
  `@opentelemetry/api` to `serverExternalPackages` in `next.config.ts` — the prod-build gate
  now passes. One harness-side quirk remains open: building with a `localhost`-port
  `NEXTAUTH_URL` still reproduces the old error class, so `E2E_BUILD=1` builds with the
  original prod-style URL and remaps only at `next start` (see gotchas.md "resolved gotchas"
  for the empirical matrix).

Spec-maintenance note (2026-07-22): the visual spec's payment-methods/referral route stubs
were removed — the underlying unconditional fetches were fixed at source (lazy-mounted
modals). `my-account.spec.ts`'s regression guard pins the **chunk download**, not the network
request, for "closed sheet/modal never fires its query": `usePaymentMethodPrefetch` (wired
through `src/hooks/usePrefetching.ts`) legitimately prefetches payment methods on several
route-intent/idle paths independent of ManageSheet ever opening, so a network-timing assertion
raced that prefetcher. A component that hasn't mounted can't have its own JS chunk requested,
so asserting no `ManageSheet`/`ReferFriendModal` chunk URL appears before first open is the
timing-independent version of the same guarantee. `/api/stripe/payment-methods` itself is
exercised unstubbed once ManageSheet opens (see billing-stripe/gotchas.md for the dangling-
`stripeCustomerId` → 200-empty hardening that makes that safe against the seeded member).
