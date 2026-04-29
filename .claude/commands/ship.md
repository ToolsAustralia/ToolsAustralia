---
description: Run definition of done — lint, type-check, scoped tests, manifest check, doc-sync. Asks before commit; never commits itself.
allowed-tools: Read, Bash, Glob
---

# /ship — Definition of done

Invoke the `finishing-task-handoff` skill and follow it exactly. It is the single source of truth for the pre-handoff verification ritual (lint → type-check → scoped tests → manifest check → doc-sync → handoff).

If you have not run `/review` yet on this branch, suggest it before shipping — `/ship` checks whether the code *passes*; `/review` checks whether it is *right*.

End-of-turn output must be the exact handoff table the skill specifies, ending with **"Want me to commit this?"**.

## STOP — hard rule

**Never** run `git commit`, `git add`, `git push`, `gh pr create`, `gh pr merge`. CLAUDE.md hard rule #1 forbids it; the PreToolUse hook will reject it. Wait for the user to use one of these keywords in their **next** message: `commit`, `push`, `merge`, `make a PR`, `create a PR`, `open a PR`, `ship it`.
