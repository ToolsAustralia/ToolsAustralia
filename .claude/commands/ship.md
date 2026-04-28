---
description: Run definition of done — lint, type-check, scoped tests, manifest check, doc-sync. Asks before commit; never commits itself.
allowed-tools: Read, Bash, Glob
---

# /ship — Definition of done

You are running the pre-handoff verification. No arguments.

Invoke `finishing-task-handoff` and follow it exactly. Output the verification table at the end.

## Step 1 — Lint
`npm run lint`. Fix errors before continuing — do not hand off with lint failures.

## Step 2 — Type-check
`npm run type-check`. Fix errors before continuing.

## Step 3 — Scoped tests
Look at touched files; pick the matching `test:*` script(s) from the mapping in the `finishing-task-handoff` skill. `npm test` alone is **not** sufficient — it only runs anchor-billing.

## Step 4 — Manifest check
Every new file must match a Domain Manifest `paths` glob. If not, invoke `registering-new-domain`.

## Step 5 — Doc-sync
Every touched `src/` or `scripts/` file needs its `docs/<domain>/` updated. If pending, run `/doc-domain <key>` for each affected domain before returning. The Stop hook will block otherwise.

## Definition of done
End-of-turn message in this exact shape:

```
- lint: ✓
- type-check: ✓
- test:<scope>: ✓
- docs updated: <list of docs/<domain>/ files>
Want me to commit this?
```

If anything fails and you cannot fix in one or two attempts, hand off the failure to the user with the exact error — do not declare done.

## STOP — hard rule
**Never** run `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`. CLAUDE.md hard rule #1 forbids it; the PreToolUse hook will reject it. Wait for the user to use one of these keywords in their **next** message: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`.
