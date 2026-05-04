# Infrastructure — Gotchas

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
