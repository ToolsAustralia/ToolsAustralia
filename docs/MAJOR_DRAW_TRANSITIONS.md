# Major Draw Status Transitions

## Overview

Major draw status transitions (completed, activated, frozen) are handled by a dedicated service architecture that follows best practices for separation of concerns, reliability, and maintainability.

## Architecture

### Transition Service

The core transition logic is implemented in `src/utils/draws/major-draw-transition-service.ts`.

**Key Features:**
- **Idempotent operations**: Safe to call multiple times
- **Timeout protection**: All operations use `maxTimeMS: 5000` to prevent hanging
- **Debouncing**: Prevents stampede during webhook bursts (5-second window per instance)
- **Connection health checks**: Verifies MongoDB connection before operations
- **Observable**: Query comments added for MongoDB Atlas profiling
- **Never throws**: Always returns result object for graceful degradation

### Service Call Sites

The transition service is called from three locations:

1. **Cron Job** (`src/app/api/cron/major-draw-transition/route.ts`)
   - Primary scheduler - runs daily at 1:30 PM UTC
   - Ensures transitions occur even during low-traffic periods
   - Also handles Klaviyo resets, draw creation, and cleanup

2. **Webhook Handler** (`src/app/api/stripe/webhook/route.ts`)
   - Called before `getTargetMajorDraw()` in payment processing
   - Ensures draw statuses are fresh before allocating entries
   - Non-blocking - errors don't prevent payment processing

3. **Helper Function** (`src/utils/draws/major-draw-helpers.ts`)
   - Called at the start of `getTargetMajorDraw()`
   - Ensures transitions happen before draw selection
   - Debouncing prevents excessive calls

## Transition Logic

The service performs three atomic operations in parallel:

1. **Complete Draws**: Transitions `active`/`frozen` → `completed` when `drawDate <= now`
2. **Activate Draws**: Transitions `queued` → `active` when `activationDate <= now`
3. **Freeze Draws**: Transitions `active` → `frozen` when `freezeEntriesAt <= now` and `drawDate > now`

All operations use `updateMany` with proper filters to ensure idempotency.

## Debouncing

The service implements debouncing to prevent excessive transitions during webhook bursts:

- **Window**: 5 seconds (configurable)
- **Scope**: Per lambda instance (best-effort, not distributed)
- **Behavior**: If called within 5 seconds of last execution, returns immediately with `skipped: true`

**Why this is acceptable:**
- Operations are idempotent (safe to run multiple times)
- Cron job serves as authoritative fallback
- Parallel execution is safe (updateMany is atomic)
- Prevents connection pool exhaustion during traffic spikes

**Future enhancement**: For stricter coordination, consider Redis lock or MongoDB lease document.

## Connection Health Checks

The service verifies MongoDB connection health before operations:

1. **Primary check**: `mongoose.connection.readyState === 1` (fast, no network call)
2. **Secondary check**: `db.admin().ping()` (throttled to once per 30 seconds)

**Rationale**: Ping is expensive in serverless environments. The service relies primarily on readyState check and only pings if last ping was > 30 seconds ago.

## Error Handling

The service never throws errors. Instead, it returns a result object:

```typescript
interface TransitionResult {
  success: boolean;
  completed: number;
  activated: number;
  frozen: number;
  skipped: boolean;
  duration: number;
  error?: string;
  connectionState?: {
    readyState: number;
    pinged: boolean;
  };
}
```

This allows callers to:
- Continue processing even if transitions fail
- Log errors for monitoring
- Rely on cron job as fallback

## Observability

All transition operations include query comments for MongoDB Atlas profiling:

```typescript
await MajorDrawModel.updateMany(
  filter,
  update,
  { maxTimeMS: 5000, comment: "major-draw-transition" }
);
```

This makes it easy to:
- Track transition frequency in MongoDB Atlas
- Identify slow queries
- Monitor transition patterns

## Why Not Middleware?

The previous implementation used `pre(/^find/)` middleware to trigger transitions on every read query. This was removed because:

1. **Architectural anti-pattern**: Performing writes in read query hooks
2. **Performance**: Unnecessary writes on every `findOne()` call
3. **Reliability**: No timeout protection, could hang during connection issues
4. **Maintainability**: Business logic hidden in query hooks
5. **Serverless inefficiency**: Wastes connection pool resources

The new service-based approach:
- Explicit invocation (clear call sites)
- Proper timeout protection
- Better error handling
- Easier to test and maintain
- Follows single responsibility principle

## Troubleshooting

### Transitions Not Occurring

1. **Check cron job logs**: Verify cron job is running successfully
2. **Check service logs**: Look for connection errors or timeout issues
3. **Verify connection**: Ensure MongoDB connection is healthy
4. **Check debouncing**: If called frequently, debouncing may skip executions

### Timeout Errors

1. **Check MongoDB connection**: Verify connection pool is healthy
2. **Check query performance**: Use MongoDB Atlas profiling to identify slow queries
3. **Review connection settings**: Check `maxTimeMS` and connection pool size

### Duplicate Transitions

This should not occur because:
- Operations are idempotent (updateMany with filters)
- Debouncing prevents rapid successive calls
- Cron job serves as single authoritative scheduler

If duplicates are observed, check:
- Multiple cron job instances running
- Service called from unexpected locations
- Database connection issues causing retries

## Future Enhancements

### Circuit Breaker Pattern

If 5 failures occur in 1 minute, skip transitions for 1 minute to prevent cascading failures during MongoDB outages.

### Distributed Debouncing

Replace module-level debounce with Redis lock or MongoDB lease document for stricter global coordination.

### Monitoring

Add metrics tracking:
- Transition frequency
- Success/failure rates
- Average duration
- Connection health status

## Related Files

- `src/utils/draws/major-draw-transition-service.ts` - Transition service implementation
- `src/models/MajorDraw.ts` - Major draw model (middleware removed)
- `src/app/api/cron/major-draw-transition/route.ts` - Cron job scheduler
- `src/app/api/stripe/webhook/route.ts` - Webhook handler integration
- `src/utils/draws/major-draw-helpers.ts` - Helper function integration
