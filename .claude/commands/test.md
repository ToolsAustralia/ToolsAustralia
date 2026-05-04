---
description: Add a tsx regression test for a specified module. Wires the test:<scope> entry into package.json, runs it, returns pass/fail.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash
argument-hint: <module path or behavior to cover>
---

# /test — Add a regression test

You are adding a test for: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "What module or behavior should I cover? (file path is fine)" and wait.

## Step 1 — Choose the path

- If the test would lengthen the main session's context (test patterns, sibling scaffolding, fixture setup), delegate to the `test-author` agent and return its summary.
- Otherwise invoke the `writing-tsx-test` skill in this session and follow it exactly. That skill is the source of truth for: file naming (`src/<area>/__tests__/<topic>.test.ts`), `node:assert/strict` shape, and the `package.json` `test:<scope>` entry.

## Step 2 — Run

Run the new `npm run test:<scope>`. It must exit 0 and print the success line.

## Step 3 — Hand off

If the test covers files in a domain whose docs need updating (the Stop hook will tell you), invoke the `domain-doc-updater` agent or run `/doc-domain <key>`. Then run `/ship`.

## STOP — hard rule

Do **not** commit. Wait for the user's explicit `commit` keyword.
