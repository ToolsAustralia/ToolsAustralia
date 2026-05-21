# Error Reporting — Patterns

## P1. Capture-classify-report

```ts
try {
  // ...
} catch (e) {
  const classified = classifyError(e);
  reportError({
    code: classified.code,
    severity: classified.severity,
    context: { userId, route, ... },
    cause: e,
  });
  throw classified.userFacing ?? e;
}
```

## P2. Recovery hooks for known states

`useErrorRecovery()` knows about specific error codes that have user-actionable recovery (e.g. retry payment, re-login). Components just invoke the hook with the error and get a recovery action.

## P3. Severity tiers

- `low` — log only, user shouldn't see anything
- `medium` — log + maybe show toast
- `high` — log + show recovery UI
- `critical` — log + alert (separate channel)

> _TODO: confirm exact tiers used in this codebase._

## P4. Error classes per domain

Each major domain has its own error class extending `AppError` (e.g. `SubscriptionReferenceError`, `PaymentError`). The class carries the typed `code` field for dispatch.
