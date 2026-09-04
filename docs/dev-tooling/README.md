# Dev Tooling domain

Dev-only routes, test pages, debug endpoints, examples, test scripts.

## Index

- [architecture.md](./architecture.md) — what's here, what should be excluded from prod
- [frontend.md](./frontend.md) — `/dev/`, `/test-pixels/`, components/dev/
- [backend.md](./backend.md) — `/api/debug/`, `/api/dev/`, `/api/test/`, `/api/test-db/`
- [api.md](./api.md) — dev route inventory
- [rules.md](./rules.md) — dev-only enforcement, never prod
- [patterns.md](./patterns.md) — env-gated routes
- [gotchas.md](./gotchas.md) — dev routes leaking to prod
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — test scripts under `scripts/test-*.ts`
- [worktrees.md](./worktrees.md) — `scripts/wt-*.sh` workflow for parallel checkouts
- [ci.md](./ci.md) — `.github/` GitHub Actions checks on every PR, and how to run them locally

## Cancellation-flow harness — stakes panels (2026-07-15)

`/dev/cancellation-flow` gained four panels: the streak-stakes screen in LOSS framing (streak 7), FORWARD framing (streak 0 and streak 1 — the "ONE renewal from +100" callout), and the pause card with a 7-renewal streak (shows the streak-freeze reframe row).

## Panel-review command suite (2026-07-22)

Four Claude Code slash commands under `.claude/commands/` implement a multi-reviewer PR review workflow, adapted from a stack-agnostic canonical template:

- **`.claude/commands/global-panel-review.md`** — the vendored, stack-agnostic canonical template (5 reviewer hats: Principal Engineer, UI/UX, First-time user, QA, Architect). Runs standalone in any repo; kept as the source of truth to re-tailor from.
- **`.claude/commands/init-panel-review.md`** — the generator. Regenerates `panel-review.md` from the canonical template when the stack/conventions change (new base branch, new test runner, reworked `CLAUDE.md` rules). Does not itself run a review.
- **`.claude/commands/panel-review.md`** — the tailored review command for this repo (`/panel-review`). Six hats (adds a QA hat back in, since this repo's `test:*`/`e2e:smoke` suites are safe to run — see `docs/e2e/`). Diffs `origin/main`, reviews code + a GitHub PR's description/comments as the acceptance spec (no external ticket tracker), captures UI evidence via `npm run e2e:env` + the Playwright Node API, and optionally attaches `npm run e2e:proof` step-screenshots/mp4 references for flows covered by an `@demo` spec. Publishes a private Artifact and writes/updates `docs/tech-debt/panel-review-<branch>.md` with stable `F-NNN` finding ids.
- **`.claude/commands/panel-fix.md`** — the executor half (`/panel-fix`). Reads a `panel-review` doc's "Now" batch, applies fixes one at a time, re-verifies (`type-check`/`lint` against the known baseline + targeted `test:*`/`e2e:smoke` slices), and ticks the checkboxes. Never commits — same hard rule as the rest of this repo's tooling.

Both commands are **explicit-invocation only** — never wired to a hook or run automatically. `docs/tech-debt/panel-review-<branch>.md` sits outside the Domain Manifest by design (it's a review artifact, not domain documentation), so writing it never trips the `doc-sync` Stop hook. See `docs/e2e/` for the harness details these commands lean on (`how-to-run.md`, `proof-mode.md`, `gotchas.md`).

## `/copy` — the wording panel (2026-08-05)

`.claude/commands/copy.md` + `.claude/agents/copy-reviewer.md`. A read-only panel over every
customer-facing STRING in a scope, complementary to `/review` (which judges the code).

Five lenses: **LEGAL** (CLAUDE.md §11 — blocking), **TRUE** (numbers and claims against
BUSINESS.md, plus overclaiming), **CONSISTENT** (one concept one word, checked against
`/terms`, `/privacy` and Cobber's FAQ corpus), **RELEVANT** (does the string belong on this
page/section, or restate its neighbour), **HUMAN** (padding openers, hedge stacks, triads,
two sentences where one carries the fact).

Every finding must quote the exact current string, propose an exact replacement, and cite
`file:line` for any factual claim — a review that paraphrases the UI is unreviewable. It never
edits; fixes belong to the caller. `VERDICT: SHIP` on a clean scope is a valid result, and the
agent is told not to manufacture findings to look thorough.

Scope defaults to the branch diff vs `main`; pass a path, route or component to narrow it.
