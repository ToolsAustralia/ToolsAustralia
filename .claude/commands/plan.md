---
description: Force a written plan before any implementation. Brainstorm intent, survey code, output a numbered plan, and STOP.
allowed-tools: Read, Glob, Grep, Bash
argument-hint: <task description>
---

# /plan — Plan before code

You are producing a written plan for: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "What are we planning?" and wait.

## Step 1 — Brainstorm
Invoke `superpowers:brainstorming`. Clarify intent, requirements, edge cases, and unknowns before any structure. Ask the user the questions the skill surfaces; do not assume.

## Step 2 — Survey
Read the relevant code paths. Use the Domain Manifest in `CLAUDE.md` to find the right `src/` files and matching `docs/<domain>/`. Surface any subsystem with non-obvious rules (billing, A/B, promo, error-reporting, refund reversal, CSP — see CLAUDE.md "Subsystems with their own conventions").

## Step 3 — Plan
Invoke `superpowers:writing-plans`. Output a numbered plan with:
- Goal (one line)
- Files to create or modify (with paths)
- Layering split: what goes in `src/services/<domain>/` vs. what stays in `route.ts`
- Test scope: which `test:*` script(s) verify it
- Docs to update: which `docs/<domain>/` pages
- Risks: things that can go wrong

## Step 4 — Manifest check
If any new path will not match an existing manifest glob, name the orphan and propose either an existing domain to extend or a new one (cite `registering-new-domain`).

## Definition of done
A plan another session could execute via `superpowers:executing-plans`. Must include goal, numbered steps with paths, test scope, docs to update, and risks.

## STOP
**Do not write any implementation code in this turn.** End by asking: "Plan looks right? I'll wait for the go-ahead."
