---
description: Regenerate the stack-tailored /panel-review skill for this repo from the canonical template. Run when the stack or conventions change — not to run a review.
---

Generate a **stack-tailored project panel-review skill** for the current repo, derived from the canonical template. Output: `.claude/commands/panel-review.md` in this project, with the repo's concrete base branch, test commands, UI-capture approach, and house conventions baked in — so `/panel-review` runs here without re-detecting the stack every time.

Run this **once per project**, or whenever the stack/conventions change (new base-branch flow, new test runner, new CI gates, reworked CLAUDE.md rules). It is the "make the panel-review skill for this project" generator.

> **Do NOT run a review here.** This skill only generates the project skill. To actually review, run `/panel-review`.

## 1. Read the source of truth

- Read the canonical template at **`.claude/commands/global-panel-review.md`** (the 5-reviewer panel → consolidate → senior-dev plan → tracked-doc flow).
  - *Note:* this repo has no global (`~/.claude/commands/`) copy, so the canonical template is vendored into the project at the path above. If you ever add a global copy, prefer it and keep the two in sync.
- The project copy must keep that **structure, the stable finding IDs, and the status-marker doc** (`docs/tech-debt/panel-review-<branch>.md` with `- [ ] / - [x] / Overridden` + `_Handled:_` markers) intact. You are tailoring it, not redesigning it.
  - **IDs are `F-NNN`** — matches the canonical template already, and matches this repo's own tracked-doc convention (a doc about **PR #711** containing `PR-039` would read as a pull request and confuse readers, so keep `F` = Finding; do not introduce `PR-NNN`).

## 2. Detect this project's stack & conventions

Probe the repo and record concrete facts:

- **Base branch:** `git symbolic-ref refs/remotes/origin/HEAD` (fall back to `main`/`master`/`develop`, or a project doc that names the flow, e.g. a `feature → stage → main` convention). **Trust the documented flow over `origin/HEAD` when they disagree** — see the facts table below for a case where they don't disagree (this repo). Record the exact diff command, and whether work is typically **uncommitted** (so the review must include working-tree + untracked files).
- **Languages & layout:** manifests (`package.json`, `*.csproj`/`*.sln`, `pyproject.toml`/`requirements*`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`/`build.gradle`), monorepo subdirs, and where backend vs UI vs tests live.
- **Test runner(s):** the exact command(s) to run the suites. Note any service/port a suite needs and how it's started. **Also determine what database each suite writes to** — a suite that hits a shared/dev DB must NOT be auto-run by the review; record it as "review on paper only" with the reason.
- **UI render/preview:** is there a UI? How is it previewed/screenshotted (Playwright/Cypress/Puppeteer + dev-server port, Storybook, a built preview)? Are there existing test fixtures/mocks/seed data to reuse? Note the fixed dev port and the "use a free port + revert config" fallback if relevant. If there's no UI, say so and **drop Reviewer B** (or mark it N/A).
- **House conventions:** read `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING*`, `README*`, `.editorconfig`, lint/format configs, and any architecture/style notes. Extract the concrete rules the code must obey (layering, naming, "no raw SQL", shared component library, status-enum rules, accessibility/mobile rules, zero-warnings, DDL/migration policy, etc.).
- **Schema/migration policy:** if the repo has DB migrations/DDL, note where they live and the rule for changes.
- **Doc-gate compatibility:** if the repo has CI checks or hooks that walk `docs/**`, confirm the tracked review doc at `docs/tech-debt/` won't trip them, and bake any needed constraint (e.g. citation style) into the tailored skill.

If anything is ambiguous (e.g. multiple plausible base branches or test commands), **ask the user** rather than guessing.

### ToolsAustralia facts (verified 2026-07-22)

Verified in-repo; re-verify rather than assume if the flow changes:

| Fact | Value | Source |
| --- | --- | --- |
| Base branch | **`origin/main`** — `origin/HEAD` and the documented flow agree here (unlike some repos where they diverge) | `git symbolic-ref refs/remotes/origin/HEAD` → `refs/remotes/origin/main`; confirmed against merge history (PRs #704–#711 all merge straight to `main`; `staging` exists for occasional batches, not the normal path) |
| Diff command (PR mode) | `git diff origin/main...HEAD` | matches `origin/HEAD` — no override needed |
| Diff command (working-tree mode) | `git diff origin/main` (no `...`, includes uncommitted) + `git status --porcelain` for untracked | same recipe as the canonical template's Mode A |
| Commit policy | Panel **never** commits. `CLAUDE.md` hard rule #1 — commits/pushes/PRs need an explicit user keyword (`commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`) typed in the session; a `PreToolUse` hook (`.claude/hooks/no-auto-commit.mjs`) enforces it | `CLAUDE.md` §1 |
| Static gate | `npm run type-check` (`tsc --noEmit`) + `npm run lint` (`eslint`) — SAFE, no DB access | `package.json` |
| Lint baseline | **6 pre-existing errors, 31 warnings** as of 2026-07-22, all in files unrelated to any one feature branch: `e2e/fixtures/test.ts` ×3 (`react-hooks/rules-of-hooks` — false-positive on a `use()` helper that isn't a component/hook), `scripts/codemod-dark-text.js` ×2 (`no-require-imports`), `scripts/migrate-klaviyo-draw-properties.ts` ×1 (`no-explicit-any`) | verified `npm run lint` 2026-07-22 — **compare new lint output against this baseline; only report NEW errors/warnings introduced by the diff, never re-report the inherited baseline as a finding** |
| Targeted tests | ~100 standalone `tsx` regression scripts wired as `test:*` npm scripts (no jest/vitest runner exists). Grep `package.json` for `test:*` entries whose target file path overlaps the changed `src/` domain and run those | `package.json` |
| E2E smoke | `npm run e2e:smoke` (`--grep @smoke`) — **SAFE to auto-run**: isolated `E2E_MONGODB_URI` (db name must contain `"e2e"`, wiped every run, refused otherwise by `assertE2eSafety()`) | `e2e/lib/env.ts`, `docs/e2e/how-to-run.md` |
| E2E purchase | `npm run e2e:purchase` (`--grep @purchase`) — real Stripe **TEST-MODE** money-path specs, sequenced per browser project — expensive (multiple real API round-trips × 3 projects). Only run when the diff touches a payment/subscription path | `docs/e2e/how-to-run.md`, `docs/e2e/architecture.md` |
| Never raw Playwright | Always invoke via `npx tsx e2e/run.ts` / the npm `e2e*` scripts — **never** `npx playwright test` directly. `playwright.config.ts` has no `webServer`; the orchestrator alone owns the env-overlay safety guard, wipe+seed, and port pre-flight. A bare `playwright test` skips all of it | `docs/e2e/README.md`, `playwright.config.ts` |
| UI evidence (Reviewer B) | `npm run e2e:env` boots a seeded, hold-open dev environment at `http://localhost:3799` (Ctrl+C tears it down). Seeded member: `e2e.member@e2e.local` / `E2e!Passw0rd` (fallbacks — real values may be overridden in `.env.local`); seeded admin: `e2e.admin@e2e.local`. Capture screenshots via the Playwright **Node API** against this held-open server — never `playwright test` for captures. Auth storage states land at `e2e-artifacts/.auth/{member,admin}.json` after a `setup`-project run. **Kill the process tree and verify the port is free again before finishing** | `docs/e2e/how-to-run.md` |
| Dev-mode cold compile | First hit on an uncompiled route is slow under Turbopack dev mode — the admin dashboard's first compile has been observed around ~24s. Don't mistake this for a hang; wait it out or hit the route once to warm it before timing anything | observed locally |
| Video evidence (ToolsAustralia-specific) | For changed customer flows covered by `@demo`-tagged specs, the panel MAY run `npm run e2e:proof -- --grep @demo --project chromium-desktop` and reference the resulting narrated mp4s (`e2e-artifacts/proof/<date>-<branch>/<test-slug>/`) in the review. Current `@demo` specs: `landing.spec.ts`, `my-account.spec.ts`, `purchase-subscription.spec.ts`. Since Artifacts can't embed multi-MB mp4s (self-contained HTML only), embed 2–3 key step-screenshot PNGs (`step-N-<slug>.png`, already produced alongside the mp4) and note the mp4 path on disk instead | `docs/e2e/proof-mode.md` |
| Acceptance (Reviewer F) | No ticket tracker in this repo — grade against the **GitHub PR description + linked issue** via `gh pr view <N> --json title,body,comments`. `gh` may or may not be installed on the machine running the panel — **check `gh auth status` first, not just presence**, and fall back to plain git + "acceptance graded from PR title/commits only" if it fails. No PR open and no issue referenced → drop Reviewer F, note "acceptance not graded — no ticket" | verified `gh` was not on `PATH` in this sandboxed session — never assume it's installed; always defensively check |
| House-rule registry | `CLAUDE.md`'s **Domain Manifest** (the JSON block at the bottom of the file) — this repo's equivalent of a module registry. Maps `src/`/`scripts/` path globs → `docs/<domain>/`. An `e2e` domain already exists (`e2e/**`, `playwright.config.ts` → `docs/e2e/`) | `CLAUDE.md` Domain Manifest |
| Tracked doc | `docs/tech-debt/panel-review-<branch>.md`, `F-NNN` ids. `docs/tech-debt/` does not exist yet at time of writing — the review command creates it. It sits outside the Domain Manifest (by design — the manifest maps `src/`/`scripts/` source to docs, not review artifacts), so writing/updating it never trips the `doc-sync` Stop hook | verified `docs/tech-debt/` absent 2026-07-22; `.claude/hooks/doc-sync.mjs` only checks `src/`/`scripts/` touches against the manifest + the `BUSINESS_TRIGGER_GLOBS`/`CUSTOMER_TRIGGER_GLOBS` lists, none of which include `.claude/commands/**` or `docs/tech-debt/**` |
| Artifact sharing | The Artifact tool has **no visibility parameter** — pages are private by default and can only be shared from the page's own share menu. Tell the user to flip it; do not claim a link is public | tool schema |

> **Keep machine-specific facts OUT of the generated file.** It is committed and shared — a teammate's machine has different drives, different tooling, and different locally-broken files. Write "check `gh auth status`", not "gh is not installed" (that's true on this machine, not necessarily on the next one). Write "a free port", not a hardcoded one already in use here. Per-machine quirks belong in memory, not the repo.

## 3. Write the tailored `.claude/commands/panel-review.md`

Start from the canonical template's flow and **replace the generic detection with this repo's concrete facts**:

- Scope step: the exact base ref + diff command(s) (incl. working-tree/untracked handling, since finished work here often stays uncommitted per `CLAUDE.md`'s commit policy), and the concrete code/UI/test locations.
- Reviewer A: generic SOLID/DRY/KISS/SoC/YAGNI **plus this repo's documented conventions** quoted concretely (so violations are caught by name) — strict layering, the Domain Manifest doc-sync rule, the §11 free-entry legal-copy rule, Norm lockstep, BUSINESS.md/CUSTOMER.md triggers, the performance-footgun list, the zero-trial-invoice webhook footgun.
- Reviewer B: this repo's actual screenshot/preview recipe (`e2e:env`, port `3799`, seeded credentials, Playwright Node API, storage states, teardown) — or removed if there's no UI in the diff.
- Reviewer C: unchanged (first-time-user clarity/terminology) — tuned to this repo's actual audiences (guests, members/tradies, admins/staff).
- Reviewer D: **kept** here (unlike some repos where the test suite can't be safely run) — the exact safe command(s) (`type-check`, `lint`, targeted `test:*` scripts, `e2e:smoke`), which suite is conditionally expensive and why (`e2e:purchase` — real Stripe test-mode), plus the change-coverage rubric.
- Reviewer E (Principal Architect — extensibility/boundaries, scalability & performance incl. N+1/locking/horizontal-scaling blockers, security & compliance, blast radius): tailored to Next.js 15 App Router + MongoDB/Mongoose (connection pooling in `src/lib/mongodb.ts`, serverless pool sizing), Stripe (webhook idempotency via `ProcessedStripeEvent`/`StripeWebhookQueue`, the zero-trial-invoice footgun), Vercel serverless (stateless functions, `vercel.json` cron schedules + `maxDuration`), and the rate-limiting model (`src/lib/rate-limiting/**`). Keep all four concern areas.
- **Reviewer F (Product/Acceptance)** — grades the diff against the GitHub PR description + linked issue, not against code quality. Per-AC (or per-description-bullet, if there's no formal checklist) verdict MET/PARTIAL/MISSING/UNVERIFIABLE with `file:line`; reverse-direction scope check; ship verdict. **Must be empowered to challenge the ticket/PR description itself** — a misdiagnosed requirement yields ACs that cannot all hold, and that's a P0 finding. No PR open and nothing to grade → drop Reviewer F, say so.
- **The finding contract** — plain-English titles (symptom, not mechanism), 2–3 sentence "what happens", a **code reference + snippet on every finding**, a **screenshot on every visual finding**, one-line fix. This is what makes the output usable; don't dilute it.
- **The evidence-capture recipe** — the concrete render harness for this stack (the `e2e:env` hold-open bridge, Playwright Node API, measure via `getBoundingClientRect`/`getComputedStyle` rather than computing on paper). Carry over every gotcha from `docs/e2e/gotchas.md` relevant to authoring a one-off capture; they each cost real time to find once already.
- Keep the rest verbatim in intent: consolidate with `F-NNN` IDs → senior-dev plan with Now/Next/Later + auditable overrides → **publish an Artifact** (+ the private-by-default warning) → **write/update `docs/tech-debt/panel-review-<branch>.md`** preserving existing `Done`/`Overridden` markers.
- Add a one-line header note: *"Tailored for ToolsAustralia by /init-panel-review from the canonical template — regenerate when the stack/conventions change."*

If `.claude/commands/panel-review.md` already exists, show the user what will change and confirm before overwriting (it may contain hand-tuning worth keeping).

## 4. Wrap up

- Confirm the file was written and summarize what you baked in (base branch, test commands, UI recipe, key conventions).
- Note that `/panel-review` now runs the tailored review in this repo, and that `/global-panel-review` remains available as the generic fallback.
- Leave the generated file **uncommitted** in the working tree per `CLAUDE.md`'s commit policy — report it and let the user commit. Suggest committing `.claude/commands/panel-review.md` so the whole team gets the project review.
