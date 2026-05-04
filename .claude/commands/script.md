---
description: Write a migration, backfill, reconcile, sync, or one-off Stripe/Mongo maintenance script under scripts/. Enforces dry-run + :dry npm variant.
allowed-tools: Read, Glob, Grep, Write, Edit, Bash
argument-hint: <verb-noun and purpose, e.g. "backfill membership analytics for Q1">
---

# /script — Write an ops script

You are writing: $ARGUMENTS

If `$ARGUMENTS` is empty, ask: "What's the script for? Verb (migrate / backfill / sync / reconcile / find / fix) + topic + a one-line purpose." and wait.

Invoke the `writing-ops-script` skill and follow it exactly. That skill is the source of truth for verb prefixes, dotenv loading, the `--dry-run` flag, the matching `:dry` npm variant, and the structured logging shape.

## Repo-specific reminders

- `connectDB()` from `src/lib/mongodb.ts` only — never open ad-hoc Mongo connections.
- Date math uses `date-fns-tz` AEST. See `scripts/test-dst-transitions.ts` for DST gotchas.
- Stripe loops need `DELAY_BETWEEN_UPDATES_MS` and 429 `Retry-After` retry — copy from `scripts/migrate-anchor-billing-24.ts`.
- Most `scripts/` paths fall under the `infrastructure` domain in the manifest. Verify before saving; if not covered, invoke `registering-new-domain`.

## Definition of done

- Script at `scripts/<verb>-<topic>.ts` with the JSDoc header (Usage / Options / Safety / Env)
- **Two** npm scripts in `package.json`: `<verb>:<topic>` and `<verb>:<topic>:dry`
- `npm run <verb>:<topic>:dry` exits 0 with the expected log lines
- `docs/infrastructure/` (or the actual owning domain) updated
- Hand off: tell the user "Dry run is clean. Run live? — that's a confirmation-required action."

## STOP — hard rule

Never run the live (non-dry) variant against production data without explicit user confirmation, even if dry-run looks perfect. Never commit.
