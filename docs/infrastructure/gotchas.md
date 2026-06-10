# Infrastructure — Gotchas

## Summarizing the ErrorReport store from the CLI

`npm run find:error-reports [-- --days=N --top=N --samples=N]` (`scripts/find-error-reports-summary.ts`) prints a read-only, severity-ranked summary of the in-app `ErrorReport` collection (the durable 90-day error log behind the admin dashboard) — counts by severity / category / status / API endpoint / route, a per-day trend, and the most recent samples. Pass `-- --contains="<substr>"` to switch to **drill-down mode**: full detail (browser / OS / HTTP status / page / stack-head) for every report whose `errorMessage` matches — useful for root-causing one specific error. Read-only (aggregations + `.find().lean()`), safe against prod. Caveat: the store **auto-logs expected payment events** (card declines, existing-subscription 409s) — now at `medium`, not `critical` — so a high `medium` count is mostly normal churn, not bugs. Read the samples, not just the severity counts.

## Cloudinary signing with wrong params

Signing must include all params being sent (or use unsigned with strict allowlist). Mismatched params → upload fails with a 401 from Cloudinary.

## Cron auth bypass

If you forget the shared-secret check, anyone can hit `/api/cron/foo` and trigger jobs. Watch out — this has happened in other codebases.

## Date timezone drift

`Date.now()` returns UTC. `new Date()` in Node returns server local. In Sydney prod, both happen to align with AEST, but DEV machines (especially internationally) won't. Always go through `date-fns-tz` for business logic.

## Webhook payload double-parsing

Some webhook providers send raw body; Next.js's bodyParser may have already consumed it. The webhook helpers in `src/utils/webhook/` handle this — read raw via `req.text()` before any other body access.

## Env var typo

`lib/environment.ts` validation catches missing env vars but typo in the key name = silent fallback to undefined. Verify env keys match what your validators expect.

## Migration drift between dev/prod

Running migration scripts in dev but not prod (or vice versa) leaves state diverged. Track migration runs in a known place.

## Migrated from `src/docs/ENVIRONMENT_SETUP.md`

> _TODO: read root file and merge._
