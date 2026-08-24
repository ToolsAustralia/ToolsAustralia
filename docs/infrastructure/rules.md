# Infrastructure — Rules

## R1. Env access through `lib/environment.ts`

Don't `process.env.X` directly. Use the validated module — fails fast on missing env at boot.

## R2. Cron routes require shared secret

Every cron endpoint must verify a shared secret (env var) before running. Otherwise anyone can trigger expensive jobs by hitting the route.

## R3. Cloudinary signing on server only

Never expose the Cloudinary API secret client-side. Server signs upload URLs; client uploads directly to Cloudinary with the signed URL.

## R4. All dates use `date-fns-tz` Sydney

Anchor billing, draws, schedules — all `Australia/Sydney`. Never use `Date.now()` or browser local time for business logic.

## R5. Webhook signature verification mandatory

Any webhook endpoint must verify the provider's signature before processing. Helpers in `src/utils/webhook/`.

## R6. Migrations are idempotent

Already covered in [mongodb R3](../mongodb/rules.md#r3-migrations-are-idempotent) — restated here because migrations live in `scripts/` (this domain).

## R7. Dry-run before live for ops scripts

`migrate:`, `backfill:`, `sync:`, `stripe:`, `find:`, `fix:` scripts almost all support `--dry-run`. Always run dry first.

`fix:stuck-charge-jobs` (`scripts/fix-stuck-charge-jobs.ts`, added 2026-06-24) finalizes **stalled** `running` `ChargeJobRun` docs — it recomputes their real totals from `InvoiceChargeLog`, marks them `aborted`, and releases an expired global charge lock. Variants: `fix:stuck-charge-jobs[:dry]` (local) and `fix:stuck-charge-jobs:prod[:dry]` (loads `MONGODB_URI` from `.env.production`). Always run the `:dry` variant first.

**"Stalled" means no progress, not "started a while ago" (changed 2026-08-24).** The script **imports** `runLivenessAt` and `ORPHAN_RUN_THRESHOLD_MS` (it does not re-derive `lastProgressAt ?? startedAt`, and its default threshold comes from the constant) — the same liveness rule as `isOrphanRun` in [`src/server/admin/charge-past-due-totals.ts`](../../src/server/admin/charge-past-due-totals.ts). It was `startedAt` alone, which is unsafe now that real charge runs legitimately exceed the 35-minute default (36–39 min in production, and rising with the past-due population): an operator running this against a healthy in-flight run would have aborted it mid-charge. `--older-than-min=N` overrides the quiet-time threshold, not an age. The `:dry` output now also reports how many `running` runs were **left alone because they are still progressing**. Rationale + the measured incident: [admin/gotchas.md](../admin/gotchas.md#the-orphan-sweep-killed-every-healthy-charge-run-for-five-days-2026-08-24).

## R8. No server-only imports in client components (lint-enforced)

A `"use client"` component must never import a Mongoose model (`@/models/**`), the `mongoose` package, or the Mongo connection helper (`@/lib/mongodb`). These are server-only — `mongoose` is a `serverExternalPackage`, so importing one into client code crashes at runtime or bundles the data layer into the client. Fetch data in a server component / route handler / service and pass plain serializable data down.

Enforced by the `local/no-models-in-client` ESLint rule (`eslint/rules/no-models-in-client.js`, severity `error`), wired in `eslint.config.mjs`. It also fires on dynamic `import()` and `export … from` re-exports.

Companion: the `.claude/hooks/typecheck-gate.mjs` Stop hook runs `tsc --noEmit` + ESLint on the `.ts/.tsx` files a session edited and blocks the stop on errors **in those files** (scoped to the session's own edits via `.claude/.touched-files`, so pre-existing or other-session errors never false-block). Whole-program coverage still runs in `/ship`, `/review`, and CI.
