---
name: finishing-task-handoff
description: Use when implementation work is finished and you are about to tell the user it is done, before asking the user to commit, when wrapping up a feature/bugfix, or when about to run a verification pass. Triggers on phrases like "I'm done", "ready to commit", "all set", "wrap this up", "ship it", or before any "task complete" message.
---

# finishing-task-handoff

## When to use
Right before you would otherwise tell the user "done" / "ready" / "all set". Auto-commit is **hard-blocked** by `.claude/hooks/no-auto-commit.mjs`; this skill is the pre-handoff ritual that runs before you ask the user for the explicit `commit` / `push` / `merge` / `make a PR` keyword.

## Steps
1. **Lint.** `npm run lint`. If it errors, fix before continuing — do not hand off with lint failures.
2. **Type-check.** `npm run type-check`. Same rule — fix before continuing.
3. **Run scoped tests.** Look at the files you touched and pick the matching `test:*` script(s) from `package.json`. Examples by area:
   - `src/utils/billing/**` → `npm run test:anchor-billing`
   - `src/utils/payment/**` (refunds) → `npm run test:refund-reversal` and/or `npm run test:stripe-refund-amount`
   - `src/services/subscription/**` → `npm run test:stripe-collection-pause`
   - `src/services/redeemables/**` → `npm run test:redeemables`
   - `src/utils/affiliate/**` → `npm run test:affiliate-attribution`
   - `src/lib/facebook.ts` → `npm run test:facebook-capi`
   - `src/utils/upsell/**` → `npm run test:upsell-images`
   - `src/utils/admin/**` → `npm run test:user-filter-builder`, `npm run test:dashboard-date-range`
   
   `npm test` alone is **not** sufficient — it only runs anchor-billing.
4. **Manifest check.** Did you create any new files? Make sure each touched path is matched by a `paths` glob in the Domain Manifest in `CLAUDE.md`. If not, invoke `registering-new-domain`.
5. **Doc-sync.** For each touched `src/` or `scripts/` file, the `docs/<domain>/` page must be updated. The Stop hook (`.claude/hooks/doc-sync.mjs`) will block otherwise — do this *before* declaring done so the hook passes silently.
6. **Hand off.** Tell the user (a) what changed, (b) what verifications passed, (c) ask explicitly: "Want me to commit this?" Wait for the keyword.

## Conventions
- **Never** run `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`. The PreToolUse hook will reject it; even if it didn't, CLAUDE.md hard rule #1 forbids it.
- The user must use one of these keywords in their **most recent** message: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`. Anything else (including "looks good", "thanks") is **not** authorization.
- `npm run dev` / `npm run build` first runs `predev`/`prebuild` which regenerates the upsell image manifest. If you touched files under upsell image directories and dev/build won't start, run `npm run build:upsell-manifest` directly to see the script error.
- If lint/type-check/tests fail and you can't fix in one or two attempts, hand off the failure to the user with the exact error — do not declare done.
- Production strips `console.log`/`info`/`debug`/`warn`. If you added debug logging, either delete it or convert to `console.error` if it's a real error.

## Verification
This skill is itself the verification step. The output of steps 1–3 IS the proof. End-of-turn message format:
```
- lint: ✓
- type-check: ✓
- test:<scope>: ✓
- docs updated: <list>
Want me to commit this?
```
