---
name: writing-ops-script
description: Use when writing a migration, backfill, reconciliation, sync, or one-off Stripe/Mongo maintenance script. Triggers on phrases like "write a migration", "backfill X", "reconcile Y", "sync Z to Klaviyo", "fix this in production data", "one-off script", or when adding any file under scripts/.
---

# writing-ops-script

## When to use
Creating any new file under `scripts/*.ts` (or `scripts/*.mjs`) intended to mutate Mongo data, sync to a third party (Stripe, Klaviyo, Meta), or repair production state. Existing examples: `migrate-anchor-billing-24.ts`, `backfill-membership-analytics.ts`, `sync-klaviyo-past-due-profiles.ts`, `find-duplicate-stripe-subscriptions.ts`.

## Steps
1. Pick the verb prefix that matches intent: `migrate-` (one-shot schema/data shape change), `backfill-` (fill missing data), `sync-` (push state to a 3rd party), `reconcile-` (compare two sources of truth), `find-`/`list-` (read-only audit), `fix-`/`repair-` (one-off corrective).
2. Create `scripts/<verb>-<topic>.ts`. Top of file: a JSDoc header with **Usage**, **Options**, **Safety**, and **Env** sections (copy the structure of `scripts/migrate-anchor-billing-24.ts`).
3. Load env explicitly:
   ```ts
   import { config } from "dotenv";
   import path from "path";
   config({ path: path.resolve(process.cwd(), ".env.local") });
   ```
4. Parse a `--dry-run` flag from `process.argv` and default to **dry-run = false off, but always provide a `:dry` npm variant** that passes `--dry-run`.
5. Use `connectDB()` from `src/lib/mongodb.ts` — never open ad-hoc connections.
6. If the script calls Stripe in a loop, add `DELAY_BETWEEN_UPDATES_MS` and 429 retry-with-`Retry-After` (copy `getRetryAfterMs` from `migrate-anchor-billing-24.ts`).
7. Add **two** entries to `package.json` scripts: `<verb>:<topic>` and `<verb>:<topic>:dry`.
8. Update `docs/<domain>/` for the touched domain (manifest entry `infrastructure` covers most `scripts/` paths — check before assuming).

## Conventions
- npm script naming maps 1:1 to verb prefix: `migrate:*`, `backfill:*`, `sync:*`, `reconcile:*`, `find:*`, `stripe:*`. The `:dry` suffix is mandatory for any mutating script.
- Log every action with structured fields: `{ subId, customerEmail, oldX, newX, action }`. Skipped items get an explicit `action: "skip"` with a reason — silent skips hide bugs.
- Date-sensitive logic uses `date-fns-tz` and the AEST zone. See `scripts/test-dst-transitions.ts` for DST gotchas.
- One-off mongo migrations that need a transaction live under `scripts/migrations/<YYYY-MM-DD>-<topic>.ts` (see `scripts/migrations/2025-02-18-create-winners.ts`); `mongoose.startSession()` + `session.startTransaction()`.
- Never run `git add`/`commit` after the script runs, even on success.

## Verification
```bash
npm run <verb>:<topic>:dry      # exit 0, log shows expected actions only
npm run lint
npm run type-check
```
Then ask the user before running the live (non-dry) version. Live runs against production data are a confirmation-required action.
