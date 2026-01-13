# Daily Metrics Data Sources - Complete Explanation

## Where Each Metric Comes From

### 1. **Ad Spend** 💰
- **Source:** Facebook Marketing API → `FacebookAdsInsight` model
- **Storage:** CENTS in database (e.g., `89744` = $897.44)
- **Conversion:** Converted to DOLLARS when aggregating (÷ 100)
- **Query:** Finds insights where `dateRange` overlaps with the query date
- **Example:** 
  - Facebook API returns: `$897.44`
  - Stored as: `metrics.spend = 89744` (cents)
  - Aggregated as: `adSpend = 897.44` (dollars)

### 2. **Revenue** 💵
- **Primary Source:** `PaymentEvent` model (`data.price` field)
  - **Unit:** DOLLARS (e.g., `500` = $500.00)
  - **When:** Actual sales that occurred on that specific day
  - **Query:** `eventType: "BenefitsGranted"` with `timestamp` in date range
  - **Note:** Price is converted from Stripe cents to dollars when PaymentEvent is created
  
- **Fallback Source:** `FacebookAdsInsight` model (`metrics.revenue` field)
  - **Unit:** Stored in CENTS, converted to DOLLARS (÷ 100)
  - **When:** Revenue attributed to ads via 7-day click attribution window (Meta best practice 2024+)
  - **Note:** May include sales from previous days due to attribution window (up to 7 days)
  - **Used only when:** PaymentEvent revenue is 0

- **Strategy:** 
  - Use PaymentEvent revenue as primary (actual daily sales)
  - Use Facebook ads revenue only as fallback to avoid double-counting

### 3. **Sales Count** 📊
- **Source:** `PaymentEvent` model
- **Calculation:** Count of `eventType: "BenefitsGranted"` events for that day
- **Unit:** Integer (number of sales)
- **Query:** Filters by `timestamp` within the date range

### 4. **Profit** 💰
- **Calculation:** `Revenue - Ad Spend`
- **Unit:** Dollars
- **Note:** Can be negative if ad spend exceeds revenue

### 5. **Conversions** 🎯
- **Source:** Facebook Marketing API → `FacebookAdsInsight` model
- **Storage:** Purchase count from Facebook's `actions` array
- **Unit:** Integer (number of conversions)
- **Note:** Uses 7-day click attribution window (Meta best practice 2024+)

### 6. **Impressions & Clicks** 👁️
- **Source:** Facebook Marketing API → `FacebookAdsInsight` model
- **Unit:** Integer (no conversion needed)

---

## Date Handling (CRITICAL)

### Timezone Strategy
- **All dates use AEST timezone** for business logic
- Dates are stored in UTC but represent AEST days
- This matches how the Facebook Ads page calculates dates

### How Dates Work
1. **Facebook Ads Page:**
   - "Yesterday" = Dec 30 in AEST
   - Calculates: `yesterdayStart = subDays(startOfTodayInAEST(), 1)`
   - Stores insight with `dateRange` representing Dec 30 AEST (in UTC)

2. **Daily Metrics Aggregation:**
   - For Dec 30, extracts AEST date components: `year=2025, month=12, day=30`
   - Creates: `startOfDay = createAESTDateAsUTC(2025, 12, 30, 0, 0)`
   - This creates UTC representation of Dec 30 00:00:00 AEST
   - Queries FacebookAdsInsight with this date range

3. **Date Matching:**
   - Checks if query date falls within insight's `dateRange`
   - Uses overlap logic: `dateRange.start <= query.endDate AND dateRange.end >= query.startDate`

---

## Why Dec 30 Shows $0 Ad Spend

**Problem:** Daily metrics show $0.00 ad spend for Dec 30, but Facebook Ads page shows $897.44.

**Possible Causes:**
1. **Date Mismatch:** The insight for Dec 30 might be stored with a different dateRange
2. **Missing Data:** The insight might not have been fetched/saved for Dec 30
3. **DateRange Query Issue:** The overlap query might not be matching correctly

**Solution:** 
- Updated aggregation to use AEST dates (matching Facebook Ads page)
- Improved date matching logic
- Added debug logging to show why insights aren't matching

---

## Data Flow Diagram

```
Facebook Marketing API
        │
        ▼
FacebookAdsInsight (stored in CENTS)
        │
        ├─→ Ad Spend: 89744 cents → $897.44
        ├─→ Revenue: 78997 cents → $789.97 (fallback)
        ├─→ Conversions: 855
        ├─→ Impressions: 33130
        └─→ Clicks: 855

PaymentEvent (stored in DOLLARS)
        │
        ├─→ Revenue: $20.00 (primary)
        └─→ Sales Count: 1

        │
        ▼
DailyMetrics (all in DOLLARS)
        │
        ├─→ Ad Spend: $897.44
        ├─→ Revenue: $20.00 (from PaymentEvent, not Facebook)
        ├─→ Sales: 1
        ├─→ Profit: -$877.44
        ├─→ ROAS: 0.02x
        └─→ Conversions: 855
```

---

## Unit Conversion Reference

| Metric | Source Model | Storage Unit | Final Unit | Conversion |
|--------|-------------|--------------|------------|------------|
| Ad Spend | FacebookAdsInsight | Cents | Dollars | ÷ 100 |
| Revenue (Primary) | PaymentEvent | Dollars | Dollars | None |
| Revenue (Fallback) | FacebookAdsInsight | Cents | Dollars | ÷ 100 |
| Sales Count | PaymentEvent | Integer | Integer | None |
| Conversions | FacebookAdsInsight | Integer | Integer | None |
| Impressions | FacebookAdsInsight | Integer | Integer | None |
| Clicks | FacebookAdsInsight | Integer | Integer | None |

---

## Troubleshooting

### If metrics show $0 when they shouldn't:

1. **Check date matching:**
   - Look at debug logs: `[FacebookAdsRepo] Found X insights covering this day`
   - Check if dateRanges overlap correctly

2. **Verify data exists:**
   - Query FacebookAdsInsight directly: `db.facebookadsinsights.find({ date: ... })`
   - Check if insights have correct dateRanges

3. **Check timezone:**
   - Ensure dates are using AEST timezone
   - Verify date normalization is correct

4. **Re-aggregate:**
   - Delete existing DailyMetrics for that date
   - Re-run aggregation to fetch fresh data

