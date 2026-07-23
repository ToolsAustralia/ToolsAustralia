# Playwright E2E Foundation — Design Spec

- **Date:** 2026-07-21
- **Branch:** `feature/playwright-e2e`
- **Status:** Approved design, pending implementation plan
- **Scope:** Sub-project 1 of 3. Sub-project 2 = Claude-session wiring (`writing-e2e-test`
  skill, `e2e-author` agent, `/ship` integration). Sub-project 3 = API-only smoke suite.
  CI is a later add-on. Nothing in this foundation requires rework to add those.

## 1. Goals

1. **Automate browser-level QA** — one command runs real user flows in real browsers
   against an isolated environment; any Claude session or human can run it.
2. **Catch deep-path bugs before production** — the purchase → webhook → entries-granted
   chain (where every documented production footgun in this repo lives) is covered
   end-to-end with database-level assertions, not just UI assertions.
3. **Produce client-demo-grade proof** — watchable, narrated recordings (subtitles +
   AI voice) and screenshots of features working, organized for sharing.

**Non-goals (v1):** session wiring, API-only tests, CI, Stripe test clocks / renewal-cycle
e2e (renewals stay covered by the existing unit suites).

## 2. Decisions log (agreed with DJ)

| Decision | Choice | Why |
|---|---|---|
| Target environment | **Dedicated e2e MongoDB** via `E2E_MONGODB_URI` | Wipe-and-seed freely; zero risk to dev/prod data |
| Purchase depth | **Full purchase path in v1**, tag-split from smoke | The bug history lives in the money path; surface-level smoke would miss all of it |
| Server harness | **Hybrid: dev server default, `E2E_BUILD=1` prod-build mode** | Dev speed keeps the suite in daily use; prod mode catches the CSP route-class bug family (docs/security-csp R8) that dev is structurally blind to |
| Proof artifacts | **Proof mode with narration layer** (captions + optional AI voice, human-watchable pacing) | Raw Playwright videos play at robot speed and demo poorly |
| Browsers | Chromium desktop + mobile-chrome + **mobile-safari (WebKit)** in v1 | Recent real bugs (fire animation, stuck banner) are the mobile/Safari-divergence class |
| Expert-level testing | **Encoded expert lenses** (§10): automatic QA watchdog, UI/a11y/backend/compliance/security audit batteries | "Team of experts" as real checks in the harness now; the literal expert *agent* team arrives in sub-project 2 and wields these lenses |

## 3. Architecture — five components

```
e2e/
  run.ts               orchestrator — the single entrypoint
  seed/                wipe-and-seed the e2e DB (fixtures: member, admin, packages, open draw)
  helpers/db.ts        direct Mongoose connection for DB-level assertions
  fixtures/            worker-scoped users, demo/narration fixture, auth states
  specs/<domain>/      auth/, membership/, draws/, admin/ … mirrors repo domain vocabulary
  proof/post.ts        proof-mode post-processor (mp4, subtitles, voice)
playwright.config.ts   projects, tags, retry/trace policy
```

1. **Orchestrator (`e2e/run.ts`)** — resolves the env overlay, runs safety guards,
   obtains the Stripe CLI webhook secret, boots the app server on `E2E_PORT`,
   health-checks it, launches `stripe listen` forwarding to it, hands off to
   `playwright test`, and owns teardown of every child process. Exists because
   Playwright's built-in `webServer` cannot sequence "get webhook secret → boot server
   with that secret".
2. **Seed module** — deterministic wipe-and-seed at run start. Reuses existing seeding
   knowledge (`scripts/seed-active-member.ts`, `scripts/migrate-seed-staff-roles.ts`)
   rather than inventing parallel fixtures.
3. **Auth setup project** — logs in through the real UI once per run per identity,
   saves `storageState` for member/admin. Guest specs use no state.
4. **DB assertion helper** — specs assert outcomes in the e2e DB ("exactly N entries
   granted"), not just pixels.
5. **Spec tree + fixtures** — worker-scoped user factory; `demo` narration fixture.

## 4. Environment & isolation (safety spine)

- New env vars, registered in `.env.example` (rule 9): `E2E_MONGODB_URI`, `E2E_PORT`.
  Existing: `E2E_TEST_USER_EMAIL`, `E2E_TEST_USER_PASSWORD`. All `E2E_*` are already
  allowlisted as per-folder in `scripts/check-env.mjs`.
- The orchestrator spawns the app with `MONGODB_URI=<E2E_MONGODB_URI>` and
  `STRIPE_WEBHOOK_SECRET=<stripe listen secret>`. The app is untouched and unaware it is
  under test (verified: `src/lib/mongodb.ts` reads `MONGODB_URI` from env at runtime;
  `src/app/api/stripe/webhook/route.ts` reads `STRIPE_WEBHOOK_SECRET`).
- Stripe keys pass through from `.env.local` (verified test-mode: `sk_test_`/`pk_test_`).
- **Hard guard, non-negotiable:** abort the run if `E2E_MONGODB_URI` is unset, equals
  `MONGODB_URI`, or its database name does not contain `e2e`. The suite wipes this DB
  every run; this guard is what makes that permanently safe.

## 5. Data lifecycle (parallel-safety)

- **Wipe-and-seed once at run start.** Green runs are reproducible; run twice in a row
  must both be green (idempotence is a success criterion).
- **Static identities** (seeded member, admin — 18+, NSW, draw-eligible) are used only
  by **read-only** specs.
- **Mutating specs** (register, purchase) create their own users through the app's real
  flows with worker-namespaced emails (`e2e+w<worker>-<runId>@…`) so parallel workers
  never contend and re-runs never collide.

## 6. Stripe & webhook orchestration

- Orchestrator runs `stripe listen --print-secret` (stable per CLI login) → boots server
  with that `STRIPE_WEBHOOK_SECRET` → runs
  `stripe listen --forward-to localhost:<E2E_PORT>/api/stripe/webhook`.
- One-time machine prerequisites: Stripe CLI installed + `stripe login` on the same
  test-mode account. Orchestrator fails with a clear actionable message if missing.

## 7. Playwright structure & conventions

- **Projects:** `setup` (auth states) → `chromium-desktop` (1280×720),
  `mobile-chrome` (Pixel emulation), `mobile-safari` (WebKit + iPhone viewport).
- **Tags:** `@smoke` (fast, no purchases), `@purchase` (money path), `@admin`,
  `@demo` (proof-worthy flows), `@a11y` (axe scans), `@visual` (screenshot baselines).
  Any slice runnable via `--grep`.
- **Flake discipline:** 1 retry in harness runs; trace + screenshot + video **only on
  retry/failure** in normal runs; HTML report; artifacts gitignored. A test that needs
  its retry twice in a row gets fixed or deleted — never quarantined indefinitely.

## 8. Dev vs prod-build modes

- **Default:** dev server (`next dev --turbopack`) on `E2E_PORT` — seconds to boot, what
  sessions run habitually.
- **`E2E_BUILD=1`:** orchestrator runs `next build` + `next start` and the same suite
  runs against the production build — nonce CSP, `removeConsole`, prod chunking all
  real. This is the pre-merge fidelity check. Same specs; only the boot command differs.

## 9. V1 coverage

**@smoke**
- Landing renders with membership CTAs (desktop + both mobile projects).
- Login → my-account loads with seeded member's data.
- Full registration: step-1 → `guestUserData` bridge → step-2, asserting the
  documented no-auto-login behavior (step-1 success leaves the user unauthenticated).
- Membership modal: tiers render with correct legal framing copy.
- Mini-draws page renders.
- Admin: admin login reaches `/admin`; non-admin is blocked.

**@purchase**
- Subscribe with `4242…` test card → webhook delivered → DB asserts: subscription
  active, **entries granted exactly once** (guards the zero-trial/double-grant class),
  my-account displays them.
- One-time pack purchase → entries granted once.
- Declined card (`4000 0000 0000 0002`) → graceful UI error, **zero** entries granted.
- Double-submit idempotency: rapid double-click on pay → exactly one subscription and
  one entry grant.
- Webhook replay: resend the same Stripe event → entry count unchanged.

**Legal-copy guard**
- Rendered landing / membership / mini-draws pages contain none of the §11 banned
  vocabulary ("odds", "chance of winning", "lottery", "raffle", "per entry", …) and do
  contain free-entry framing. Guards legal exposure at the rendered-output level where
  unit tests cannot.

## 10. Expert lenses — the encoded expert team

The suite behaves like a team of specialists because each discipline's checklist is
encoded as a reusable audit, applied automatically or by tag — real checks, not vibes:

- **QA watchdog (every spec, automatic).** An auto-fixture fails any test on: uncaught
  page errors, `console.error` output, or failed same-origin requests (4xx/5xx) during
  the flow. This is the senior QA instinct — eyes on the console and network tab, not
  just the happy pixels — applied to 100% of specs for free. Includes an allowlist
  mechanism for known-noisy third-party calls.
- **UI/UX expert (`uiAudit(page)` helper + `@visual` tag).** Battery: no horizontal
  overflow at the project viewport, no broken images, modal focus behavior (focus moves
  in, Escape closes, focus restores). Opt-in **visual regression** via Playwright's
  `toHaveScreenshot` on a curated set (landing, membership modal, my-account) with
  committed per-project baselines — the "something looks off" eye, made objective.
- **Accessibility expert (`@a11y` tag).** `@axe-core/playwright` (verified 4.12.1)
  scans key pages/states for WCAG violations; failures name the exact rule and node.
- **Backend expert (within `@purchase`).** DB-level outcome assertions (§9), plus the
  two probes a backend expert always runs: **double-submit idempotency** (double-click
  pay → exactly one subscription, one entry grant) and **webhook replay**
  (`stripe events resend` of the same event → no double grant — the e2e twin of the
  existing `test:webhook-queue-replay-safe` unit suite).
- **Compliance expert.** The legal-copy guard (§9) — banned-vocabulary scan over
  rendered marketing surfaces, per CLAUDE.md §11.
- **Security expert (baseline).** Auth-boundary specs (§9 admin gate) plus
  response-header spot-checks (CSP present and correct in `E2E_BUILD` mode, where the
  nonce CSP is real).

Deliberately deferred: performance budgets — dev-server timings are noise; a
Lighthouse/budget pass belongs in `E2E_BUILD` mode later (§15).

The **agent-team layer** — Claude fanning out discipline-expert subagents (UI expert,
backend expert, a11y expert, security expert) to author and review specs *using these
audits as their instruments* — is sub-project 2 (§15). The lenses here are what make
that team effective rather than performative.

## 11. Proof mode (client-demo evidence)

Normal runs stay fast with failure-only artifacts. `npm run e2e:proof` (optionally
`--grep @demo` or a feature slice) changes the profile:

- **Pacing — the core watchability fix.** Raw Playwright videos play at robot speed.
  Proof mode adds: (a) `slowMo` so actions (typing, clicking) happen at visible human
  speed; (b) **narrated step holds** — each `demo.step()` pauses on the frame while its
  caption/voice plays before the next action fires; when voice is enabled the hold
  duration derives from the actual TTS clip length so narration is never cut off;
  (c) a ~2s in-page title card at spec start (feature name, date).
- **Narration layer.** One primitive, `demo.step("Logging in as a member", fn)`:
  in proof mode it renders an in-page caption overlay (shadow DOM, `pointer-events:
  none`, cannot affect assertions), records `{title, startMs}` to a sidecar JSON, and
  takes a named screenshot. In normal runs it degrades to a plain `test.step` with zero
  overhead. **The step titles are the demo script** — write a spec with good titles and
  captions, subtitles, and voiceover all come free. This is what makes proof scale with
  every future spec instead of being hand-produced per demo.
- **Post-processor (`e2e/proof/post.ts`)**, built on `ffmpeg-static` (bundled binary, no
  system install; verified `5.3.0` on npm):
  1. Convert `.webm` → `.mp4` (H.264) so clients on any device can play it.
  2. Generate `.srt` from the sidecar and burn subtitles into the video.
  3. **AI voice (best-effort):** synthesize each step title via `msedge-tts` (free
     Microsoft neural voices; verified `2.0.7` on npm; use an `en-AU` voice, e.g.
     Natasha — confirm exact voice id at implementation) and mux the audio at the
     recorded offsets. `msedge-tts` rides an unofficial endpoint, so voice is a
     **bonus layer**: if synthesis fails, the run still emits subtitled video and logs a
     warning — never a hard failure.
- **Output:** `e2e-artifacts/proof/<date>-<branch>/` — per-flow mp4 + screenshots +
  `.srt`, plus Playwright's self-contained HTML report embedding everything. Zip and
  send; a non-technical client opens `index.html`.
- **Honest boundary:** recordings prove flows against the e2e environment (test data,
  Stripe test mode) — ideal for feature demos (no customer PII on screen), not a
  substitute for a staging walkthrough on production data.

## 12. DX & governance

- **Scripts:** `e2e` (full), `e2e:smoke`, `e2e:purchase`, `e2e:proof`, `e2e:ui`
  (headed/UI mode for debugging), `e2e:report`, and `e2e:env` — boots the full seeded
  environment (e2e DB, server, Stripe listener) and **holds it open without running
  tests**. This is the bridge to the recommended Claude↔Playwright authoring pattern:
  a Claude session attaches the Playwright MCP server (`@playwright/mcp`) to the held
  environment, explores flows against the live DOM with seeded data, then writes specs
  with real locators. Authoring stays interactive (MCP); execution stays deterministic
  (`playwright test`) — the two are never mixed.
- **Domain Manifest:** new `e2e` domain → `docs/e2e/` (harness architecture, how to add
  a spec, how to add a demo narration, troubleshooting). `package.json` /
  `.env.example` changes fall under the existing `infrastructure` domain.
  `playwright.config.ts` and `e2e/**` paths registered under the new domain.
- **No business/customer doc triggers:** no business fact changes in this sub-project.
- **New dependencies (dev):** `@playwright/test`, `ffmpeg-static`, `msedge-tts`,
  `@axe-core/playwright`. Machine prerequisite: Stripe CLI (logged in, test mode).

## 13. Success criteria

1. `npm run e2e` is green from a clean state (given Stripe CLI + `E2E_MONGODB_URI`).
2. Running it **twice in a row** is green — proves the data lifecycle/idempotence.
3. The safety guard demonstrably refuses a wrong/missing e2e DB URI.
4. `@purchase` specs assert entry counts in the DB, and the declined-card spec proves
   zero phantom grants.
5. `npm run e2e:proof` emits an mp4 with burned subtitles (and voice when available)
   that a human can watch and follow without speeding down.
6. `E2E_BUILD=1 npm run e2e:smoke` passes against a production build.
7. The QA watchdog demonstrably fails a spec on an injected `console.error` /
   same-origin 500, and an `@a11y` spec fails on a seeded WCAG violation (proves the
   expert lenses actually bite).

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wiping the wrong database | §4 hard guard (unset / equal-to-main / name-without-e2e all abort) |
| `stripe listen` flakiness or missing CLI | Orchestrator health-checks and fails fast with actionable message; webhook-dependent specs are the `@purchase` tier only |
| msedge-tts unofficial endpoint breaks | Voice is best-effort; subtitles are the guaranteed layer |
| Parallel workers colliding on data | Worker-namespaced users for all mutating specs; static identities read-only |
| Flake erosion of trust | Failure-only artifacts, 1-retry policy, fix-or-delete rule |
| Dev-mode blind spots (CSP/prod-only) | `E2E_BUILD=1` mode in v1, run pre-merge |
| Visual-baseline churn (fonts/rendering drift) | Curated `@visual` set only; baselines per project; update via explicit `--update-snapshots` decision, never blindly |

## 15. Future iterations (explicitly out of v1)

- Sub-project 2: `writing-e2e-test` skill, `e2e-author` agent, `/ship` runs `@smoke`
  when UI files are touched, proof-run attachment to task handoffs, and the
  **expert agent team**: discipline-expert subagents (UI, backend, a11y, security)
  fanned out to author/review specs using the §10 lenses as their instruments.
  Playwright MCP (`@playwright/mcp`) is registered as the session's authoring
  instrument, attached to `e2e:env` (§12) — Claude drives the live app to derive
  locators, never to execute the committed suite.
- Performance budgets / Lighthouse pass in `E2E_BUILD` mode.
- Sub-project 3: API-only smoke suite via Playwright request contexts.
- CI (GitHub Actions) running smoke + prod-build smoke on PRs.
- Stripe test clocks for renewal/anchor-day e2e.
- Auto-generated `docs/e2e/coverage.md` from spec annotations.
