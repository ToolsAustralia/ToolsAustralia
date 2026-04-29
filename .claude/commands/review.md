---
description: Substance review of current branch vs main. Surfaces layering, manifest, security, and docs issues. Does not apply fixes.
allowed-tools: Read, Glob, Grep, Bash
argument-hint: [path or domain key]
---

# /review — Substance review of the branch

Scope: $ARGUMENTS (empty = full diff against `main`).

This judges whether the code is *right*; `/ship` checks whether it *passes*. They are complementary, not redundant.

## Step 1 — Diff
Run `git diff main...HEAD --stat` then `git diff main...HEAD` for the changed files. If `$ARGUMENTS` is non-empty, restrict to that path or domain.

## Step 2 — Layering
Flag any `src/app/api/**/route.ts` containing non-trivial business logic — that belongs in `src/services/<domain>/`. Flag DB access from a component.

## Step 3 — Manifest
Every changed file must match a Domain Manifest `paths` glob. List orphans.

## Step 4 — Subsystem invariants
If the diff touches billing, payment, subscription, promo, A/B, error-reporting, CSP, or auth, cross-check against the matching `docs/<domain>/` invariants. Cite the exact doc.

## Step 5 — Response shapes
New `route.ts` files must match sibling response shapes in the same folder. Flag drift from `{ success, data }` / `{ success, error }`.

## Step 6 — Test coverage
For every changed `src/` area, name the `test:*` script that should pass. Flag missing scoped tests for billing / payment / subscription / redeemable / affiliate / Klaviyo / CAPI logic.

## Step 7 — Security
Flag missing `requireAdminUser()` in `/api/admin/**`, `mongoose` imported into client code, inline scripts without nonce, `console.log/info/debug/warn` that won't survive `removeConsole`.

## Step 8 — Docs
Every changed `src/` or `scripts/` path must have a matching `docs/<domain>/` update in the same diff. List gaps.

## Definition of done
A bulleted list grouped by severity:
- **Blocker** — must fix before commit
- **Should** — likely a problem
- **Nit** — style / consistency

If clean, say so explicitly. **Do not** apply fixes — that is a separate turn.

## STOP
End with: "Address blockers, then run `/ship`."
