# MongoDB Connection Best Practices

This document outlines best practices for using MongoDB connections in this application to prevent connection errors and ensure optimal performance.

## Connection Pool Configuration

### Current Settings (M10 Tier)

- **maxPoolSize**: 30 connections
- **minPoolSize**: 3 connections (maintains warm connections)
- **maxConnecting**: 10 concurrent connection attempts
- **maxIdleTimeMS**: 30 seconds (closes idle connections)

### Why These Settings?

- M10 tier supports 1500 connections per node
- Pool size of 30 provides buffer for:
  - 5 concurrent syncs × 2-3 queries = 10-15 connections
  - Other operations (cron jobs, API routes, webhooks)
  - Room for growth

## Best Practices

### 1. Use Caching for Repeated Queries

**Problem**: Fetching the same data multiple times creates unnecessary database queries.

**Solution**: Cache query results when processing multiple items.

**Example**:
```typescript
// ❌ BAD: Fetches draw data for every user (1000+ queries)
for (const user of users) {
  const drawInfo = await getTargetDrawForCalculation(); // 2 queries per user
  await syncUser(user);
}

// ✅ GOOD: Fetch once, reuse for all users (1 query)
const drawInfo = await getTargetDrawForCalculation(); // 2 queries total
for (const user of users) {
  await syncUser(user, drawInfo.targetDraw, drawInfo.cutoffDate);
}
```

### 2. Use `lean()` for Read-Only Queries

**Problem**: Mongoose documents consume more memory and create overhead.

**Solution**: Use `.lean()` for queries that only read data.

**Example**:
```typescript
// ❌ BAD: Returns Mongoose documents (more memory)
const users = await User.find({}).limit(1000);

// ✅ GOOD: Returns plain JavaScript objects (less memory)
const users = await User.find({}).limit(1000).lean();
```

### 3. Process in Reasonable Batch Sizes

**Problem**: Processing too many items at once exhausts the connection pool.

**Solution**: Process in batches of 100-200 items.

**Example**:
```typescript
// ❌ BAD: Processes 1000 items at once
const users = await User.find({}).limit(1000);
for (const user of users) {
  await processUser(user);
}

// ✅ GOOD: Processes in batches
const BATCH_SIZE = 200;
let skip = 0;
while (true) {
  const batch = await User.find({}).skip(skip).limit(BATCH_SIZE).lean();
  if (batch.length === 0) break;
  
  for (const user of batch) {
    await processUser(user);
  }
  
  skip += BATCH_SIZE;
  await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between batches
}
```

### 4. Check Pool Availability Before Bulk Operations

**Problem**: Starting bulk operations when pool is near capacity causes failures.

**Solution**: Check pool capacity and wait if needed.

**Example**:
```typescript
import { waitForPoolCapacity } from "@/utils/database/connection-health";

// Wait for pool capacity before starting
const hasCapacity = await waitForPoolCapacity(80, 10000); // Wait up to 10s for <80% utilization
if (!hasCapacity) {
  console.warn("Pool still near capacity, proceeding anyway");
}

// Start bulk operation
await processBulkOperation();
```

### 5. Use `Promise.allSettled()` for Resilience

**Problem**: `Promise.all()` fails fast if any promise rejects.

**Solution**: Use `Promise.allSettled()` to handle errors gracefully.

**Example**:
```typescript
// ❌ BAD: Fails if any user sync fails
await Promise.all(users.map(user => syncUser(user)));

// ✅ GOOD: Continues even if some fail
const results = await Promise.allSettled(users.map(user => syncUser(user)));
results.forEach((result, index) => {
  if (result.status === 'rejected') {
    console.error(`User ${users[index].email} failed:`, result.reason);
  }
});
```

### 6. Add Delays Between Batches

**Problem**: Rapid-fire queries can overwhelm the connection pool.

**Solution**: Add small delays between batches.

**Example**:
```typescript
const BATCH_SIZE = 200;
const BATCH_DELAY_MS = 2000; // 2 seconds

for (let i = 0; i < users.length; i += BATCH_SIZE) {
  const batch = users.slice(i, i + BATCH_SIZE);
  await processBatch(batch);
  
  // Add delay between batches (except last batch)
  if (i + BATCH_SIZE < users.length) {
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
  }
}
```

## Connection Health Monitoring

### Check Connection Health

```typescript
import { checkConnectionHealth } from "@/utils/database/connection-health";

const health = await checkConnectionHealth();
if (!health.healthy) {
  console.error("Connection unhealthy:", health.error);
}
```

### Monitor Pool Metrics

```typescript
import { getConnectionMetrics } from "@/lib/mongodb";

const metrics = getConnectionMetrics();
if (metrics) {
  console.log(`Pool: ${metrics.active}/${metrics.maxPoolSize} active`);
  console.log(`Utilization: ${(metrics.active / metrics.maxPoolSize * 100).toFixed(1)}%`);
}
```

## Error Handling

### SSL/TLS Errors

The connection system automatically retries SSL/TLS errors with exponential backoff:
- Attempt 1: Immediate
- Attempt 2: Wait 1 second
- Attempt 3: Wait 2 seconds
- Attempt 4: Wait 4 seconds

### Circuit Breaker

After 5 consecutive connection failures, the circuit breaker opens and blocks connection attempts for 30 seconds to prevent cascading failures.

## Code Review Checklist

When reviewing code that performs bulk database operations:

- [ ] Uses caching for repeated queries
- [ ] Processes in reasonable batch sizes (100-200)
- [ ] Has error handling and retries
- [ ] Checks connection pool availability before starting
- [ ] Uses `lean()` for read-only operations
- [ ] Uses `Promise.allSettled()` instead of `Promise.all()` for resilience
- [ ] Adds delays between batches for large operations
- [ ] Logs connection pool metrics for monitoring

## Troubleshooting

### Connection Pool Exhausted

**Symptoms**: `MongoServerSelectionError`, `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`

**Solutions**:
1. Check if bulk operations are running simultaneously
2. Reduce batch sizes
3. Add delays between batches
4. Check for connection leaks (connections staying open > 5 minutes)

### SSL/TLS Errors

**Symptoms**: `ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR`

**Solutions**:
1. Connection system automatically retries with exponential backoff
2. Check MongoDB Atlas status
3. Verify network connectivity
4. Check if connection pool is exhausted (causes SSL handshake failures)

### Connection Leaks

**Symptoms**: Connections staying open for extended periods

**Solutions**:
1. Check development logs for warnings about long-lived connections
2. Ensure connections are properly closed after operations
3. Review code for operations that hold connections unnecessarily

## Performance Tips

1. **Index Optimization**: Ensure queries use indexes to reduce query time
2. **Projection**: Use `.select()` to fetch only needed fields
3. **Aggregation**: Use aggregation pipelines for complex queries instead of multiple queries
4. **Connection Reuse**: The connection is cached globally - don't create new connections

## Environment Variables

- `MONGODB_MAX_POOL`: Override default pool size (default: 30 for M10 tier)
- `MONGODB_URI`: MongoDB connection string (required)

## Monitoring

Monitor connection pool metrics in production:
- Active connections vs max pool size
- Pool utilization percentage
- Wait queue length
- Connection errors

Set up alerts for:
- Pool utilization > 80%
- SSL/TLS error rate > 5%
- Connection failures > 10 per minute
