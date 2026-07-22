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
| Auth/account/admin `@smoke` specs | `e2e/specs/auth/*.spec.ts`, `e2e/specs/account/*.spec.ts`, `e2e/specs/admin/*.spec.ts` | Login, the registration guest-bridge (no auto-login), `/my-account` gate, `/admin` gate + member-blocked boundary. |
| Purchase (money-path) `@purchase` specs | `e2e/helpers/payment.ts`; `e2e/specs/membership/{purchase-subscription,purchase-one-time,purchase-decline,purchase-idempotency,webhook-replay}.spec.ts` | Real Stripe TEST-MODE payments through the real UI + real webhook delivery, DB-level exactly-once assertions. |
| Quality lenses | `e2e/specs/quality/{a11y,visual,lenses-selftest}.spec.ts` | axe + `uiAudit` a11y burn-down baseline, visual regression baselines, and self-tests proving the watchdog/axe lenses actually bite. |
| Proof mode | `e2e/fixtures/demo.ts`, `e2e/proof/{srt,post}.ts` | Paced, captioned, best-effort-voiced mp4s of `@demo`-tagged specs for non-technical stakeholders. |

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
- **An intermittent `/membership` hydration-mismatch race** can strike any spec that visits the
  page (confirmed across specs — `legal-copy`, `a11y`, `visual`, `purchase-idempotency`,
  `webhook-replay` have all hit it at least once — not tied to one file or to concurrent purchase
  load; see gotchas.md). Across every full-suite run this session it struck 11 times; 9 self-healed
  on Playwright's built-in retry, but 2 (both from earlier runs, before the a11y-scoping decision
  and `isFullRun` hardening below existed) did not — both attempt and retry failed. Every
  occurrence in the most recent, fully-fixed run self-healed, but that's a small sample; the race
  itself is not resolved. Root cause not yet investigated; out of scope for a docs-only task.
- **`next build` itself currently fails** (`E2E_BUILD=1` mode, i.e. Task 13's prod-build gate),
  before any Playwright test can run: `Error: <Html> should not be imported outside of
  pages/_document` while statically prerendering the `/500` error page. No direct `next/document`
  import exists anywhere under `src/`, so this is a transitive issue (a dependency, or an
  App-Router/auto-generated-error-page interaction) — **this is a genuine, deterministic,
  prod-only regression**, not an e2e harness artifact (dev mode never triggers static prerendering
  of `/500`, so it's invisible outside `E2E_BUILD=1`/a real `next build`). See gotchas.md and the
  Task 13 report for the full verbatim error.

Both are genuine, currently-open findings — not something this doc set papers over. Fixing either
requires a `src/` change, out of scope for a docs-only task; they're flagged here and in the
Task 13 report for the controller/user to triage.

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
