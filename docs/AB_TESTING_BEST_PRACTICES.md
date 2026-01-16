# A/B Testing Best Practices & Implementation Guide

## Overview

This document outlines best practices for A/B testing implementation, tracking accuracy, and data integrity. It addresses common issues and provides recommendations for seamless integration.

---

## 1. Visitor Tracking & Deduplication

### Current Implementation

**Unique Visitors Calculation:**
- **Recent Data (<30 days)**: Uses MongoDB `$addToSet` aggregation to count distinct `userId` or `anonymousId` values from `page_view` events. This provides accurate unique visitor counts.
- **Historical Data (>30 days)**: Uses `$max` of daily unique visitor counts as an approximation. This is a limitation because:
  - A user visiting on Day 1 and Day 2 may be counted twice
  - For precise analytics, always query recent data (<30 days)

**Deduplication Strategy:**
- **Page Views**: Prevented within 1 minute window (handles page refreshes)
- **Clicks**: Prevented within 5 seconds window (handles double-clicks)
- **Purchases/Conversions**: Prevented by unique compound index on `(experimentId, variantId, eventType, metadata.orderId)`

### Best Practices

✅ **DO:**
- Use recent data (<30 days) for accurate unique visitor counts
- Rely on the built-in deduplication for page views, clicks, and purchases
- Use `anonymousId` cookies for anonymous user tracking
- Merge anonymous assignments to `userId` when user logs in

❌ **DON'T:**
- Manually track page views without using the `/api/ab-testing/assign` endpoint
- Create duplicate events by calling tracking endpoints multiple times
- Rely on historical unique visitor counts for precise analytics

---

## 2. Conversion & Purchase Tracking

### Current Implementation

**Event Types:**
- **`purchase`**: Specific purchase events (tracked separately)
- **`conversion`**: Any conversion including purchases (tracked separately)
- **Both events are created for each purchase** to provide flexibility in reporting

**Conversion Rate Calculation:**
```typescript
// ✅ CORRECT: Use only "conversion" events (they already include purchases)
conversionRate = (conversions / pageViews) * 100

// ❌ INCORRECT: Don't add purchases + conversions (double-counting)
conversionRate = ((conversions + purchases) / pageViews) * 100
```

### Best Practices

✅ **DO:**
- Use `conversions` for conversion rate (includes purchases)
- Use `purchases` if you need purchase-specific metrics
- Both events use the same `orderId` for deduplication

❌ **DON'T:**
- Add `conversions + purchases` together (double-counting)
- Track conversions without `orderId` (breaks deduplication)

---

## 3. Revenue Tracking

### Current Implementation

**Revenue Sources:**
- **Recent Data (<30 days)**: Fetched from `PaymentEvent` collection
  - Query: `PaymentEvent.find({ experimentId, variantId, eventType: "BenefitsGranted" })`
  - Sum: `event.data.price` for all matching events
- **Historical Data (>30 days)**: Fetched from `ExperimentDailyMetrics` collection
  - Pre-aggregated daily revenue sums

**Revenue Attribution:**
- Revenue is attributed to variants via `experimentId` and `variantId` stored in `PaymentEvent`
- These IDs are captured at payment creation time (from Stripe metadata)
- Fallback: Lookup from `VariantAssignment` if not in metadata

### Best Practices

✅ **DO:**
- Store `experimentId` and `variantId` in Stripe PaymentIntent/Subscription metadata at creation
- Extract from metadata in webhook handlers (most reliable)
- Validate price data (must be number, not NaN, >= 0)

❌ **DON'T:**
- Track subscription renewals as revenue (they're automatic, not ad-driven)
- Rely solely on assignment lookup (metadata is more reliable)
- Count revenue without validating price data

---

## 4. Event Deduplication

### Implementation Details

**Page Views:**
```typescript
// Deduplication window: 1 minute
// Criteria: experimentId + variantId + userId/anonymousId + slug
// Prevents: Page refreshes, back button, duplicate API calls
```

**Clicks:**
```typescript
// Deduplication window: 5 seconds
// Criteria: experimentId + variantId + userId/anonymousId + element
// Prevents: Double-clicks, rapid button presses
```

**Purchases/Conversions:**
```typescript
// Deduplication: Database unique index
// Criteria: experimentId + variantId + eventType + metadata.orderId
// Prevents: Duplicate webhooks, retry attempts, race conditions
```

### Best Practices

✅ **DO:**
- Use the same `orderId` for both "purchase" and "conversion" events
- Rely on the built-in deduplication (don't implement your own)
- Return success for duplicate events (idempotent API)

❌ **DON'T:**
- Generate different `orderId` values for the same purchase
- Track events without proper deduplication checks
- Fail the request if a duplicate is detected (return success instead)

---

## 5. Variant Assignment & Attribution

### Current Implementation

**Assignment Strategy:**
- Uses consistent hashing for deterministic variant assignment
- Assignments persist in `VariantAssignment` collection
- Cookies store assignment as backup (`ta_ab_assignment_{experimentId}`)

**Attribution Flow:**
1. User visits promotion page → Assignment created/stored
2. User makes purchase → Extract `experimentId`/`variantId` from:
   - PaymentIntent metadata (preferred)
   - VariantAssignment lookup (fallback)
   - Assignment cookie (last resort)
3. Store in `PaymentEvent` for revenue tracking
4. Track purchase/conversion events with correct variant

### Best Practices

✅ **DO:**
- Store assignment in Stripe metadata at payment creation
- Auto-merge anonymous assignments to `userId` when user logs in
- Use metadata as primary source, lookup as fallback

❌ **DON'T:**
- Rely solely on assignment lookup (may fail for anonymous users)
- Change variant assignment after user is assigned
- Track purchases without proper variant attribution

---

## 6. Database Optimization

### Current Implementation

**Hybrid Approach:**
- **Recent Data (<30 days)**: Individual `ExperimentEvent` records (real-time accuracy)
- **Historical Data (>30 days)**: Pre-aggregated `ExperimentDailyMetrics` (99% storage reduction)

**Aggregation Process:**
- Daily cron job aggregates yesterday's events into `ExperimentDailyMetrics`
- Deletes individual events older than 30 days
- TTL index automatically cleans up old events

### Best Practices

✅ **DO:**
- Query recent data for real-time analytics
- Use historical data for reporting and trends
- Let the cron job handle aggregation (don't manually aggregate)

❌ **DON'T:**
- Query individual events for historical data (use daily metrics)
- Manually delete events (let TTL index handle it)
- Store events indefinitely (use aggregation)

---

## 7. Common Issues & Solutions

### Issue: Duplicate Visitors

**Symptoms:** Unique visitor count is higher than expected

**Causes:**
- User visits on multiple days (historical data uses `$max` approximation)
- Anonymous ID changes (cookie cleared, different device)
- User ID not merged from anonymous assignment

**Solutions:**
- Use recent data (<30 days) for accurate counts
- Ensure anonymous ID cookies persist (30-day expiration)
- Auto-merge anonymous assignments on login

---

### Issue: Double-Counted Conversions

**Symptoms:** Conversion rate is higher than expected

**Causes:**
- Adding `conversions + purchases` together (double-counting)
- Tracking conversion events without deduplication

**Solutions:**
- Use only `conversions` for conversion rate (includes purchases)
- Ensure `orderId` is used for deduplication
- Check that unique index is working (no duplicate orderIds)

---

### Issue: Revenue Not Attributed to Variant

**Symptoms:** Revenue shows as 0 or incorrect variant

**Causes:**
- `experimentId`/`variantId` not stored in PaymentEvent
- Metadata not extracted from Stripe webhook
- Assignment lookup fails for anonymous users

**Solutions:**
- Store assignment in Stripe metadata at payment creation
- Extract from metadata in webhook (preferred method)
- Use assignment cookie as fallback
- Add debug logging to trace attribution flow

---

### Issue: Inaccurate Unique Visitors (Historical)

**Symptoms:** Historical unique visitor counts seem wrong

**Causes:**
- Using `$max` approximation for multi-day ranges
- User visits on multiple days counted separately

**Solutions:**
- Use recent data (<30 days) for accurate counts
- Accept approximation for historical data (limitation of aggregation)
- Consider implementing a visitor tracking collection for precise historical counts

---

## 8. Testing & Validation

### Testing Checklist

✅ **Visitor Tracking:**
- [ ] Page refresh doesn't create duplicate page view
- [ ] Anonymous user gets consistent assignment
- [ ] Logged-in user assignment persists
- [ ] Unique visitor count is accurate for recent data

✅ **Conversion Tracking:**
- [ ] Purchase creates both "purchase" and "conversion" events
- [ ] Same purchase doesn't create duplicate events
- [ ] Conversion rate calculation is correct
- [ ] `orderId` is used for deduplication

✅ **Revenue Tracking:**
- [ ] Revenue is attributed to correct variant
- [ ] Revenue matches actual payment amounts
- [ ] Historical revenue is accurate
- [ ] Revenue per user calculation is correct

✅ **Deduplication:**
- [ ] Page views deduplicated within 1 minute
- [ ] Clicks deduplicated within 5 seconds
- [ ] Purchases deduplicated by orderId
- [ ] Duplicate events return success (idempotent)

---

## 9. Performance Considerations

### Query Optimization

- **Recent Data**: Use individual events (real-time, accurate)
- **Historical Data**: Use daily metrics (fast, efficient)
- **Split Ranges**: Combine both for date ranges spanning 30 days

### Index Usage

- `ExperimentEvent`: Indexes on `(experimentId, variantId, timestamp)`, `(experimentId, variantId, eventType, metadata.orderId)` (unique)
- `ExperimentDailyMetrics`: Index on `(experimentId, variantId, date)` (unique)
- `PaymentEvent`: Index on `(experimentId, variantId)`

---

## 10. Monitoring & Debugging

### Key Metrics to Monitor

- **Event Creation Rate**: Should match expected traffic
- **Deduplication Rate**: Percentage of duplicate events prevented
- **Revenue Attribution**: Percentage of revenue with valid variant attribution
- **Unique Visitor Accuracy**: Compare recent vs historical counts

### Debug Logging

Enable debug logging for:
- Variant assignment creation/retrieval
- Payment event creation with experiment/variant IDs
- Revenue calculation and attribution
- Deduplication checks and results

---

## Conclusion

Following these best practices ensures:
- ✅ Accurate visitor tracking (no duplicates)
- ✅ Correct conversion counting (no double-counting)
- ✅ Reliable revenue attribution (correct variant)
- ✅ Optimal database performance (hybrid approach)
- ✅ Seamless integration (no blocking errors)

For questions or issues, refer to the main documentation:
- `AB_TESTING_FEATURE.md` - Feature overview
- `AB_TESTING_DEDUPLICATION.md` - Deduplication details
- `AB_TESTING_DATABASE_OPTIMIZATION.md` - Database optimization
- `AB_TESTING_METRICS_CALCULATION.md` - Metrics calculation
