---
description: Copy panel — reviews every customer-facing string in a scope for legal compliance, factual truth, term consistency, page relevance, and whether it reads like a person wrote it.
allowed-tools: Read, Glob, Grep, Bash, Agent
argument-hint: [path, route, or component — empty = full diff against main]
---

# /copy — the wording panel

Scope: $ARGUMENTS (empty = every customer-facing string changed on this branch vs `main`).

This reviews **words**, not code. `/review` judges whether the code is right; this judges
whether the copy is true, consistent, relevant and human. Run it before shipping any surface
with new or edited customer strings.

## Step 1 — Delegate

Dispatch the **copy-reviewer** subagent with the scope. It runs in isolated context so a
1,800-line component does not crowd out this session.

Tell it explicitly:
- The scope (paths, or "the branch diff vs main").
- That it is **read-only** — findings only, no edits.
- That every finding needs the **exact current string**, an **exact replacement**, and a
  `file:line` citation for any factual claim.

## Step 2 — Relay

Report its findings verbatim, ordered BLOCKING → HIGH → MED → LOW. Do not soften a BLOCKING
legal finding, and do not add findings of your own to pad the list.

If the verdict is `SHIP`, say so in one line and stop.

## Step 3 — Apply (only if asked)

The panel never edits. If the user wants the fixes applied, do them yourself, one finding at
a time, and re-read the surrounding copy after each so a replacement does not orphan the
sentence next to it.

## What it checks

| Lens | Question |
|---|---|
| LEGAL | CLAUDE.md §11 — no gambling framing, entries never sold. **Blocking.** |
| TRUE | Do the numbers, prices and claims match BUSINESS.md and the generated data? Any absolute ("every", "full", "always") the system cannot guarantee? |
| CONSISTENT | One concept, one word — across the scope, and against `/terms`, `/privacy` and Cobber's FAQ corpus. |
| RELEVANT | Does this string belong on this page, in this section, or is it borrowed from another surface / restating its neighbour? |
| HUMAN | Would a tradesperson think a person wrote it? Padding openers, hedge stacks, triads, two sentences where one carries the fact. |

## Notes

- The agent reads `docs/BRAND_VOICE.md` for voice. That doc is rule-11 clean; the ad-script
  PDFs it was distilled from are **not** — never quote those.
- Code comments, docs, tests and log lines are out of scope. Only strings a customer can read.
