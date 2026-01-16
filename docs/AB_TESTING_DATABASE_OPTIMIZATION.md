# A/B Testing Database Optimization

## Overview

This document explains the database optimization strategy for A/B testing events to prevent database bloat and ensure optimal performance at scale.

---

## Problem Statement

### Original Approach (Individual Events)

**Storage Pattern:**
- Every page view = 1 document
- Every click = 1 document
- Every conversion = 1 document
- Every purchase = 1 document

**Scale Example:**
- 1,000 page views/day = 30,000 documents/month
- 100 clicks/day = 3,000 documents/month
- 10 purchases/day = 300 documents/month
- **Total: ~33,300 documents/month per experiment**

**Issues:**
- Database bloat: Millions of documents for multiple experiments
- Slow queries: Counting millions of documents
- High storage costs
- Performance degradation over time

---

## Optimized Approach (Daily Aggregation)

### Storage Pattern

**Individual Events (Recent Only):**
- Kept for **30 days** for debugging and real-time accuracy
- Automatically deleted after aggregation
- TTL index ensures automatic cleanup

**Daily Aggregated Metrics:**
- One document per experiment/variant/date
- Contains pre-aggregated counts
- Stored permanently for historical analysis

**Scale Example:**
- 1 experiment with 2 variants = 2 documents/day
- 30 days = 60 documents/month
- **99% reduction in storage** compared to individual events

---

## Architecture

### Data Flow

```
User Action (Page View, Click, Purchase)
  ↓
Individual Event Created (ExperimentEvent)
PaymentEvent Created (with experimentId/variantId)
  ↓
[Real-time queries use individual events + PaymentEvents for last 30 days]
  ↓
Daily Cron Job (3:00 AM UTC)
  ↓
Aggregate Events → Daily Metrics (ExperimentDailyMetrics)
Aggregate Revenue from PaymentEvents → Daily Metrics.revenue
  ↓
Delete Old Events (>30 days)
[Historical queries use ExperimentDailyMetrics including revenue]
```

### Models

#### 1. ExperimentEvent (Individual Events)
- **Purpose**: Real-time tracking, debugging
- **Retention**: 30 days (TTL index)
- **Use Case**: Recent data queries, debugging

#### 2. ExperimentDailyMetrics (Aggregated Metrics)
- **Purpose**: Historical analysis, efficient queries
- **Retention**: Permanent
- **Use Case**: Analytics, reporting, dashboards

---

## Implementation Details

### Daily Aggregation Cron Job

**Schedule**: Daily at 3:00 AM UTC (`0 3 * * *`)  
**Endpoint**: `/api/cron/ab-testing-aggregate-metrics`

**Process:**
1. Aggregates yesterday's events
2. Creates/updates daily metrics documents
3. Deletes events older than 30 days
4. Handles revenue aggregation from PaymentEvents

**Benefits:**
- Runs during low-traffic hours
- Processes previous day (complete data)
- Atomic operations (thread-safe)
- Automatic cleanup

### Query Strategy (Hybrid Approach)

**Recent Data (Last 30 Days):**
- Uses individual `ExperimentEvent` documents for event counts
- Queries `PaymentEvents` directly for revenue (real-time accuracy)
- Fast queries (indexed, recent data)

**Historical Data (Older than 30 Days):**
- Uses aggregated `ExperimentDailyMetrics` for all metrics including revenue
- Pre-aggregated (fast queries)
- 99% storage reduction
- Revenue comes from pre-aggregated daily metrics

**Split Date Ranges (Spanning Both Recent and Historical):**
- Combines both data sources
- Historical metrics from `ExperimentDailyMetrics`
- Recent metrics from individual events and `PaymentEvents`
- Revenue summed from both sources

**Implementation:**
```typescript
// Automatically chooses best data source
if (dateRange.endDate < thirtyDaysAgo) {
  // Use aggregated metrics (fast) - includes revenue
  return ExperimentDailyMetricsRepository.getAggregatedMetrics(...)
} else if (dateRange.startDate < thirtyDaysAgo) {
  // Split range: combine historical + recent
  const historical = ExperimentDailyMetricsRepository.getAggregatedMetrics(...)
  const recent = ExperimentEvent.aggregate([...]) + PaymentEvents query
  return combine(historical, recent)
} else {
  // Use individual events (real-time) + PaymentEvents for revenue
  return ExperimentEvent.aggregate([...]) + PaymentEvents query
}
```

---

## Storage Comparison

### Before Optimization

**1 Experiment, 2 Variants, 30 Days:**
- Page views: 30,000 events
- Clicks: 3,000 events
- Conversions: 300 events
- Purchases: 300 events
- **Total: ~33,600 documents**

**Storage**: ~10-15 MB per experiment per month

### After Optimization

**1 Experiment, 2 Variants, 30 Days:**
- Individual events (last 30 days): ~33,600 documents
- Daily metrics (permanent): 60 documents
- **After 30 days**: Only 60 documents remain

**Storage**: ~50 KB per experiment per month (99% reduction)

---

## Performance Benefits

### Query Performance

**Before (Individual Events):**
- Count 30,000 documents: ~500-1000ms
- Complex aggregations: ~2000-5000ms
- Index size: Large

**After (Aggregated Metrics):**
- Sum 30 daily metrics: ~10-50ms
- Pre-aggregated data: No computation needed
- Index size: Minimal

### Scalability

**Before:**
- 10 experiments = 336,000 documents/month
- 100 experiments = 3,360,000 documents/month
- Database growth: Linear, unbounded

**After:**
- 10 experiments = 600 documents/month
- 100 experiments = 6,000 documents/month
- Database growth: Constant, bounded

---

## Best Practices

### 1. Event Tracking
- ✅ Track all events (page views, clicks, conversions, purchases)
- ✅ Use atomic operations for thread-safety
- ✅ Don't worry about volume (events are temporary)

### 2. Aggregation
- ✅ Run daily (not real-time) to avoid overhead
- ✅ Process previous day (complete data)
- ✅ Handle errors gracefully (non-blocking)

### 3. Query Strategy
- ✅ Use aggregated metrics for historical data
- ✅ Use individual events for recent data (last 30 days)
- ✅ Let the repository choose automatically

### 4. Monitoring
- ✅ Monitor aggregation cron job success
- ✅ Check TTL index is working (events deleted after 30 days)
- ✅ Verify aggregated metrics match individual events

---

## Industry Comparison

### How Other Platforms Handle This

**Google Optimize:**
- Uses aggregated metrics
- Individual events not stored long-term
- Daily/hourly aggregation

**Optimizely:**
- Event streaming → Real-time aggregation
- Individual events kept for 7-30 days
- Pre-aggregated metrics for analytics

**VWO:**
- Daily aggregation
- Individual events for debugging only
- Historical data in aggregated format

**Our Approach:**
- ✅ Matches industry best practices
- ✅ Hybrid approach (best of both worlds)
- ✅ Automatic cleanup (TTL indexes)

---

## Migration Strategy

### For Existing Data

If you have existing events in the database:

1. **Run aggregation manually:**
   ```bash
   # Trigger aggregation for all historical data
   POST /api/cron/ab-testing-aggregate-metrics
   ```

2. **Verify aggregation:**
   - Check `ExperimentDailyMetrics` collection
   - Compare counts with individual events
   - Ensure revenue is aggregated correctly

3. **Clean up old events:**
   - Events older than 30 days can be safely deleted
   - TTL index will handle future cleanup automatically

---

## Monitoring & Maintenance

### Health Checks

1. **Aggregation Cron Job:**
   - Check logs: `/api/cron/ab-testing-aggregate-metrics`
   - Verify events are being aggregated
   - Ensure old events are being deleted

2. **TTL Index:**
   - Verify index exists: `db.experimentevents.getIndexes()`
   - Check expiration: Events should disappear after 30 days
   - Monitor index performance

3. **Storage Growth:**
   - Monitor `ExperimentEvent` collection size
   - Should stabilize at ~30 days of data
   - `ExperimentDailyMetrics` should grow linearly (1 doc per variant per day)

### Troubleshooting

**Issue: Events not being deleted**
- Check TTL index exists and is active
- Verify timestamp field is being set correctly
- MongoDB TTL runs every 60 seconds (may be delayed)

**Issue: Aggregation missing data**
- Check cron job logs for errors
- Verify date normalization (UTC, start of day)
- Compare aggregated vs individual event counts

**Issue: Slow queries**
- Check if using aggregated metrics for historical data
- Verify indexes are being used
- Consider adding additional indexes if needed

---

## Summary

### Key Benefits

1. **99% Storage Reduction**: From millions to thousands of documents
2. **Faster Queries**: Pre-aggregated data vs counting millions
3. **Scalable**: Constant growth rate, not linear
4. **Industry Standard**: Matches best practices from major platforms
5. **Automatic Cleanup**: TTL indexes handle old event deletion

### Trade-offs

1. **Recent Data Only**: Individual events kept for 30 days
2. **Aggregation Delay**: Daily aggregation (not real-time)
3. **Unique Visitors**: Approximation for historical data (exact for recent)

### Recommendation

✅ **This is the optimal approach** for production A/B testing systems. It balances:
- Real-time accuracy (recent events)
- Historical efficiency (aggregated metrics)
- Database performance (minimal storage)
- Industry best practices (proven approach)

---

**Last Updated**: January 2025  
**Maintained By**: Development Team

