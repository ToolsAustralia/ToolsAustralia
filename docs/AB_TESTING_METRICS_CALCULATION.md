# A/B Testing Metrics Calculation Guide

## Overview

This document explains how CTR (Click-Through Rate) and Conversion Rate are calculated in the A/B testing system, ensuring accurate and consistent metrics across all experiments.

---

## Metrics Definitions

### 1. CTR (Click-Through Rate)

**Formula:**
```
CTR = (Clicks / Page Views) × 100
```

**What it measures:**
- Percentage of visitors who clicked the CTA (Call-to-Action) button
- Measures engagement with the hero section CTA

**How it's tracked:**
- **Clicks**: Tracked when user clicks the hero CTA button (`PromoHero.tsx`)
- **Page Views**: Tracked automatically when user visits the promotion page
- Event type: `"click"` in `ExperimentEvent` collection

**Example:**
- 1000 page views
- 50 clicks
- CTR = (50 / 1000) × 100 = **5%**

---

### 2. Conversion Rate

**Formula:**
```
Conversion Rate = ((Conversions + Purchases) / Page Views) × 100
```

**What it measures:**
- Percentage of visitors who completed a conversion (purchase or other conversion action)
- Purchases are automatically counted as conversions

**How it's tracked:**
- **Conversions**: Tracked as `"conversion"` events in `ExperimentEvent` collection
- **Purchases**: Tracked as both `"purchase"` and `"conversion"` events when a purchase completes
- **Page Views**: Tracked automatically when user visits the promotion page

**Important Notes:**
- Purchases are **automatically counted as conversions** (no need to track separately)
- When a purchase happens, the system tracks:
  1. A `"purchase"` event (for purchase-specific metrics)
  2. A `"conversion"` event (for conversion rate calculation)
- This ensures purchases are included in conversion rate calculations

**Example:**
- 1000 page views
- 5 conversions (non-purchase)
- 10 purchases
- Conversion Rate = ((5 + 10) / 1000) × 100 = **1.5%**

---

## Event Types

The system tracks the following event types in the `ExperimentEvent` collection:

1. **`page_view`**: User visits the promotion page
2. **`click`**: User clicks the hero CTA button
3. **`conversion`**: User completes a conversion (includes purchases)
4. **`purchase`**: User completes a purchase (also tracked as conversion)
5. **`lead`**: User submits a lead form (if applicable)
6. **`other`**: Other custom events

---

## Data Flow

### Page View Tracking
```
User visits /promotions/[slug]
  ↓
Server-side: getServerVariantAssignment() assigns variant
  ↓
Client-side: VariantAssignmentWrapper tracks page_view event
  ↓
Stored in ExperimentEvent collection
```

### Click Tracking
```
User clicks hero CTA button
  ↓
PromoHero.tsx: handleEnterNow() called
  ↓
trackEvent(experimentId, variantId, "click", {...})
  ↓
POST /api/ab-testing/track
  ↓
Stored in ExperimentEvent collection
```

### Purchase/Conversion Tracking
```
User completes purchase
  ↓
grantBenefits() called (payment-processing.ts)
  ↓
trackPixelPurchase() called with experimentId & variantId
  ↓
Tracks BOTH:
  1. "purchase" event → ExperimentEvent collection
  2. "conversion" event → ExperimentEvent collection
  ↓
Both events stored for analytics
```

---

## Calculation Implementation

### Analytics Service (`ExperimentAnalyticsService.ts`)

```typescript
// Get aggregated events
const events = await ExperimentEventRepository.aggregateEvents(
  experimentId, 
  variantId, 
  dateRange
);

// Calculate CTR
const ctr = events.pageViews > 0 
  ? (events.clicks / events.pageViews) * 100 
  : 0;

// Calculate Conversion Rate (includes purchases)
const totalConversions = events.conversions + events.purchases;
const conversionRate = events.pageViews > 0 
  ? (totalConversions / events.pageViews) * 100 
  : 0;
```

### Event Aggregation (`ExperimentEventRepository.ts`)

The repository aggregates events by:
- Counting `page_view` events → `pageViews`
- Counting `click` events → `clicks`
- Counting `conversion` events → `conversions`
- Counting `purchase` events → `purchases`
- Counting unique visitors (distinct `userId` or `anonymousId`) → `uniqueVisitors`

---

## Important Notes

### 1. Purchases Count as Conversions
- **Always**: When a purchase happens, it's tracked as both `"purchase"` and `"conversion"`
- **Why**: Purchases are the primary conversion goal, so they must be included in conversion rate
- **Implementation**: `trackPixelPurchase()` automatically tracks both event types

### 2. CTR vs Conversion Rate
- **CTR**: Measures engagement (how many clicked the CTA)
- **Conversion Rate**: Measures success (how many completed a purchase/conversion)
- **Relationship**: CTR is typically higher than conversion rate (not everyone who clicks converts)

### 3. Unique Visitors
- Calculated using distinct `userId` (logged-in users) or `anonymousId` (anonymous users)
- Used for metrics like Revenue per User
- Ensures accurate per-user calculations

### 4. Date Range Filtering
- All metrics can be filtered by date range
- Useful for analyzing specific time periods
- Default: All time (no date range)

---

## Example Scenarios

### Scenario 1: Basic Funnel
```
1000 page views
  ↓ (5% CTR)
50 clicks
  ↓ (2% conversion rate)
15 conversions (10 purchases + 5 other conversions)

Metrics:
- CTR: 5%
- Conversion Rate: 1.5%
- Revenue: $500 (from 10 purchases at $50 each)
- Revenue per User: $0.50 (500 / 1000)
```

### Scenario 2: High Engagement, Low Conversion
```
500 page views
  ↓ (20% CTR)
100 clicks
  ↓ (1% conversion rate)
5 conversions (all purchases)

Metrics:
- CTR: 20% (high engagement)
- Conversion Rate: 1% (low conversion)
- This suggests the CTA is compelling but the purchase flow needs improvement
```

### Scenario 3: Low Engagement, High Conversion
```
1000 page views
  ↓ (2% CTR)
20 clicks
  ↓ (50% conversion rate)
10 conversions (all purchases)

Metrics:
- CTR: 2% (low engagement)
- Conversion Rate: 1% (10 / 1000)
- Click-to-Conversion Rate: 50% (10 / 20)
- This suggests the CTA needs improvement, but those who click are highly likely to convert
```

---

## Verification

To verify calculations are correct:

1. **Check Event Counts**:
   - Query `ExperimentEvent` collection directly
   - Count events by type: `page_view`, `click`, `conversion`, `purchase`
   - Verify counts match dashboard

2. **Manual Calculation**:
   - Get raw event counts from database
   - Calculate: `CTR = (clicks / pageViews) × 100`
   - Calculate: `Conversion Rate = ((conversions + purchases) / pageViews) × 100`
   - Compare with dashboard metrics

3. **Test Purchase Flow**:
   - Make a test purchase
   - Verify both `purchase` and `conversion` events are created
   - Check that conversion rate increases

---

## Troubleshooting

### Issue: CTR is 0%
**Possible Causes:**
- CTA clicks not being tracked
- Check `PromoHero.tsx` - ensure `trackEvent()` is called on click
- Verify experiment is active
- Check browser console for tracking errors

### Issue: Conversion Rate is 0% despite purchases
**Possible Causes:**
- Purchase events not being tracked
- Check `trackPixelPurchase()` - ensure `experimentId` and `variantId` are passed
- Verify purchase tracking in `payment-processing.ts`
- Check that both `purchase` and `conversion` events are created

### Issue: Metrics don't match expected values
**Possible Causes:**
- Date range filtering applied
- Events tracked to wrong variant
- Preview mode affecting counts (preview events are marked but may be excluded)
- Check event timestamps match date range

---

## Best Practices

1. **Always verify tracking**: Test clicks and purchases to ensure events are being tracked
2. **Monitor event counts**: Regularly check raw event counts in database
3. **Use date ranges**: Filter metrics by date range for accurate analysis
4. **Check for duplicates**: Ensure events aren't being tracked multiple times
5. **Validate calculations**: Manually verify calculations match dashboard

---

## Summary

- **CTR** = (Clicks / Page Views) × 100
- **Conversion Rate** = ((Conversions + Purchases) / Page Views) × 100
- **Purchases** are automatically counted as conversions
- **Clicks** are tracked when users click the hero CTA button
- **All events** are stored in `ExperimentEvent` collection
- **Metrics** are calculated in real-time from event aggregations

---

**Last Updated**: January 2025  
**Maintained By**: Development Team

