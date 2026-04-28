# Draws — Patterns

## P1. Single transition authority + debounced multi-call-site

Pattern: one service that does the work; multiple call sites that invoke it; the service deduplicates / debounces internally.

Applied here for major-draw status. Three callers (cron, webhook, helper) all hit the same `transitionMajorDraws()` — debounced to 5s per instance. Idempotent `updateMany` makes parallel execution safe.

Apply this pattern when you have time-driven state that any of several call sites might race to update.

## P2. Never-throw service with `Result` type

`major-draw-transition-service.ts` returns `TransitionResult` objects, never throws. Callers check `result.error` for soft failures. Prevents transition failures from blocking payments / cron / page rendering.

```ts
interface TransitionResult {
  completed: number;
  activated: number;
  frozen: number;
  skipped: boolean;
  error?: string;
}
```

## P3. HTTP-layer gate guards

`major-draw-gate-http.ts` is a route-handler-level guard that blocks API actions on a frozen / completed draw. Pattern: gate is a small helper that returns either `null` (proceed) or a `Response` (block); handlers early-return on non-null.

```ts
const gate = checkMajorDrawHttpGate(draw);
if (gate) return gate;
// proceed
```

## P4. Reverser modules

The "remove draw entries on refund" reverser ([remove-draw-entries.ts](../../src/utils/draws/remove-draw-entries.ts)) follows the [payment](../payment/) reverser-module pattern. One module per grant type, registered with `buildLedgerReversalSteps()`.

## P5. Public-formatted vs internal data

Public-facing endpoints (`/api/winners`, `/api/major-draw`) format winner data through `winner-name-formatter.ts` to drop PII. Internal endpoints (`/api/admin/winners/...`) use raw documents.

The formatter is the single place where the public/private boundary is enforced. Don't reach around it.

## P6. Observable queries (Atlas profiling)

The transition service adds query comments via `$comment` so Atlas profiler can identify them: `transitionMajorDraws::complete`, etc. Apply to any high-volume query that you may need to debug in production.

## P7. Connection-health checks throttled

`db.admin().ping()` is expensive in serverless. The transition service uses `mongoose.connection.readyState === 1` as the primary check, falling back to ping only if last ping was > 30s ago.

```ts
if (mongoose.connection.readyState !== 1) {
  if (Date.now() - lastPingAt > 30_000) {
    await mongoose.connection.db.admin().ping();
    lastPingAt = Date.now();
  }
}
```

Adopt for any other hot-path Mongo health check.
