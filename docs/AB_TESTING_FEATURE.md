# A/B Testing Feature Documentation

## Overview

The A/B Testing feature is a comprehensive system for running controlled experiments on promotion landing pages. It allows you to test different variants (hero images, CTAs, messaging, etc.) and measure their performance using statistical analysis to determine winners.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Getting Started](#getting-started)
4. [Creating Experiments](#creating-experiments)
5. [Variant Configuration](#variant-configuration)
   - [User Splitting Algorithm](#user-splitting-algorithm)
6. [Stopping Rules](#stopping-rules)
7. [Statistical Analysis](#statistical-analysis)
8. [Winner Selection](#winner-selection)
9. [API Reference](#api-reference)
10. [Cron Jobs](#cron-jobs)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)
13. [Additional Resources](#additional-resources)
14. [Version History](#version-history)

---

## Features

### Core Features

- **Experiment Management**: Create, edit, pause, and end experiments
- **Variant Configuration**: Configure multiple variants with different hero images, CTAs, messaging, and more
- **Traffic Splitting**: Consistent hashing ensures users see the same variant across sessions
- **Statistical Analysis**: Chi-square tests, p-values, confidence intervals, and lift calculations
- **Automatic Stopping Rules**: End experiments automatically when criteria are met
- **Winner Declaration**: Automatically or manually declare winners based on statistical significance
- **Results Dashboard**: Comprehensive analytics with charts and metrics
- **Preview Mode**: Admins can preview specific variants without affecting live traffic

### Advanced Features

- **Server-Side Rendering**: Variants are assigned server-side for better SEO and performance
- **Request Deduplication**: Prevents multiple API calls for the same variant assignment
- **Client-Side Caching**: Reduces API calls with sessionStorage caching (5-minute TTL)
- **Retry Logic**: Exponential backoff for transient failures
- **Cookie Management**: Persistent anonymous IDs for consistent user identification
- **Event Tracking**: Track page views, clicks, conversions, and purchases
- **Event Deduplication**: Prevents duplicate events (page views, clicks, purchases) for accurate metrics
- **Database Optimization**: Daily aggregation reduces storage by 99% while maintaining real-time accuracy

---

## Architecture

### Components

```
src/
├── models/ab-testing/
│   ├── Experiment.ts              # Experiment model with stopping rules, winner, statistical results
│   ├── Variant.ts                 # Variant model with configuration
│   ├── VariantAssignment.ts      # User-variant assignments
│   ├── ExperimentEvent.ts        # Event tracking (page_view, click, conversion) - 30 day retention
│   ├── ExperimentDailyMetrics.ts # Aggregated daily metrics (permanent storage)
│   └── ExperimentHistory.ts      # Experiment change history
│
├── services/ab-testing/
│   ├── ExperimentService.ts           # Experiment CRUD operations
│   ├── VariantAssignmentService.ts    # Variant assignment logic (consistent hashing)
│   ├── ExperimentAnalyticsService.ts  # Metrics and statistical analysis
│   ├── ExperimentStoppingRulesService.ts # Stopping rules evaluation
│   └── AnonymousIdService.ts         # Anonymous ID cookie management
│
├── repositories/ab-testing/
│   ├── ExperimentRepository.ts
│   ├── VariantRepository.ts
│   ├── VariantAssignmentRepository.ts
│   ├── ExperimentEventRepository.ts        # Individual event tracking (hybrid: recent + aggregated)
│   └── ExperimentDailyMetricsRepository.ts # Aggregated daily metrics
│
├── components/admin/ab-testing/
│   ├── ABTestingManagement.tsx        # Main management page
│   ├── ExperimentFormModal.tsx        # Create/edit experiment form
│   ├── ExperimentDetailModal.tsx      # Experiment details and variants
│   ├── VariantConfigEditor.tsx        # Variant configuration editor
│   └── ExperimentResultsDashboard.tsx # Results dashboard with charts
│
├── components/ab-testing/
│   └── VariantAssignmentWrapper.tsx   # Client-side variant assignment wrapper
│
├── utils/ab-testing/
│   ├── statistical-tests.ts           # Chi-square, p-values, confidence intervals
│   └── get-server-variant-assignment.ts # Server-side variant assignment
│
└── app/api/
    ├── admin/ab-testing/
    │   └── experiments/
    │       ├── route.ts               # List/create experiments
    │       ├── [id]/
    │       │   ├── route.ts           # Get/update/delete experiment
    │       │   ├── analytics/route.ts # Get analytics
    │       │   ├── winner/route.ts   # Declare/get winner
    │       │   └── variants/route.ts # Variant CRUD
    │       └── preview/route.ts      # Preview mode
    │
    ├── ab-testing/
    │   ├── assign/route.ts           # Assign variant to user
    │   ├── track/route.ts            # Track events
    │   └── merge-user/route.ts       # Merge anonymous user with authenticated user
    │
    └── cron/
        └── ab-testing-experiments/route.ts # Automatic experiment management
```

### Data Flow

1. **User Visits Promotion Page**:
   - Server-side: `getServerVariantAssignment()` assigns variant
   - Client-side: `VariantAssignmentWrapper` hydrates with server data
   - Variant config is applied to hero section, CTA, etc.

2. **Event Tracking & Deduplication**:
   - `page_view`: Tracked automatically on page load (deduplicated within 1 minute)
   - `click`: Tracked when user clicks CTA (deduplicated within 5 seconds)
   - `conversion`: Tracked when user completes purchase (deduplicated by orderId)
   - `purchase`: Tracked when user completes purchase (deduplicated by orderId)
   - Events stored in `ExperimentEvent` collection (30-day retention)
   - Daily aggregation: Events aggregated into `ExperimentDailyMetrics` (permanent storage)

3. **Analytics Calculation**:
   - `ExperimentAnalyticsService` aggregates events (uses daily metrics for historical data)
   - Revenue tracking uses hybrid approach:
     - Historical data (>30 days): Pre-aggregated revenue from `ExperimentDailyMetrics`
     - Recent data (<30 days): Real-time revenue from `PaymentEvents`
     - Split ranges: Combined revenue from both sources
   - Statistical tests calculate significance
   - Results cached in `Experiment.statisticalResults`

4. **Daily Aggregation**:
   - Cron job runs daily at 3:00 AM UTC
   - Aggregates yesterday's events into daily metrics
   - Aggregates revenue from `PaymentEvents` into daily metrics
   - Deletes events older than 30 days (TTL index)
   - Reduces database size by 99% while maintaining accuracy

5. **Stopping Rules Evaluation**:
   - Cron job runs hourly
   - Checks if stopping rules are met
   - Automatically ends experiment if criteria satisfied

---

## Getting Started

### Prerequisites

- MongoDB database connection
- Admin user account
- Access to admin dashboard

### Creating Your First Experiment

1. Navigate to **Admin Dashboard > A/B Testing**
2. Click **"Create Experiment"**
3. Fill in experiment details:
   - **Name**: Descriptive name (e.g., "Hero CTA Test - January 2025")
   - **Status**: Start as "Draft"
   - **Target Pages**: Select specific pages or "All Pages"
   - **Schedule**: Optional start/end dates
   - **Stopping Rules**: Configure automatic ending (optional)

4. Click **"Create Experiment"**

5. Add variants:
   - Click on the experiment to open details
   - Click **"Add Variant"**
   - Configure variant settings:
     - **Name**: e.g., "Control" or "Variant A"
     - **Traffic Percentage**: e.g., 50% (must sum to 100% across all variants)
     - **Is Control**: Mark one variant as control
     - **Configuration**: Set hero image, CTA text, messaging, etc.

6. Activate experiment:
   - Change status to "Active"
   - Or set a start date for automatic activation

---

## Creating Experiments

### Experiment Form Fields

- **Name** (required): Descriptive name for the experiment
- **Status**: Draft, Active, Paused, or Ended
- **Target Pages**: 
  - Select "All Pages" (*) to apply to all promotion pages
  - Or select specific prize slugs
- **Start Date** (optional): When to automatically activate
- **End Date** (optional): When to automatically end
- **Stopping Rules** (optional): See [Stopping Rules](#stopping-rules) section

### Experiment Statuses

- **Draft**: Not yet active, can be edited
- **Active**: Currently running, variants are being shown to users
- **Paused**: Temporarily stopped, can be resumed
- **Ended**: Experiment completed, cannot be edited

### Best Practices

- Use descriptive names that include the test objective and date
- Start with draft status to configure variants before going live
- Set end dates for time-bound experiments
- Use stopping rules to automatically end when statistically significant

---

## Variant Configuration

### Variant Settings

Each variant can configure:

1. **Hero Section**:
   - `imageSrc`: Hero image URL
   - `messaging`: Hero text/messaging
   - `ctaText`: Call-to-action button text
   - `ctaStyle`: Button styling (background color, text color)

2. **Banner**:
   - `badgeText`: Badge text (e.g., "Limited Time")
   - `multiplier`: Multiplier value (e.g., 2x)
   - `showCountdown`: Show/hide countdown timer

3. **Packages**:
   - `displayOrder`: Order of package display
   - `highlightPackage`: Package to highlight
   - `hidePackages`: Packages to hide

4. **Membership Modal**:
   - `showPackageSelectionFirst`: Boolean to toggle package selection modal on step 2
     - When `true`: Automatically opens package selection modal when user reaches step 2 (payment step)
     - When `false` or undefined: Uses default behavior (no auto-open)
     - Useful for A/B testing different user flows on promotion/landing pages

### Traffic Allocation

- Traffic percentages must sum to 100% across all variants
- Uses consistent hashing to ensure users see the same variant
- Based on anonymous ID or user ID for logged-in users

### User Splitting Algorithm

The system uses **consistent hashing** to deterministically assign users to variants. This ensures:
- **Consistency**: Same user always sees the same variant across sessions
- **Fair Distribution**: Traffic is split according to configured percentages
- **Stability**: Users don't switch variants when they return

#### How It Works

1. **User Identification**:
   - **Logged-in users**: Uses `userId` (MongoDB ObjectId)
   - **Anonymous users**: Uses `anonymousId` (format: `anon_<UUID>`)
   - **Admin users**: Excluded from experiments (see admin exclusion)

2. **Hash Generation**:
   ```
   hashInput = experimentId + "_" + (userId || anonymousId)
   hashValue = SHA256(hashInput) → first 8 hex chars → integer
   bucket = hashValue % 100  // 0-99 bucket
   ```

3. **Variant Assignment**:
   - Buckets (0-99) are mapped to variants based on traffic percentages
   - Example with 50/50 split:
     - Variant A (50%): Buckets 0-49
     - Variant B (50%): Buckets 50-99
   - Example with 30/40/30 split:
     - Variant A (30%): Buckets 0-29
     - Variant B (40%): Buckets 30-69
     - Variant C (30%): Buckets 70-99

4. **Assignment Persistence**:
   - Assignment is stored in `VariantAssignment` collection
   - On subsequent visits, existing assignment is reused
   - `lastSeenAt` timestamp is updated

#### Example Scenarios

**Scenario 1: Two Variants (50/50 Split)**
```
User visits → Hash generates bucket 37
Bucket 37 falls in Variant A range (0-49)
User assigned to Variant A
User returns → Same hash → Same bucket → Same variant ✅
```

**Scenario 2: Three Variants (25/50/25 Split)**
```
User visits → Hash generates bucket 60
Bucket 60 falls in Variant B range (25-74)
User assigned to Variant B
User returns → Same hash → Same bucket → Same variant ✅
```

**Scenario 3: Anonymous User Logs In**
```
1. Anonymous user visits → Assigned to Variant A (using anonymousId)
2. User logs in → Assignment merged to userId
3. Future visits → Uses userId → Same variant ✅
```

#### Admin Exclusion

- Admin users are **automatically excluded** from experiments
- They see the default/control variant (no A/B testing)
- This prevents admin actions from skewing results
- Preview mode allows admins to view specific variants

#### Anonymous ID Management

- **Cookie-based**: Stored in `ta_anon_id` cookie (1 year expiration)
- **Format**: `anon_<UUID>` (e.g., `anon_550e8400-e29b-41d4-a716-446655440000`)
- **Persistence**: Survives browser sessions, cleared when user logs in
- **Merging**: When anonymous user logs in, assignments are merged to userId

#### Traffic Split Validation

- System validates that traffic percentages sum to 100%
- Tolerance: 0.01% (handles floating-point rounding)
- Warning logged if validation fails (but assignment continues)

#### Consistent Hashing Benefits

1. **Deterministic**: Same input always produces same output
2. **Uniform Distribution**: Hash function distributes users evenly
3. **Stable**: Users don't switch variants unexpectedly
4. **Scalable**: Works with any number of variants
5. **Fair**: Traffic split matches configured percentages

### Control Variant

- One variant should be marked as "Control" (isControl: true)
- Control variant represents the current/default design
- Other variants are compared against the control

---

## Stopping Rules

Stopping rules automatically end experiments when certain conditions are met.

### Available Rules

1. **Minimum Conversions**:
   - End when each variant reaches a minimum number of conversions
   - Example: End when each variant has 100+ conversions

2. **Confidence Threshold**:
   - End when statistical significance reaches a certain confidence level
   - Options: 80%, 90%, 95% (recommended), 99%
   - Example: End when confidence reaches 95%

3. **Maximum Duration**:
   - End after a specified number of days
   - Example: End after 30 days

### Configuration

Enable stopping rules in the experiment form:

1. Check **"Enable Automatic Ending"**
2. Configure one or more rules:
   - Minimum conversions per variant
   - Confidence threshold percentage
   - Maximum duration in days
3. Save experiment

### How It Works

- Cron job runs hourly (`/api/cron/ab-testing-experiments`)
- Evaluates stopping rules for all active experiments with `autoEndEnabled: true`
- If any rule is met (OR logic), experiment is automatically ended
- Statistical results are calculated and cached
- Winner is automatically determined if statistically significant

---

## Statistical Analysis

### Statistical Tests

The system uses industry-standard statistical methods:

1. **Chi-Square Test**:
   - Tests if there's a statistically significant difference between variants
   - Compares conversion rates using a 2x2 contingency table
   - Calculates chi-square statistic and p-value

2. **P-Value**:
   - Probability of observing the results if there's no real difference
   - Lower p-value = more significant
   - Typically, p < 0.05 is considered significant

3. **Confidence Level**:
   - Calculated as (1 - p-value) × 100%
   - Higher confidence = more reliable results
   - 95% confidence is industry standard

4. **Confidence Intervals**:
   - Wilson score interval for conversion rates
   - Shows the range where the true conversion rate likely falls
   - 95% confidence interval means 95% chance the true rate is within the range

5. **Lift**:
   - Percentage improvement (or decline) vs control variant
   - Formula: `((Variant Rate - Control Rate) / Control Rate) × 100`
   - Positive lift = improvement, negative = decline

### Interpreting Results

- **Statistically Significant**: Results are reliable, winner can be declared
- **Not Significant**: Need more data or no real difference exists
- **High Confidence (≥95%)**: Results are trustworthy
- **Low Confidence (<95%)**: Need more data before making decisions

---

## Winner Selection

### Automatic Winner Determination

The system automatically determines winners when:

1. Experiment ends via stopping rules
2. Statistical significance is reached (confidence ≥ threshold)
3. Winner is calculated based on lift:
   - **Variant wins**: Positive lift with statistical significance
   - **Control wins**: Negative lift (variant performs worse)
   - **Inconclusive**: No significant difference

### Manual Winner Declaration

Admins can manually declare winners:

1. Navigate to experiment details
2. Click **"Declare Winner"**
3. Select winning variant
4. Optionally end experiment
5. Add reason (optional)

### API Endpoints

- **GET** `/api/admin/ab-testing/experiments/[id]/winner`: Get automatic winner determination
- **POST** `/api/admin/ab-testing/experiments/[id]/winner`: Declare winner manually

---

## API Reference

### Experiment Management

#### List Experiments
```
GET /api/admin/ab-testing/experiments
Query Params:
  - status: "draft" | "active" | "paused" | "ended"
  - search: string
  - page: number
  - limit: number
  - sortBy: string
  - sortOrder: "asc" | "desc"
```

#### Create Experiment
```
POST /api/admin/ab-testing/experiments
Body:
{
  name: string;
  status?: "draft" | "active" | "paused" | "ended";
  slugTargets: string[];
  startDate?: string; // ISO datetime
  endDate?: string; // ISO datetime
  stoppingRules?: {
    minConversions?: number;
    confidenceThreshold?: number; // 80, 90, 95, 99
    maxDuration?: number; // days
    autoEndEnabled?: boolean;
  };
}
```

#### Get Experiment
```
GET /api/admin/ab-testing/experiments/[id]
```

#### Update Experiment
```
PATCH /api/admin/ab-testing/experiments/[id]
Body: (same as create, all fields optional)
```

#### Delete Experiment
```
DELETE /api/admin/ab-testing/experiments/[id]
```

### Variant Management

#### Create Variant
```
POST /api/admin/ab-testing/experiments/[id]/variants
Body:
{
  name: string;
  trafficPercentage: number; // 0-100
  isControl?: boolean;
  config: {
    hero?: {
      imageSrc?: string;
      messaging?: string;
      ctaText?: string;
      ctaStyle?: {
        backgroundColor?: string;
        textColor?: string;
      };
    };
    banner?: {
      badgeText?: string;
      multiplier?: number;
      showCountdown?: boolean;
    };
    packages?: {
      displayOrder?: string[];
      highlightPackage?: string;
      hidePackages?: string[];
    };
    membershipModal?: {
      showPackageSelectionFirst?: boolean; // Toggle package selection modal on step 2
    };
  };
}
```

### Analytics

#### Get Analytics
```
GET /api/admin/ab-testing/experiments/[id]/analytics
Query Params:
  - startDate?: string; // ISO datetime
  - endDate?: string; // ISO datetime
```

Response:
```json
{
  "success": true,
  "data": {
    "comparison": {
      "variants": [
        {
          "variantId": "string",
          "metrics": {
            "pageViews": 0,
            "uniqueVisitors": 0,
            "clicks": 0,
            "conversions": 0,
            "revenue": 0,
            "conversionRate": 0,
            "ctr": 0,
            "revenuePerUser": 0
          }
        }
      ],
      "totalPageViews": 0,
      "totalConversions": 0,
      "totalRevenue": 0
    },
    "significance": {
      "significant": true,
      "pValue": 0.05,
      "confidence": 95,
      "lift": 10.5,
      "controlRate": 2.5,
      "variantRate": 2.75,
      "controlInterval": { "lower": 2.0, "upper": 3.0 },
      "variantInterval": { "lower": 2.5, "upper": 3.0 },
      "chiSquare": 4.5
    }
  }
}
```

### Winner Selection

#### Get Winner Determination
```
GET /api/admin/ab-testing/experiments/[id]/winner
```

#### Declare Winner
```
POST /api/admin/ab-testing/experiments/[id]/winner
Body:
{
  variantId: string;
  endExperiment?: boolean;
  reason?: string;
}
```

### Variant Assignment

#### Assign Variant
```
POST /api/ab-testing/assign
Body:
{
  experimentId: string;
  slug: string;
}
```

Response:
```json
{
  "success": true,
  "data": {
    "variantId": "string",
    "variantConfig": { /* variant config */ },
    "anonymousId": "string"
  }
}
```

### Event Tracking

#### Track Event
```
POST /api/ab-testing/track
Body:
{
  experimentId: string;
  variantId: string;
  eventType: "page_view" | "click" | "conversion" | "lead" | "purchase";
  metadata?: Record<string, unknown>;
}
```

**Deduplication**:
- **Page Views**: Prevented within 1 minute (handles refresh)
- **Clicks**: Prevented within 5 seconds (handles double-click)
- **Purchases/Conversions**: Prevented by `orderId` (unique database index)

**Response** (if duplicate detected):
```json
{
  "success": true,
  "message": "Event already tracked (duplicate prevented)",
  "duplicate": true
}
```

See [Event Deduplication Documentation](./AB_TESTING_DEDUPLICATION.md) for details.

---

## Cron Jobs

### Automatic Experiment Management

**Endpoint**: `/api/cron/ab-testing-experiments`  
**Schedule**: Every hour (`0 * * * *`)  
**Purpose**: 
- Activate experiments that reached startDate
- End experiments that reached endDate
- Check and apply stopping rules
- Automatically end experiments when stopping rules are met
- Calculate statistical results and determine winners

### Daily Metrics Aggregation

**Endpoint**: `/api/cron/ab-testing-aggregate-metrics`  
**Schedule**: Daily at 3:00 AM UTC (`0 3 * * *`)  
**Purpose**:
- Aggregate yesterday's events into daily metrics
- Delete events older than 30 days (TTL index)
- Reduce database size by 99% while maintaining accuracy
- Ensure efficient querying for historical data

**Benefits**:
- **Storage Reduction**: 99% reduction in database size
- **Query Performance**: 10-50ms (aggregated) vs 500-5000ms (individual events)
- **Scalability**: Constant growth rate, not linear

See [Database Optimization Documentation](./AB_TESTING_DATABASE_OPTIMIZATION.md) for details.

### Configuration

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/ab-testing-experiments",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/ab-testing-aggregate-metrics",
      "schedule": "0 3 * * *"
    }
  ]
}
```

---

## Best Practices

### Experiment Design

1. **Clear Hypothesis**: Define what you're testing and expected outcome
2. **One Variable**: Test one element at a time (e.g., CTA text OR hero image, not both)
3. **Control Variant**: Always include a control variant (current design)
4. **Equal Traffic**: Start with 50/50 split for two variants
5. **Sample Size**: Ensure sufficient traffic for statistical significance

### Statistical Significance

1. **Wait for Significance**: Don't declare winners too early
2. **95% Confidence**: Use 95% confidence threshold for reliable results
3. **Minimum Conversions**: Set minimum conversions (e.g., 100 per variant)
4. **Check Confidence Intervals**: Ensure intervals don't overlap significantly

### Traffic Allocation

1. **Consistent Hashing**: Users see the same variant across sessions
2. **Traffic Percentages**: Must sum to 100% across all variants
3. **Preview Mode**: Use preview mode to test variants before going live

### Stopping Rules

1. **Enable Auto-End**: Use stopping rules to prevent experiments from running too long
2. **Multiple Rules**: Set multiple rules (e.g., min conversions AND confidence threshold)
3. **Review Results**: Always review results before implementing winner

### Results Interpretation

1. **Statistical Significance**: Only trust results if statistically significant
2. **Lift Calculation**: Consider both percentage lift and absolute numbers
3. **Confidence Intervals**: Check if intervals overlap (may indicate no real difference)
4. **External Factors**: Consider seasonality, marketing campaigns, etc.

---

## Troubleshooting

### Common Issues

#### Variants Not Showing
- **Check experiment status**: Must be "active"
- **Check slug targeting**: Ensure promotion page slug matches experiment targets
- **Check traffic allocation**: Ensure percentages sum to 100%
- **Clear cookies**: Anonymous ID cookie may need refresh

#### Statistical Results Not Updating
- **Wait for cron job**: Runs hourly, may take time to update
- **Check event tracking**: Ensure events are being tracked
- **Check deduplication**: Verify events aren't being filtered as duplicates
- **Manual calculation**: Use analytics API to force calculation

#### Duplicate Events
- **Check deduplication logic**: Page views (1 min), clicks (5 sec), purchases (orderId)
- **Verify unique indexes**: Ensure database indexes are created
- **Check orderId**: Purchases must include orderId in metadata for deduplication

#### Experiments Not Ending Automatically
- **Check stopping rules**: Ensure `autoEndEnabled` is true
- **Check cron job**: Verify cron job is running
- **Check rule criteria**: Ensure criteria are actually met

#### Preview Mode Not Working
- **Check admin status**: Must be logged in as admin
- **Check cookie**: Preview cookie may have expired
- **Clear cookies**: Try clearing browser cookies

### Debugging

1. **Check Experiment Status**: Verify experiment is active
2. **Check Variant Assignment**: Use browser dev tools to check API responses
3. **Check Event Tracking**: Verify events are being sent to `/api/ab-testing/track`
4. **Check Analytics**: Use analytics API to verify data collection
5. **Check Logs**: Review server logs for errors

### Support

For issues or questions:
1. Check this documentation
2. Review code comments in source files
3. Check server logs for errors
4. Contact development team

---

## Additional Resources

### Documentation Files

- **[Best Practices Guide](./AB_TESTING_BEST_PRACTICES.md)**: **Recommended reading** - Best practices for visitor tracking, conversion counting, revenue attribution, and seamless integration
- **[Metrics Calculation Guide](./AB_TESTING_METRICS_CALCULATION.md)**: How CTR and Conversion Rate are calculated
- **[Database Optimization](./AB_TESTING_DATABASE_OPTIMIZATION.md)**: Daily aggregation strategy and storage optimization
- **[Event Deduplication](./AB_TESTING_DEDUPLICATION.md)**: How duplicate events are prevented

### Technical References

- **Statistical Methods**: Based on industry standards (Klaviyo, Facebook, Google Optimize)
- **Chi-Square Test**: Standard method for A/B testing
- **Wilson Score Interval**: More accurate than normal approximation for small samples
- **Consistent Hashing**: Ensures stable variant assignment
- **Daily Aggregation**: Industry best practice (used by Google Optimize, Optimizely, VWO)

---

## Version History

- **v1.1.0** (Current): Enhanced with:
  - Event deduplication (page views, clicks, purchases)
  - Database optimization (daily aggregation, 99% storage reduction)
  - Unique indexes for purchase/conversion deduplication
  - Hybrid query strategy (recent events + aggregated metrics)
  - TTL indexes for automatic event cleanup

- **v1.0.0**: Initial implementation with:
  - Experiment and variant management
  - Statistical analysis
  - Stopping rules
  - Winner selection
  - Results dashboard
  - Automatic experiment management

---

**Last Updated**: January 2025  
**Maintained By**: Development Team

