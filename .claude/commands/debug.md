---
description: Structured "what's wrong" workflow. Reproduce, isolate, hypothesize, verify, name root cause. STOP before non-trivial fixes.
allowed-tools: Read, Glob, Grep, Bash
argument-hint: <symptom or error>
---

# /debug — Diagnose before fixing

You are investigating: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "What's the symptom? Error message, failing test, or unexpected behavior?" and wait.

Invoke `superpowers:systematic-debugging` and follow it strictly. Do **not** edit code until the root cause is named.

## Step 1 — Reproduce
State exactly how to trigger the failure. If you cannot reproduce, say so and ask the user for the missing input — do not guess.

## Step 2 — Isolate
Narrow to the smallest failing scope: a single function, a single request, a single subscription, a single test case. Reference exact file paths and line numbers.

## Step 3 — Hypothesize
Write a one-line hypothesis: "I think X happens because Y." If you have more than one, list them in order of likelihood.

## Step 4 — Verify
Use a tool — read the suspect code, run the matching `test:*` script, log the suspect value, query Mongo. Do not propose a fix from inspection alone.

## Step 5 — Name the root cause
A single sentence. If the cause is in a subsystem with conventions (billing anchor, payment attribution, refund reversal, CSP nonce, A/B dedup), cite the relevant `docs/<domain>/` file.

## Step 6 — Regression test
If no test would have caught this, invoke `writing-tsx-test` and add one in this turn.

## Definition of done
- Reproduction steps documented
- Root cause named in one sentence with code citation
- Proposed fix described (not yet applied unless trivial)
- Regression test added, or its absence justified

## STOP
**Do not apply non-trivial fixes in this turn.** End by asking: "Want me to apply the fix?" and wait for explicit approval.
