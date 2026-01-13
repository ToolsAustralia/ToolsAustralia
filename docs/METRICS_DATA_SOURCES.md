# Daily Metrics Data Sources

This document explains where each metric in the Daily Metrics system comes from and how it's calculated.

## Overview

The Daily Metrics system aggregates data from two primary sources:
1. **PaymentEvent** - Actual sales transactions from your payment system
2. **FacebookAdsInsight** - Ad performance data from Facebook Marketing API

## Metric Breakdown

### 1. Ad Spend 💰

**Source:** Facebook Marketing API → `FacebookAdsInsight` model

**Storage:**
- Stored in **CENTS** in database (e.g., `450742` = $4507.42)
- Converted to **DOLLARS** when aggregating (divide by 100)

**Query Logic:**
- Finds insights where `dateRange` overlaps with the query date
- For single-day queries, selects the most specific insight (shortest dateRange)
- If multiple insights match, prefers the one with shortest dateRange, then most recent

**Example:**
```
Database: metrics.spend = 450742 (cents)
Aggregated: adSpend = 4507.42 (dollars)
```

---

### 2. Revenue 💵

**Primary Source:** `PaymentEvent` model (`data.price` field)

**Storage:**
- Stored in **DOLLARS** (e.g., `500` = $500.00)
- Price is converted from Stripe cents to dollars when PaymentEvent is created
- Only includes `eventType: "BenefitsGranted"` (successful payments)

**Fallback Source:** `FacebookAdsInsight` model (`metrics.revenue` field)

**Storage:**
- Stored in **CENTS** in database
- Converted to **DOLLARS** when aggregating (divide by 100)
- Represents revenue attributed to ads via 7-day click attribution window (Meta best practice 2024+)
- May include sales from previous days due to attribution window (up to 7 days)

**Strategy:**
1. Use PaymentEvent revenue as primary (actual sales on that day)
2. Use Facebook ads revenue only if PaymentEvent revenue is 0
3. This prevents double-counting while ensuring we capture revenue

**Example:**
```
PaymentEvent: data.price = 500 (dollars) → revenue = $500.00
FacebookAdsInsight: metrics.revenue = 577927 (cents) → revenue = $5779.27
Final: Uses PaymentEvent if available, otherwise Facebook ads
```

---

### 3. Sales Count 📊

**Source:** `PaymentEvent` model

**Calculation:**
- Count of `eventType: "BenefitsGranted"` events for that day
- Integer value (number of sales)

**Query:**
- Filters by `timestamp` within the date range
- Only counts successful payments

**Example:**
```
6 PaymentEvents on Dec 29 → salesCount = 6
```

---

### 4. Profit 💰

**Calculation:** `Revenue - Ad Spend`

**Unit:** Dollars

**Note:** 
- Uses the final revenue value (from PaymentEvent or Facebook ads)
- Can be negative if ad spend exceeds revenue

**Example:**
```
Revenue: $500.00
Ad Spend: $4507.42
Profit: -$4007.42
```

---

### 5. Conversions 🎯

**Source:** Facebook Marketing API → `FacebookAdsInsight` model

**Storage:**
- Purchase count from Facebook's `actions` array
- Integer value (number of conversions)
- Uses 7-day click attribution window (Meta best practice 2024+)

**Query:**
- Extracted from `insight.actions` where `action_type` is "purchase"
- Sums all purchase action counts

**Example:**
```
Facebook API returns: 227 conversions
Stored as: metrics.conversions = 227
```

---

### 6. Impressions & Clicks 👁️

**Source:** Facebook Marketing API → `FacebookAdsInsight` model

**Storage:**
- Integer values
- No conversion needed

**Example:**
```
impressions: 257437
clicks: 6666
```

---

## Date Handling

### Timezone
- All dates are normalized to **UTC** start/end of day for database queries
- `FacebookAdsInsight` dateRanges are stored in UTC but represent **AEST** dates
- Date matching checks both:
  1. Exact date match: `insight.date` falls within query range
  2. DateRange overlap: `dateRange.start <= query.endDate AND dateRange.end >= query.startDate`

### Date Matching Strategy
For single-day queries:
1. Find all insights where the day falls within their `dateRange`
2. If multiple insights match:
   - Prefer the one with **shortest dateRange** (most specific)
   - If tied, use **most recent** (`syncedAt`)

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Daily Metrics Aggregation                 │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────▼────────┐                    ┌─────────▼──────────┐
│ PaymentEvent   │                    │ FacebookAdsInsight │
│                │                    │                    │
│ • Revenue      │                    │ • Ad Spend        │
│   (DOLLARS)    │                    │   (CENTS → $)     │
│                │                    │                    │
│ • Sales Count  │                    │ • Revenue         │
│   (integer)    │                    │   (CENTS → $)     │
│                │                    │                    │
│                │                    │ • Conversions     │
│                │                    │   (integer)       │
│                │                    │                    │
│                │                    │ • Impressions     │
│                │                    │ • Clicks          │
└────────────────┘                    └───────────────────┘
        │                                       │
        └───────────────────┬───────────────────┘
                            │
                    ┌───────▼────────┐
                    │ DailyMetrics   │
                    │                │
                    │ • Revenue      │
                    │ • Ad Spend     │
                    │ • Sales Count  │
                    │ • Profit       │
                    │ • Conversions  │
                    │ • ROAS         │
                    │ • CTR          │
                    │ • CPC          │
                    └────────────────┘
```

---

## Unit Conversion Summary

| Metric | Source | Storage Unit | Aggregated Unit | Conversion |
|--------|--------|-------------|----------------|------------|
| Ad Spend | FacebookAdsInsight | Cents | Dollars | ÷ 100 |
| Revenue (Primary) | PaymentEvent | Dollars | Dollars | None |
| Revenue (Fallback) | FacebookAdsInsight | Cents | Dollars | ÷ 100 |
| Sales Count | PaymentEvent | Integer | Integer | None |
| Conversions | FacebookAdsInsight | Integer | Integer | None |
| Impressions | FacebookAdsInsight | Integer | Integer | None |
| Clicks | FacebookAdsInsight | Integer | Integer | None |

---

## Important Notes

1. **Revenue Strategy**: PaymentEvent revenue is preferred because it represents actual sales on that day. Facebook ads revenue uses a 7-day attribution window and may include sales from previous days (up to 7 days earlier).

2. **No Double-Counting**: The system uses PaymentEvent revenue when available, and only falls back to Facebook ads revenue if PaymentEvent revenue is 0.

3. **Date Matching**: For insights stored with dateRanges (e.g., Nov 1 - Dec 9), the system checks if the query date falls within that range.

4. **Currency Consistency**: All final metrics are in dollars for consistency, even though Facebook ads data is stored in cents.

5. **Attribution Window**: Facebook ads conversions and revenue use a 7-day click attribution window (Meta best practice 2024+), meaning they may attribute sales to ads that were clicked up to 7 days earlier.

