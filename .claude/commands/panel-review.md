---
description: PR-time 6-reviewer panel — grades the code AND the GitHub PR's acceptance criteria, screenshots + video visual findings, publishes an Artifact. Explicit invocation only; never auto-runs.
---

> Tailored for **ToolsAustralia** by `/init-panel-review` from the canonical template (`.claude/commands/global-panel-review.md`) — regenerate when the stack/conventions change.

Six specialist reviewers critique the PR in parallel — five judge whether the code is *good*, one judges whether it does *what was asked*. You consolidate, wear a **senior developer** hat to turn it into a plan, and may override any finding with a spelled-out reason.

**Two deliverables:**

1. **A published Artifact** — the page the team reads. Every finding: plain-English title, code reference, and a screenshot (or step screenshots + an mp4 path) when it has a visual surface.
2. **`docs/tech-debt/panel-review-<branch>.md`** — stable `F-NNN` ids + checkboxes that survive re-runs and feed a tech-debt sprint.

## When this runs

**PR-time, invoked by hand. It is expensive** — six parallel subagents plus a browser pass.

- ✅ Run it when a candidate PR into `main` is open, or before opening one for a non-trivial branch — the human-judgment pass `type-check`/`lint`/`e2e:smoke` can't do.
- ❌ **Never auto-invoke.** Not wired to any hook, not part of `/ship`, and not one of the orchestrator-style thresholds in `CLAUDE.md`.
- ❌ Not per-change. Once per PR/branch. Quick bug-hunt → `/debug`. Substance review without screenshots/artifact/acceptance grading → `/review`. New Playwright specs → follow `docs/e2e/adding-a-spec.md`, not this command.

## 0. Resolve what you're reviewing

Two modes. **No argument = review my own work. A number = review that PR.** Both are normal; pick by what the user typed.

**Skipping the acceptance check.** If `$ARGUMENTS` contains **`no-ticket`**, **`code-only`**, or **`--no-ticket`**, skip the GitHub PR/issue lookup entirely: **drop Reviewer F**, run the other five, and set `acs: []`. State plainly in both deliverables: *"Acceptance not graded — run requested code-only."* Combines with either mode:

```
/panel-review no-ticket        # my branch, code only
/panel-review 711 no-ticket    # that PR, code only
```

Use it when the branch has no open PR yet and no linked issue, when the PR description is a chore/refactor with nothing to grade, or when you just want a code-health pass. It's also cheaper — five reviewers instead of six.

> For a **fast** bug hunt while still coding, `/debug` or `/review` are the better tools — no screenshots, no artifact, a fraction of the cost. Reach for `/panel-review no-ticket` when you want the full panel (rendering, measurements, architecture, the artifact) and only the acceptance comparison is unwanted.

### Mode A — my own branch, no PR yet (`/panel-review` with no arguments)

**This is the normal way to use it before a PR exists** — code still sitting in the editor, committed or not. `CLAUDE.md`'s commit policy (hard rule #1 — nothing commits without an explicit user keyword) means finished work often *stays* uncommitted here, so **do not treat a dirty tree as an error. It is the expected case.**

Capture the whole changed surface — committed, uncommitted, and untracked:

```bash
git fetch origin main --quiet
git diff origin/main --stat        # working tree vs main — INCLUDES uncommitted
git diff origin/main               # the actual diff to review
git status --porcelain             # find untracked files
```

- **`git diff origin/main` (no `...HEAD`)** compares the **working tree** to `main`, so uncommitted edits are included. `origin/main...HEAD` would silently skip them — never use it in this mode.
- **Untracked files do NOT appear in `git diff` at all.** Anything marked `??` in `git status --porcelain` must be **read directly with the Read tool** or it is invisible to the whole panel. A brand-new file is usually the most important thing in the change.
- Say in the review that it covers uncommitted work, and note the tree was dirty at review time — line numbers will move once it's committed.
- Everything else (PR/issue lookup, the six reviewers, screenshots, the doc) works identically. Even with no PR open yet, check `gh pr list --head <branch>` (if `gh` is available and authenticated) in case one already exists — that changes what Reviewer F grades against.

### Mode B — a PR that already exists (`/panel-review 711`)

Use this for a PR — yours or a colleague's. It reviews the PR exactly as GitHub sees it, so the local tree is irrelevant and a dirty tree does not matter.

```bash
git fetch origin refs/pull/<N>/head:pr-<N>-review
git diff origin/main...pr-<N>-review --stat
git show pr-<N>-review:<path>                  # read files at PR head
```

Here `...`-style triple-dot **is** correct — you want what the PR contains, nothing more.

- **Plain git is the primary path and needs no setup** — `git fetch origin refs/pull/<N>/head` authenticates with the developer's existing credential helper (the same one they push with). No `gh`, no GitHub MCP, no token.
- `gh` is a **bonus, not a dependency**. It adds the PR title/body/comments. Only use it when it is installed **and authenticated** — check `gh auth status` first, **not** just presence on `PATH`. Installed-but-logged-out is a real state, and so is not-installed-at-all (verified: absent from `PATH` in at least one sandboxed session this file was written in — never assume it exists on the machine actually running the review). If either check fails, use plain git and move on without comment.
- **If `gh` works, read the PR description AND comments:**
  ```bash
  gh pr view <N> --json title,body,comments
  ```
  **Look at any images embedded in the body or comments, not just the prose.** GitHub renders inline screenshots/GIFs pasted straight into PR markdown (plain `https://` URLs, not short-lived signed links — no re-fetch dance needed), and the real requirement or the real bug repro is sometimes only in the picture. Fetch and view any image URL you find.
  Also read the PR **title** for intent — e.g. "*Initial* fix for…" tells you the author considers it a first pass, which is worth knowing before writing a ship verdict.
- **Never `git checkout` the PR ref** — the user's tree may be on another branch. Read via `git show` / `git diff`. If UI evidence is needed for this PR (§4), use a **worktree**, not a checkout (see §4).
- **Clean up:** `git branch -D pr-<N>-review` when done (and remove any worktree created for it — see §4).
- **`/panel-fix` cannot run in this mode** unless the PR's branch is checked out locally — the code isn't in the current working tree. Reviewing a colleague's PR? Send them the artifact; don't rewrite their branch.

### Base ref — verified, not a trap here

**Base is `origin/main`.** Unlike some repos where `git symbolic-ref refs/remotes/origin/HEAD` disagrees with the documented flow, here they **agree**: `origin/HEAD` points at `main`, and the actual merge history (PRs #704–#711, etc.) confirms feature branches PR straight into `main` — `staging` exists as a branch for occasional batches, not the normal path. No override needed; still confirm with `git symbolic-ref refs/remotes/origin/HEAD` if this file goes stale, rather than trusting this note forever.

### Then, both modes

- **Get the "ticket."** There is no ClickUp/Jira here — unless `no-ticket` was passed (see above), the acceptance spec is the **GitHub PR description + linked issue** (if any). In Mode B you already have the PR number. In Mode A, check whether a PR exists for the current branch first (`gh pr list --head <branch>` if `gh` is usable). **No PR and no linked issue?** Say so plainly, drop Reviewer F, and record that acceptance was NOT graded — same as `no-ticket`, just discovered rather than requested.

- **LOOK AT EMBEDDED IMAGES. Do not review a PR from its text alone.** As above — screenshots/GIFs dropped into the PR description or a review comment are often the actual spec (an annotated before/after, a recording of the bug) and are easy to skim past reading only the prose.

- **Resolve files to Domain Manifest domains** (the JSON block at the bottom of `CLAUDE.md`) and read `docs/<domain>/gotchas.md` for each touched domain (fall back to `docs/<domain>/rules.md` if that domain has no `gotchas.md`). **A changed file that matches no Domain Manifest glob is itself a finding** — no doc-sync coverage fires on that code, and the manifest's own claim to map every source file is now false.

- **Note risk paths touched**, for elevated scrutiny: `src/models/**`, `src/lib/auth.ts`, `src/lib/stripe.ts`, `src/middleware.ts`, `.env*`, `next.config.ts`, `scripts/migrations/**`, `vercel.json`, `package.json` dependency changes, and anything matching `CLAUDE.md`'s `BUSINESS_TRIGGER_GLOBS` / `CUSTOMER_TRIGGER_GLOBS` (in `.claude/hooks/doc-sync.mjs`) — these are exactly the files whose edits are supposed to force a README.md/BUSINESS.md/CUSTOMER.md touch, so a PR that edits one without touching those docs already failed the automated gate; confirm it was actually fixed, not just unblocked by a one-line non-answer.

## 1. Static gate (one step — not a reviewer)

```bash
npm run type-check
npm run lint
```

Report pass/fail with real output. Both are safe — no DB access, no server boot.

> **Compare against the known baseline, don't report inherited reds as new findings.** As of the facts baked into this file, `npm run lint` reports **6 pre-existing errors** in files unrelated to any single feature branch — `e2e/fixtures/test.ts` ×3 (`react-hooks/rules-of-hooks`, a false-positive on a `use()` helper that is neither a component nor a hook), `scripts/codemod-dark-text.js` ×2 (`no-require-imports`), `scripts/migrate-klaviyo-draw-properties.ts` ×1 (`no-explicit-any`) — plus **31 pre-existing warnings**. If the diff didn't touch those files, those errors are baseline noise, not a finding. Only report lint/type-check output that is **new** relative to this baseline (or that the baseline itself has drifted — re-run `npm run lint` on `origin/main` if unsure whether a red is inherited).

## 2. The finding contract — APPLIES TO EVERY REVIEWER

**A finding nobody understands is a finding nobody fixes.** Every finding needs all five:

| Field | Rule |
| --- | --- |
| **Title** | One plain-English sentence. The **symptom**, not the mechanism. A non-engineer must get it. |
| **What happens** | 2–3 sentences. A user story: *do this → this happens.* No jargon, no rule names. |
| **Where** | `file:line` in backticks **+ a 3–8 line snippet** of the offending code. Every finding, always — including UI ones. |
| **Evidence** | A screenshot if it has a visual surface (§4). If code-only, say so. |
| **Fix** | **Executable, not advisory.** Name the exact change. |

| ❌ Don't | ✅ Do |
| --- | --- |
| "Unmemoized derived value in the handler causes a stale re-render on the next tick" | "The button stays disabled after you fix the field that disabled it" |
| "`resolveTierCopy` export is not consumed by the render path" | "A file says it's the single source of truth for tier copy. Nothing imports it." |
| "AC non-conformance: entries-purchased framing present at line 88" | "The PR description asked to fix the free-entry wording. Line 88 still says 'buy entries'." |

**The fix line is what a developer actually acts on. It must be an instruction, not a suggestion:**

| ❌ Vague | ✅ Executable |
| --- | --- |
| "Consider refactoring the handler" | "Delete lines 210-228 — this branch is unreachable once the guard above returns early." |
| "Improve the tap targets" | "Replace `p-2 items-center` with `p-3 items-start min-h-[44px]` at `:190`, `:354`." |
| "Review whether this is intended" | "Ask on the PR: keep the old copy or ship the new one? Then amend the PR description." |

Banned in a fix: *consider · review whether · might want to · could be improved · look into · possibly*. If you can't say what to change, the finding isn't ready — say **"needs investigation"** and mark it P2.

**One finding = one fix.** Never bundle two problems into one id — a developer can't half-tick a box.

**Finding ids are `F-001`, `F-002`, … — never `PR-001`.** A doc about **PR #711** containing `PR-039` reads as a pull request. `F` = Finding. Keep it — this also matches this repo's existing `docs/tech-debt/panel-review-<branch>.md` convention.

### Volume discipline — this matters as much as wording

**A 30+ item list is unreadable, and unreadable means unread.**

- **Cap the "Now" set at 5.** If more than 5 look urgent, you haven't prioritised — decide.
- **Merge duplicates hard.** Three reviewers describing one root cause is ONE finding, noting who raised it.
- **If a P2 has no executable fix, drop it.** Polish nobody will do is noise.
- **Prefer root causes over symptoms.** One structural fix that clears four findings at once — say so, and merge them.

**P0** blocks/incorrect — **including any `CLAUDE.md` §11 free-entry/legal-copy violation on customer-facing copy, unconditionally.** **P1** clearly hurts. **P2** polish. YAGNI caps at P2 unless it causes a bug. Be specific and honest; no flattery. **Do not edit code. Do not commit. Do not check out branches.**

## 3. Launch the panel — concurrently, in one message

Spawn them all in **one message** as **general-purpose** agents. Give each the step-0 scope, the PR description/comments (if any), and the §2 contract.

**Six reviewers normally. Five when `no-ticket` was passed (or no PR/issue exists) — drop F.**

### A — Principal Engineer

SOLID / DRY / KISS / SoC (**strict layering: `app → services → repositories/lib → models`**, thin route handlers, no business logic in components — per `CLAUDE.md`'s Architecture section) / YAGNI. **Name the violated rule.** These are `CLAUDE.md` Hard Rules — severity:

- **P0 LEGAL** — any customer-facing string (Cobber, promo/landing, membership/pack UI, mini-draws, checkout/upsell, emails, SEO, SMS/push) using gambling/probability framing (`odds`, `chance(s) of winning`, `boost/increase your chances`, `better odds`, `lottery`, `lotto`, `raffle`, `sweepstake`, `gamble/gambling`, `bet`) or selling-entries framing (`$X per entry`, `buy/purchase entries`, a tier priced "N entries · $X"). Cite `CLAUDE.md` §11 exactly.
- **P0** — business logic inside `src/app/api/**/route.ts` (belongs in `src/services/<domain>/`); DB access from a component; a committed secret; Norm lockstep drift (an admin API/response-shape change with `src/lib/internal-norm/classification.ts`, a schema under `src/lib/internal-norm/schemas/`, or the Norm route left out of sync) — this is a **runtime 500**, invisible to `tsc`.
- **P1** — Domain Manifest doc-sync gap (a `src/`/`scripts/` change with no matching `docs/<domain>/` touch); a fired `BUSINESS_TRIGGER_GLOBS`/`CUSTOMER_TRIGGER_GLOBS` path with neither BUSINESS.md/README.md nor CUSTOMER.md touched; a performance footgun from `CLAUDE.md`'s list (unconditionally-rendered `dynamic()` modal, Stripe booted at module scope, an unprojected `.find()` on a list endpoint, a non-viewport-scoped `priority`/preload, wrong third-party script timing, an un-gated always-on animation, a page prerendering under the wrong CSP route class); the **zero-trial-invoice webhook footgun** — any mutation touching `trial_end`/`billing_cycle_anchor`/`proration_behavior` or swapping items on an existing subscription, without the `isZeroAmountTrialUpdateInvoice` guard classifying the spawned invoice.

Also: dead code, missing error handling, anything `tsc`/`eslint` would flag beyond the §1 baseline.

### B — UI/UX

**Gate: does the diff touch a UI surface** (`src/components/**`, `src/app/**` pages, `src/app/globals.css`)? If not, report "N/A" and stop.

If it does — **render it (§4). Do not compute pixel values from source** — measure via `getBoundingClientRect`/`getComputedStyle`, never paper arithmetic.

Check: `src/components/ui/**` primitive reuse (no one-off raw elements where a shared primitive exists), spacing/rhythm not cramped or wasted, one clear primary action per view, typography hierarchy/contrast/no truncation, accessibility (labels/aria on icon-only controls, focus order, never colour-only status, tap targets on touch), responsive at desktop **and** mobile widths. **Also re-run the §11 legal-copy scan visually** — rendered copy sometimes differs from source (interpolated strings, truncation revealing a banned word mid-sentence).

**Video evidence (optional, ToolsAustralia-specific):** if the diff touches a flow already covered by an `@demo` spec (`landing.spec.ts`, `my-account.spec.ts`, `purchase-subscription.spec.ts`), you MAY run:

```bash
npm run e2e:proof -- --grep @demo --project chromium-desktop
```

and reference the narrated mp4 at `e2e-artifacts/proof/<date>-<branch>/<test-slug>/<slug>.mp4` in the review. **Don't embed the mp4 itself** in the Artifact (multi-MB, and the Artifact must be a single self-contained HTML file) — embed 2–3 of the accompanying `step-N-<slug>.png` screenshots instead and note the mp4's on-disk path so a human can open it directly. Use judgement: only worth the ~1 extra minute when the changed flow is actually one of the three covered specs.

**Clean up:** kill the `e2e:env` process tree and confirm port `3799` is free again before finishing (see §4).

### C — First-time user

No training, no tribal knowledge. Audiences: **guests** (not yet a member), **members/tradies** (the paying customer), **admins/staff** (internal). Judge as whoever the surface serves. Clarity, dead ends, hidden prerequisites, terminology. Flag **internal vocabulary in user-facing UI** (model/field names, internal state names, jargon) and — reading purely as a member would — anything that reads like gambling/odds language or "buying entries" even if it technically passes a keyword scan (§11 is about the *reader's* impression, not just banned strings). Quote the current string, give the replacement.

### D — Senior QA Automation & Test Engineer

**Kept here** — unlike a repo where the only suite hits a shared dev DB with unscoped cleanup, this repo's suites are safe to run:

- `npm run type-check` / `npm run lint` — already run in §1; reference that output, don't duplicate the run.
- **Targeted regression tests.** ~100 standalone `tsx` scripts wired as `test:*` npm scripts (no jest/vitest here — see `CLAUDE.md` Commands). Grep `package.json` for `test:*` entries whose target file overlaps the changed `src/` domain and run those (e.g. a billing-anchor change → `npm run test:anchor-billing`, `npm run test:reanchor-gate`, `npm run test:zero-trial-guard`). **Most are pure-logic, zero-DB, unconditionally safe. A subset (grep the test file for `connectDB`/`mongoose`) briefly writes to the real dev `MONGODB_URI`** via `connectDB()` — these are still safe to run because they scope every write to freshly-created ids and clean up in a `finally` block (`deleteMany({_id: {$in: created}})` + `mongoose.disconnect()`), but they are **not** isolated the way `e2e:smoke` is, so avoid running a large batch of them casually and never modify one to skip its cleanup.
- **`npm run e2e:smoke`** (`--grep @smoke`) — SAFE to auto-run: isolated `E2E_MONGODB_URI` (db name must contain `"e2e"`, wiped every run, refused otherwise by `assertE2eSafety()` in `e2e/lib/env.ts`). Run it when the diff touches marketing/auth/account/admin/membership-modal/legal-copy surfaces the smoke suite covers.
- **`npm run e2e:purchase`** (`--grep @purchase`) — real Stripe **TEST-MODE** money-path specs, sequenced per browser project. Expensive (real API round-trips × 3 projects). Only run when the diff touches a payment/subscription/webhook path; otherwise just note it as a **recommended follow-up** rather than auto-running it.
- **Never `npx playwright test` directly** — always via `npx tsx e2e/run.ts` or the npm `e2e*` scripts; a bare `playwright test` skips the orchestrator's env-overlay safety guard, wipe+seed, and port pre-flight.

Coverage rubric — same as the canonical template: data validation, state management, error handling, edge cases. For each gap, name the untested path (`file:line`) and the specific test that should exist (a `test:*` addition, or an `e2e/specs/**` addition per `docs/e2e/adding-a-spec.md`).

### E — Principal Architect

Stack: **Next.js 15 App Router + MongoDB/Mongoose + Stripe + Vercel serverless**.

- **Connection pooling** — `src/lib/mongodb.ts` caches a global connection across invocations and auto-sizes `maxPoolSize` smaller for serverless (each function instance gets its own pool; see `MONGODB_MAX_POOL`). Flag any new code that opens an ad hoc `mongoose.connect()`/`MongoClient` outside this cache (see `docs/mongodb/` — `MONGODB_CONNECTION_BEST_PRACTICES.md`).
- **Serverless statelessness** — Vercel functions are stateless/ephemeral between invocations. Flag in-process singletons or module-scope mutable state expected to persist across requests, and any `setInterval`/background-worker pattern that should instead be a `vercel.json` cron route (`src/app/api/cron/**`).
- **Webhook idempotency** — new Stripe webhook handling must dedupe by event id (`ProcessedStripeEvent`) or route through the existing `StripeWebhookQueue` (backoff/orphan-recovery already built). Re-apply the **zero-trial-invoice footgun** here too: any subscription mutation that sets `trial_end`/`billing_cycle_anchor`/`proration_behavior` or swaps items can make Stripe auto-spawn an extra `invoice.payment_succeeded` with its own event id — idempotency-by-id alone does not catch it.
- **Unbounded queries / missing projections** — list endpoints must use explicit `.select()` include-lists (pattern: `src/utils/dashboard/my-account-projection.ts`); flag any bare `.find()` on a collection with a large/unbounded array field.
- **Cron routes** — a new `src/app/api/cron/**` route needs both a `crons[]` schedule entry AND a `functions{}.maxDuration` in `vercel.json` sized to its work (existing ops-heavy crons use 300s).
- **Rate limiting** — new public-facing mutation endpoints should be checked against `src/lib/rate-limiting/**` / the `RateLimit` model, not left ungated.
- **Security & compliance** — PII/secrets never logged or committed; every `/api/admin/**` handler enforces its own server-side auth check (middleware alone does not gate `/api` — its matcher excludes it, per `CLAUDE.md`); injection/SSRF on any new external-URL fetch; least-privilege on any new Norm-exposed read (`firstName` + opaque `userId` only).
- **Blast radius & resilience** — if Stripe/Mongo/Klaviyo/SendGrid/Cloudinary goes slow or fails, what breaks and how far does it spread? Timeouts, bounded retries, idempotency, graceful degradation. New `scripts/migrate-*.ts`/`scripts/backfill-*.ts` must be idempotent and default to `--dry-run` per `writing-ops-script`.

Risk paths from step 0 get elevated scrutiny.

### F — Product / Acceptance

**Every other reviewer judges whether the code is GOOD. You judge whether it does WHAT WAS ASKED.** Clean, fast, beautiful code doing 5 of 7 required things still fails.

**First, decide whether the PR is gradeable at all.** Only grade against requirements that actually exist and are specific enough to pass or fail.

- **A clear PR description** (a checklist, numbered requirements, an annotated screenshot, or a linked GitHub issue with concrete asks) → grade every one. This is the normal path.
- **A vague description** (a one-line summary, "fix stuff", no checklist, or asks so woolly that any implementation satisfies them) → **do NOT invent criteria and grade against your invention.** Say plainly: *"PR #N has no gradeable acceptance criteria — acceptance not assessed."* Then **that is itself a finding** (P2, or P1 if the PR is marked urgent/hotfix): a PR nobody can grade is a PR nobody can verify shipped what was intended. Name what's missing.
- **Contradictory asks, or a premise the code/base branch disproves** → **P0**, and say so loudly. That's the most valuable thing this hat produces.

**Never fabricate a spec to have something to measure against.** A wrong answer key is worse than no answer key.

When the PR *is* gradeable — per-requirement verdict with `file:line` evidence: **MET / PARTIAL / MISSING** (P0) **/ UNVERIFIABLE FROM CODE**. Never MET on optimism; never MISSING without grepping properly.

**Read embedded images** (see step 0) — the real requirement is sometimes a screenshot or GIF in the PR description or a comment, not the prose. If image and text disagree, that's a finding.

**You may challenge the PR description itself.** If it contradicts itself, or the premise is disproved by the code or by rendering `origin/main`, that's a **P0 finding**.

**Scope check, reverse direction:** does the PR do things it never described doing? Unrelated file churn in a "small fix" PR is itself worth flagging, not automatically bad.

**Ship verdict:** plainly — is this met well enough to ship? If not, name the blockers.

## 4. Evidence capture

Goal: real screenshots and real measurements using this repo's **own** e2e harness — no separate improvised render harness needed, it already exists for exactly this.

1. **Mode A (own working tree):** just run it in place.
   ```bash
   npm run e2e:env
   ```
   Waits for `[e2e] Environment held open at http://localhost:3799`. Boots a seeded dev server + webhook forwarder and holds it open until Ctrl+C / process kill.

   **Mode B (a colleague's PR):** the code isn't in the current tree and you must never `git checkout` it (§0). Create a **worktree** instead, per `CLAUDE.md` §9's convention (`<repo-root>/.worktrees/<name>/`) — not via `scripts/wt-new.sh` (that script forks a **new** `feature/<name>` branch from a base; here you need to attach the **already-fetched** PR ref):
   ```bash
   git worktree add .worktrees/panel-review-pr-<N>/ pr-<N>-review
   cp .env.local .worktrees/panel-review-pr-<N>/.env.local   # mirrors wt-new.sh's approach
   cd .worktrees/panel-review-pr-<N>/ && npm install
   npm run e2e:env
   ```
   Remove the worktree (`git worktree remove .worktrees/panel-review-pr-<N>/`) when done, alongside the `pr-<N>-review` branch cleanup from §0.

2. **Attach with the Playwright Node API** — `import { chromium } from '@playwright/test'`, or Playwright MCP if configured in the session. **Never `playwright test`** for a capture — it loads `playwright.config.ts`'s full project matrix and can pick up proof-mode env vars unexpectedly; you want one page, driven directly.
3. **Auth** — use the seeded member (`e2e.member@e2e.local`) / admin (`e2e.admin@e2e.local`) credentials, or the storage states at `e2e-artifacts/.auth/{member,admin}.json` if a `setup`-project run has already produced them (regenerate if stale).
4. **Measure** via `page.evaluate` + `getBoundingClientRect`/`getComputedStyle`. Put measured numbers in the finding — never compute from source.
5. **Crop per finding** with `sharp` (already a dependency) → `.webp({quality: 82})`, ~440px wide. Full-page shots scaled down are unreadable.
6. **Video, when it earns its place** — see Reviewer B's video-evidence note. Reuse the same `e2e:env`/worktree already running; `npm run e2e:proof` is a separate orchestrator invocation (it boots its own server), so run it after tearing down the `e2e:env` hold-open session, not concurrently on the same port.
7. **Clean up** — kill the `e2e:env` process tree, confirm port `3799` is free (`e2e/run.ts`'s own pre-flight will refuse to boot on top of a stale one — treat that as your own leftover, not someone else's), remove any Mode B worktree + PR ref branch.

**Honesty rule:** Chromium at any width is **not** a real device. If a requirement demands real-device verification, it stays **UNVERIFIABLE** — never let a screenshot imply a device test.

## 5. Consolidate + plan

Merge into **one priority-ordered list** (P0 → P1 → P2; correctness before polish within a tier). De-duplicate, noting overlap — **convergence is signal**; if multiple reviewers independently pick the same item, say so. Drop nothing. Assign stable `F-NNN` ids.

Then, as senior developer: group into batches, give each **Now / Next / Later** + effort (S/M/L). **Overrides:** you may reject or downgrade any finding, but only with an explicit reason; record as `Overridden`, never delete — the reasoning stays auditable. **If rendering contradicted a reviewer, correct it loudly** in both deliverables. End with the **recommended first PR** and which items are **ship-blockers** vs follow-up debt.

## 6. Publish the Artifact

Load the **`artifact-design`** skill first. Write the report to a scratch HTML file, inline images as data URIs, publish it.

**Lead with the answer, not a list:** headline = the single most important finding, in plain English → verdict strip (ship/don't + requirement scoreboard + counts) → the finding that reframes everything (if any) → findings P0→P2 per the §2 contract → **corrections** (what rendering disproved — this is what makes the rest credible) → requirements table → the plan → method + what remains unevidenced.

**Build requirements** (verify by rendering before publishing):

- **Self-contained** — CSP blocks every external host. Inline all CSS; images as `data:image/webp;base64,…`. **No webfont URLs** — they fail silently; use a deliberate system stack.
- **Theme-aware** — tokens on `:root`, redefined under `@media (prefers-color-scheme: dark)` **and** `:root[data-theme="dark"]` / `[data-theme="light"]`.
- **Semantic colour ≠ accent.** Severity red/amber/green is content here; keep the accent clear of it.
- **No horizontal body scroll at any width** — assert `scrollWidth <= clientWidth` at 390px. Tables get `overflow-x: auto`.
- **Comparison images share a frame height** (`object-fit: contain`) — a 375px and a 1440px capture at different scales sabotages the claim they exist to prove.
- **Video evidence is referenced, not embedded** — link the on-disk mp4 path as plain text (it's outside the artifact's reach; the artifact is view-only and can't serve local files), with the 2–3 step screenshots embedded normally.
- **Verify:** load the built file in Playwright at 390/1280 in both themes; assert no horizontal scroll, all images `naturalWidth > 0`, zero console errors.

**After publishing, tell the user — every time:**

> ⚠️ **The Artifact is PRIVATE by default and I cannot change that.** The Artifact tool has **no visibility parameter**; sharing is only settable from the page's share menu. Open it → **Share** → **"Anyone with the link"**.

Paste the URL + the doc path + a 3-line chat summary (counts + the "do now" set).

## 7. Write the tracked doc

`docs/tech-debt/panel-review-<branch>.md` (`/` → `-`; in Mode B name it for the **reviewed** branch, resolved via `git ls-remote origin | grep <head-sha>` if not obvious). **If it exists, UPDATE in place — preserve every `Done`/`Overridden` marker and `_Handled:_` note.** Only add new findings (continuing `F-NNN`) and refresh the plan. Never renumber or drop a recorded finding.

Header: branch, absolute date, base ref + diff command, PR # (if any), the acceptance summary (per-requirement verdicts, or "not graded" + why), touched Domain Manifest domains, **Artifact URL**, gate status (type-check/lint results vs the §1 baseline, which `test:*`/`e2e:smoke`/`e2e:purchase` ran), and how evidence was captured (including whether video evidence was produced, and its path).

```
- [ ] **F-001** · P0 · Eng · `path/file.ts:120-180` — <plain-English title>.
      _What:_ <2-3 sentences>  _Fix:_ <one line>  _Shot:_ `<scratch>/ev-x.webp`  _Handled:_ —
```

### The doc must be a work order, not a report

It is picked up later by a **fresh Claude session with none of this context** (via `/panel-fix`, or by a human pasting the handoff block). Write it for that reader:

- **No pronouns pointing at this conversation.** "the component we discussed" is useless later. Name the file.
- **Every `_Fix:_` must be executable on its own** — the reader has the repo and this doc, nothing else.
- **State the branch/PR the findings apply to** in the header. Line numbers rot; anchor them to a SHA.

**Put this block immediately after the header, filled in:**

```markdown
## Handoff

Fresh session? Run `/panel-fix` on this branch, or paste:

> Read `docs/tech-debt/panel-review-<branch>.md`. Fix ONLY the Now items: F-001, F-002, F-005.
> Findings were written against `<head-sha>` — re-grep each `file:line`, they may have moved.
> One commit-worthy change per finding. Do NOT commit. When a finding is done, tick its box
> and fill `_Handled:_` with the date. If a fix turns out to be wrong, mark it Overridden with
> a reason instead of silently skipping it.

**Now (do these):** F-001, F-002, F-005 — <one line each>
**Next:** F-006, F-007
**Later:** everything else
```

## Rules

- **Review only — never implement fixes** unless asked afterward.
- **Never commit.** Running this is not authorization. Leave everything in the working tree and report. No `git add -A`/`.`/`-u`.
- Every finding gets a code reference. No exceptions.
- Clean up `e2e:env` process trees, worktrees, and PR refs before finishing.
- The doc's checkboxes are durable — whoever fixes a `F-NNN` ticks it and records the commit.
