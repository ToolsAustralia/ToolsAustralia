# A/B Testing Event Deduplication

## Overview

This document explains how duplicate event tracking is prevented in the A/B testing system to ensure accurate metrics and prevent database bloat.

---

## Problem Statement

Without deduplication, the following scenarios could create duplicate events:

1. **Page Views**: User refreshes page multiple times → Multiple page view events
2. **Clicks**: User double-clicks CTA button → Multiple click events
3. **Purchases**: Payment webhook retries or duplicate calls → Multiple purchase/conversion events
4. **Conversions**: Same purchase tracked multiple times → Inflated conversion rates

---

## Deduplication Strategy

### 1. Page Views

**Deduplication Window**: 1 minute

**Logic**:
- Check if a page view event exists for the same user/anonymous ID + experiment + variant within the last 1 minute
- If found, skip tracking (idempotent)
- Allows legitimate page views after 1 minute (user navigates away and returns)

**Implementation**:
```typescript
// Check for recent page view
const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
const existingPageView = await ExperimentEvent.findOne({
  experimentId,
  variantId,
  eventType: "page_view",
  timestamp: { $gte: oneMinuteAgo },
  ...(userId ? { userId } : { anonymousId, userId: { $exists: false } }),
});
```

**Location**: 
- `/api/ab-testing/assign` (server-side page view tracking)
- `/api/ab-testing/track` (client-side page view tracking)

---

### 2. Clicks

**Deduplication Window**: 5 seconds

**Logic**:
- Check if a click event exists for the same user/anonymous ID + experiment + variant + element within the last 5 seconds
- If found, skip tracking (idempotent)
- Prevents accidental double-clicks while allowing legitimate repeated clicks

**Implementation**:
```typescript
// Check for recent click
const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
const existingClick = await ExperimentEvent.findOne({
  experimentId,
  variantId,
  eventType: "click",
  timestamp: { $gte: fiveSecondsAgo },
  ...(userId ? { userId } : { anonymousId, userId: { $exists: false } }),
  "metadata.element": element, // Optional: specific element clicked
});
```

**Location**: `/api/ab-testing/track`

---

### 3. Purchases & Conversions

**Deduplication Method**: Unique index on `orderId`

**Logic**:
- Each purchase/conversion event includes `orderId` in metadata
- Database enforces uniqueness: `(experimentId, variantId, eventType, metadata.orderId)`
- If duplicate orderId detected, database rejects insert (handled gracefully)

**Implementation**:
```typescript
// Unique compound index
ExperimentEventSchema.index(
  { 
    experimentId: 1, 
    variantId: 1, 
    eventType: 1,
    "metadata.orderId": 1 
  },
  { 
    unique: true, // CRITICAL: Enforce uniqueness
    partialFilterExpression: { 
      eventType: { $in: ["purchase", "conversion"] },
      "metadata.orderId": { $exists: true }
    },
  }
);
```

**Location**: 
- Database schema: `ExperimentEvent` model
- API: `/api/ab-testing/track` (checks before insert)
- Purchase tracking: `pixel-purchase-tracking.ts` (includes orderId)

**Note**: Purchases are tracked as **both** `"purchase"` and `"conversion"` events, but both use the same `orderId` for deduplication.

---

## Database Indexes

### Unique Index for Purchases/Conversions

```typescript
// Prevents duplicate purchases/conversions by orderId
ExperimentEventSchema.index(
  { 
    experimentId: 1, 
    variantId: 1, 
    eventType: 1,
    "metadata.orderId": 1 
  },
  { 
    unique: true,
    partialFilterExpression: { 
      eventType: { $in: ["purchase", "conversion"] },
      "metadata.orderId": { $exists: true }
    },
    name: "purchase_order_dedup"
  }
);
```

### Partial Indexes for Page Views

```typescript
// Helps with deduplication queries (not unique, but optimized)
ExperimentEventSchema.index(
  { 
    experimentId: 1, 
    variantId: 1, 
    eventType: 1, 
    userId: 1,
    timestamp: 1 
  },
  { 
    partialFilterExpression: { 
      eventType: "page_view",
      userId: { $exists: true }
    },
    name: "page_view_user_dedup"
  }
);
```

---

## API Response Handling

### Idempotent Responses

When a duplicate event is detected, the API returns a success response (idempotent):

```json
{
  "success": true,
  "message": "Event already tracked (duplicate prevented)",
  "duplicate": true
}
```

This ensures:
- Client doesn't retry unnecessarily
- No errors are shown to user
- Tracking is idempotent (safe to call multiple times)

---

## Error Handling

### MongoDB Duplicate Key Error

If a duplicate purchase/conversion slips through (race condition), MongoDB's unique index will reject it:

```typescript
// Handle MongoDB duplicate key error
if (error instanceof Error && error.message.includes("E11000")) {
  // Duplicate key error - event already exists
  return NextResponse.json({
    success: true,
    message: "Event already tracked (duplicate prevented)",
    duplicate: true,
  });
}
```

---

## Purchase Tracking Flow

### Client-Side Purchase Tracking

```typescript
// In pixel-purchase-tracking.ts
if (experimentId && variantId) {
  // Track both purchase and conversion events
  await Promise.allSettled([
    fetch("/api/ab-testing/track", {
      method: "POST",
      body: JSON.stringify({
        experimentId,
        variantId,
        eventType: "purchase",
        metadata: {
          orderId, // ✅ Critical for deduplication
          value,
          currency,
          // ...
        },
      }),
    }),
    fetch("/api/ab-testing/track", {
      method: "POST",
      body: JSON.stringify({
        experimentId,
        variantId,
        eventType: "conversion",
        metadata: {
          orderId, // ✅ Critical for deduplication
          source: "purchase",
          // ...
        },
      }),
    }),
  ]);
}
```

**Key Points**:
- Both events use the same `orderId`
- Database unique index prevents duplicates
- API also checks before insert (double protection)

---

## Testing Deduplication

### Test Scenarios

1. **Page View Refresh**:
   - Visit page → Page view tracked
   - Refresh within 1 minute → Duplicate prevented
   - Refresh after 1 minute → New page view tracked

2. **Double Click**:
   - Click CTA → Click tracked
   - Click again within 5 seconds → Duplicate prevented
   - Click after 5 seconds → New click tracked

3. **Purchase Retry**:
   - Complete purchase → Purchase & conversion tracked
   - Webhook retry with same orderId → Duplicate prevented (database unique index)
   - Different orderId → New purchase tracked

---

## Benefits

1. **Accurate Metrics**: No inflated counts from duplicates
2. **Database Efficiency**: Prevents unnecessary document creation
3. **Idempotent API**: Safe to call multiple times
4. **Race Condition Protection**: Database unique index as final safeguard
5. **User Experience**: No errors shown for legitimate duplicate prevention

---

## Monitoring

### Check for Duplicates

```javascript
// MongoDB query to find potential duplicates
db.experimentevents.aggregate([
  {
    $match: {
      eventType: { $in: ["purchase", "conversion"] },
      "metadata.orderId": { $exists: true }
    }
  },
  {
    $group: {
      _id: {
        experimentId: "$experimentId",
        variantId: "$variantId",
        eventType: "$eventType",
        orderId: "$metadata.orderId"
      },
      count: { $sum: 1 }
    }
  },
  {
    $match: { count: { $gt: 1 } }
  }
]);
```

**Expected Result**: No duplicates (count should always be 1)

---

## Summary

| Event Type | Deduplication Method | Window | Index |
|------------|----------------------|--------|-------|
| Page View | Time-based check | 1 minute | Partial index |
| Click | Time-based check | 5 seconds | Partial index |
| Purchase | Unique index on orderId | N/A | Unique compound index |
| Conversion | Unique index on orderId | N/A | Unique compound index |

**Key Principles**:
- ✅ Idempotent API responses
- ✅ Database-level protection (unique indexes)
- ✅ Application-level checks (time windows)
- ✅ Graceful error handling

---

**Last Updated**: January 2025  
**Maintained By**: Development Team

