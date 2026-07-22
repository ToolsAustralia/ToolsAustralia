---
description: Pick up a completed panel review and fix its findings. Reads docs/tech-debt/panel-review-<branch>.md, executes the Now batch, ticks the boxes. Never commits.
---

> Adapted for **ToolsAustralia** from the canonical `/panel-review` + `/panel-fix` pair — the executor half of the loop.

Execute the fixes from a finished `/panel-review`. This is the other half of the loop: `/panel-review` finds and records, `/panel-fix` does the work and closes the boxes.

You are likely a **fresh session with none of the review's context**. The doc is the source of truth — not memory, not this chat.

## 1. Find the review

`$ARGUMENTS` may name a doc, a branch, a PR number, or specific ids (`F-001 F-004`). If empty:

```bash
ls -1 docs/tech-debt/panel-review-*.md
git rev-parse --abbrev-ref HEAD
```

Match the doc to the current branch (`/` → `-`). **More than one match, or none? Ask — don't guess.** Fixing the wrong PR's findings is worse than doing nothing.

Read the whole doc before touching anything: header (branch + SHA the findings were written against), the **Handoff** block, and every finding — including the ones already ticked and the ones marked `Overridden`.

## 2. Pick the batch

- Default to the **Now** set from the Handoff block. Nothing else.
- If `$ARGUMENTS` names ids, do exactly those.
- **Skip anything already `- [x]`** — done is done. Re-fixing a closed finding is how you undo someone's work.
- **Skip anything `Overridden`** — a senior dev already rejected it *with a reason*. If you think the reason is wrong, say so and stop. Don't quietly re-litigate it.

Show the user the list you're about to do, then proceed.

## 3. Before each fix — verify the finding still holds

Findings were written against a SHA in the header. **Line numbers rot.**

- Re-grep the symbol/string from the finding rather than trusting `file:line`.
- **If the code has already changed so the finding no longer applies:** don't force it. Tick the box and write `_Handled:_ <date> — already fixed in <sha/PR>` or mark it Overridden with the reason.
- **If the finding looks wrong:** stop and say so. `/panel-review` is fallible — a rendering pass or a re-grep can disprove a claim the panel made from source alone. **A finding is a claim, not an order.** Push back with evidence rather than implementing something you believe is incorrect.

## 4. Do the work

Read the owning domain's docs first — resolve the changed file(s) against `CLAUDE.md`'s **Domain Manifest** (the JSON block at the bottom of the file) to find `docs/<domain>/`, especially `gotchas.md` and `rules.md`. All `CLAUDE.md` rules apply — you're writing production code now, not reviewing it. In particular:

- **Rule 2 (doc-sync):** any `src/` or `scripts/` edit you make here must be paired with a matching `docs/<domain>/` update in the same task, or the `Stop` hook will block with `BLOCKED: Stale docs`.
- **Rule 5/5b (BUSINESS.md/CUSTOMER.md triggers):** if the fix touches a file in `BUSINESS_TRIGGER_GLOBS`/`CUSTOMER_TRIGGER_GLOBS` (`.claude/hooks/doc-sync.mjs`), touch the matching root doc too.
- **Rule 11 (free-entry framing):** if the finding is a §11 legal-copy violation, the fix must land on the approved vocabulary (`giveaway`, `prize draw`, `free entries`, `{n}× entries`) — never partially fix one banned word while leaving another.

Then:

- **One finding at a time.** Fix it, verify it, tick it, move on. Don't fan out across five findings and lose track of which change belongs to which.
- **Stay inside the finding's scope.** The `_Fix:_` line is the instruction. If doing it properly needs more than it says, stop and tell the user — that's a scope change, not a detail.
- **Don't drive-by fix.** Something else broken nearby? Add it to the doc as a new finding (continue the `F-NNN` numbering); don't silently widen the diff.
- If a fix touches a **risk path** (`src/models/**`, `src/lib/auth.ts`, `src/lib/stripe.ts`, `src/middleware.ts`, `.env*`, `next.config.ts`, `scripts/migrations/**`, `vercel.json`, `package.json` dependency changes), say so before doing it.

## 5. Verify

```bash
npm run type-check
npm run lint
```

> **Compare `lint` output against the known baseline, not zero.** As of when this file was written: 6 pre-existing errors in `e2e/fixtures/test.ts` (×3), `scripts/codemod-dark-text.js` (×2), `scripts/migrate-klaviyo-draw-properties.ts` (×1), plus 31 warnings — none of them yours unless you touched those files. A fix is clean if it introduces no *new* errors/warnings, not if the whole repo is spotless.

**Run the targeted `test:*` script(s) covering the file(s) you changed** (grep `package.json` for the matching `test:*` entry — e.g. a billing-anchor fix → `npm run test:anchor-billing`). Most are pure-logic and always safe; a subset touch the real dev `MONGODB_URI` via `connectDB()` but self-clean in a `finally` block (see `docs/e2e/gotchas.md`/`docs/dev-tooling/testing.md` for the pattern) — safe to run, just don't strip the cleanup while touching one.

**If the fix has a UI surface, run the relevant `e2e:smoke` slice** (`npm run e2e:smoke -- --grep "<spec-name>"`) rather than assuming. **If the fix has a visual claim in the doc** (a `_Shot:_` reference), reuse `/panel-review`'s §4 evidence recipe — `npm run e2e:env` + the Playwright Node API — to re-capture and confirm the fix actually changed what the screenshot showed, not just that the code compiles. Kill the `e2e:env` process tree afterward.

**Never run `npm run e2e:purchase`** as part of a routine `/panel-fix` verification unless the finding is specifically about the payment/subscription/webhook path — it's real Stripe test-mode traffic, sequenced per project, and expensive to run casually.

## 6. Close the loop — the part that matters

**Update the doc in the same response as the code change.** A fix that isn't recorded gets done twice.

For each finding:

```
- [x] **F-001** · P0 · Eng · `path/file.ts:842-862` — <plain-English title, unchanged>.
      _What:_ …  _Fix:_ …  _Handled:_ 2026-07-22, working tree (uncommitted)
```

- Flip `- [ ]` → `- [x]`, fill `_Handled:_` with the **absolute date** + where it landed (commit/PR ref if one exists; otherwise "working tree (uncommitted)").
- **Never renumber, never delete a finding**, never rewrite someone else's `_Handled:_`.
- Refresh the **Handoff** block: move the next batch into Now.
- Rejected something? `- [x] ~~F-0NN …~~ (Overridden: <reason>)`. The reasoning stays auditable.

Then update the owning `docs/<domain>/` files if behavior changed (rule 2), and BUSINESS.md/CUSTOMER.md if a business/customer fact flipped (rules 5/5b) — same task, not a follow-up.

## 7. Report

- Which ids you fixed, which you skipped and why.
- Files changed.
- Gate result (type-check/lint, compared against the baseline — not raw counts).
- Anything you pushed back on.
- What's left in Now.

## Rules

- **Never commit.** Running this is not authorization — per `CLAUDE.md` hard rule #1, that needs a separate "commit this" (or `push`/`merge`/`ship it`/etc.) from the user in this session. Leave it in the working tree and report. No `git add -A`/`.`/`-u`.
- **Never fix beyond the batch.** Findings not in Now stay untouched.
- **The doc is the state.** If you didn't tick it, it isn't done.
