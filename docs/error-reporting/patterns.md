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

## P5. HTTP rejection logging (route handlers)

Three helpers work together to capture non-thrown early returns from API routes without blocking the response.

### `classifyHttpRejection(status, { hasBusinessCode })`

`src/utils/error-reporting/http-rejection-severity.ts`

Determines whether to capture and at what severity:
- `< 400` — skip (not an error)
- `401 / 403 / 404 / 429` — skip (routine gate noise)
- other `4xx` with a business `code` — capture as **medium**
- other `4xx` without a `code` — skip (generic noise)
- `5xx` — capture as **high**

### `ErrorLoggingService.logHttpRejection({ status, request, code?, message?, category?, httpMethod?, context? })`

`src/services/error-reporting/ErrorLoggingService.ts`

Server-side, fire-and-forget. Applies the capture policy above and writes an `ErrorReport` row. Forces severity from the status — never calls `detectCategoryAndSeverity` (which escalates `payment` to `critical`).

### `rejectAndLog(request, status, body, context?)`

`src/utils/error-reporting/reject-and-log.ts`

Convenience wrapper for route handlers. Returns `NextResponse.json(body, { status })` AND calls `logHttpRejection` via `void` (non-blocking). Defaults `category` to `"payment"`.

```ts
return rejectAndLog(request, 409, { error: "Subscription already exists", code: "EXISTING_SUBSCRIPTION" }, { userId, packageId });
```

**Rule:** use `rejectAndLog` ONLY at non-thrown early returns. `catch` blocks already auto-log thrown errors — do NOT also call `rejectAndLog` there or you will produce duplicate rows.
