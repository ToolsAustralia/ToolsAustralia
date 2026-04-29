---
description: Structured "what's wrong" workflow. Reproduce, isolate, hypothesize, verify, name root cause. STOP before non-trivial fixes.
allowed-tools: Read, Glob, Grep, Bash
argument-hint: <symptom or error>
---

# /debug — Diagnose before fixing

You are investigating: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "What's the symptom? Error message, failing test, or unexpected behavior?" and wait.

Invoke `superpowers:systematic-debugging` and follow it strictly. That skill is the source of truth for the reproduce → isolate → hypothesize → verify → name discipline. Do **not** edit code until the root cause is named.

## Repo-specific touchpoints

- The repo has no jest/vitest. Reproductions go through `npm run test:<scope>` (see `package.json`).
- If the bug lives in a subsystem with conventions (billing anchor, payment attribution, refund reversal, CSP nonce, A/B dedup, promo banners), the root-cause sentence must cite the relevant `docs/<domain>/rules.md` or `gotchas.md`.
- If no test would have caught the bug, invoke `writing-tsx-test` and add a regression test in this turn.
- For pure investigations where you don't need the diff in this session, consider delegating to the `debug-investigator` agent instead.

## Definition of done

- Reproduction steps documented (or "could not reproduce — need: <X>")
- Root cause named in one sentence with a `[file.ts:line](file.ts#Lline)` citation
- Proposed fix described in prose
- Regression test added, or its absence justified
- **Branch on fix size:**
  - Trivial fix (≤ 5 lines, no cross-file impact, no subsystem invariant in play) — apply directly, then run `/ship`.
  - Non-trivial fix — STOP. Tell the user "Run `/plan` to design the fix before I touch code." Do not implement until they go through the plan loop.

## STOP

End by asking: "Trivial fix — apply it? / Non-trivial — run `/plan`?" Wait for explicit choice.
