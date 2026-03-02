# Promo Page Analytics

## Overview

Promo Page Analytics tracks visits, signups, and conversions for promotion pages (`/promotions/[slug]`). It measures funnel performance: how many users visit a promo page, how many register after visiting, and how many convert to paying customers. Metrics are aggregated by promotion page (slug) and displayed in the Admin Dashboard.

**Page types:**

- **Evergreen** — Prize-centric pages (e.g. `ryobi-sidchrome`, `cash-prize`, `milwaukee-milwaukee`)
- **Toolset** — Brand landing pages (e.g. `ryobi`, `milwaukee`, `dewalt`, `makita`)

## Architecture

```
User visits /promotions/ryobi
    │
    ▼
PromotionsLayoutShell → usePromoPageTracking()
    │
    ├── sessionStorage: promo attribution (pageType, slug) for checkout
    │
    └── POST /api/tracking/promo-page-visit
            │
            ▼
        PromoAnalyticsService.recordVisit()
            │
            ▼
        PromoAnalyticsVisit collection (visits by slug)
    │
    ▼
User registers (from promo page or checkout with stored attribution)
    │
    ▼
Register API receives promotionSlug
    │
    ▼
User.signupAttribution = { promotionSlug, promotionPageType, utmSource, ... }
    │
    ▼
User makes purchase
    │
    ▼
PaymentEvent created with data.promotionSlug (from User.signupAttribution)
    │
    ▼
Admin: GET /api/admin/promo-analytics
    │
    ▼
PromoAnalyticsRepository.getAggregatedByPage()
    - Visits: PromoAnalyticsVisit
    - Signups: User (signupAttribution.promotionSlug)
    - Conversions: PaymentEvent (data.promotionSlug)
```

## Data Sources

| Metric | Source | Filter |
|--------|--------|--------|
| **Visits** | `PromoAnalyticsVisit` | `timestamp` in date range |
| **Signups** | `User` | `signupAttribution.promotionSlug` + `createdAt` in date range |
| **Conversions** | `PaymentEvent` | `eventType: BenefitsGranted`, `data.promotionSlug`, excludes subscription renewals |
| **Revenue** | `PaymentEvent` | Sum of `data.price` for attributed conversions |

## Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `PromotionsLayoutShell` | `src/components/promo/PromotionsLayoutShell.tsx` | Mounts `usePromoPageTracking` on promo pages |
| `usePromoPageTracking` | `src/hooks/usePromoPageTracking.ts` | Tracks visits, stores attribution in sessionStorage |
| `getStoredPromoAttribution` | `src/hooks/usePromoPageTracking.ts` | Retrieves stored attribution for checkout |
| `POST /api/tracking/promo-page-visit` | `src/app/api/tracking/promo-page-visit/route.ts` | Records visits |
| `PromoAnalyticsService` | `src/services/promo-analytics/PromoAnalyticsService.ts` | Validates slug, delegates to repository |
| `PromoAnalyticsRepository` | `src/repositories/PromoAnalyticsRepository.ts` | Aggregates visits, signups, conversions |
| `PromoAnalyticsVisit` | `src/models/PromoAnalyticsVisit.ts` | MongoDB model for visits |
| `PromoAnalyticsManagement` | `src/components/admin/PromoAnalyticsManagement.tsx` | Admin UI |
| `GET /api/admin/promo-analytics` | `src/app/api/admin/promo-analytics/route.ts` | Admin API |

## PromoAnalyticsVisit Model

```typescript
{
  pageType: "evergreen" | "toolset",
  slug: string,
  anonymousId?: string,   // For future visit→user linking
  userId?: ObjectId,
  referrer?: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string,
  timestamp: Date
}
```

- **TTL index:** Visits older than 90 days are auto-deleted
- **Indexes:** `{ pageType, slug, timestamp }`, `{ anonymousId, timestamp }`, `{ userId, timestamp }`

## API Reference

### Track Promo Page Visit

**POST** `/api/tracking/promo-page-visit`

No auth. Uses `anonymousId` cookie for session attribution.

**Request body:**

```json
{
  "pageType": "evergreen",
  "slug": "ryobi-sidchrome",
  "utmSource": "facebook",
  "utmMedium": "cpc",
  "utmCampaign": "spring_sale"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pageType` | `"evergreen" \| "toolset"` | Yes | Page category |
| `slug` | string | Yes | Promotion slug (validated) |
| `utmSource` | string | No | Override URL UTM |
| `utmMedium` | string | No | Override URL UTM |
| `utmCampaign` | string | No | Override URL UTM |

**Deduplication:** One visit per `anonymousId` + `slug` per minute (prevents refresh spam).

### Get Promo Analytics (Admin)

**GET** `/api/admin/promo-analytics`

Admin only. Query params:

| Param | Values | Description |
|-------|--------|-------------|
| `dateRange` | `today`, `yesterday`, `custom` | Date range preset |
| `startDate` | YYYY-MM-DD | Start (required for custom) |
| `endDate` | YYYY-MM-DD | End (required for custom) |

**Response:**

```json
{
  "success": true,
  "data": {
    "totalVisits": 1200,
    "totalSignups": 80,
    "totalConversions": 25,
    "totalRevenue": 4500,
    "byPage": [
      {
        "pageType": "toolset",
        "slug": "ryobi",
        "visits": 500,
        "signups": 40,
        "conversions": 12,
        "revenue": 2400,
        "visitToSignupRate": 8,
        "signupToConversionRate": 30,
        "overallConversionRate": 2.4
      }
    ],
    "dateRange": { "start": "...", "end": "..." }
  }
}
```

## Attribution Flow

### Visit → Signup

1. User lands on `/promotions/ryobi` → visit recorded, `sessionStorage` stores `{ pageType, slug }`
2. User navigates to checkout/register (may leave promo URL)
3. Register flow reads `promotionSlug` from URL (`/promotions/ryobi`) or `getStoredPromoAttribution()`
4. Register API validates slug, stores `signupAttribution` on User

### Signup → Conversion

1. User has `signupAttribution.promotionSlug` on profile
2. On purchase, `grantBenefits()` in payment-processing reads `user.signupAttribution`
3. PaymentEvent `data` includes `promotionSlug`, `promotionPageType` for attribution
4. Subscription renewals are excluded from conversion attribution

## Valid Slugs

Defined in:

- **Evergreen:** `src/config/prizes.ts` (`listPrizes()`)
- **Toolset:** `src/config/promo-landing-slugs.ts` (`TOOLSET_LANDING_SLUGS`: ryobi, milwaukee, dewalt, makita)

Validation: `src/utils/promo-analytics/validate-promo-slug.ts` (`isValidPromoSlug`, `getPageTypeFromSlug`)

## Admin UI

**Location:** Admin → Promo Analytics (or via sidebar)

**Features:**

- Date range: Today, Yesterday, Custom, Current Draw, Last Draw, All Time
- Summary cards: Visits, Signups, Conversions, Revenue
- Sortable table by page (slug), visits, signups, conversions, revenue, V→S %, S→C %, Conv %
- Page labels resolved via `getPrizeLabel(slug)` from prize config

## Related

- [UTM_ATTRIBUTION.md](./UTM_ATTRIBUTION.md) — UTM capture and storage (used for signup attribution)
- [PROMO_BANNER_BEHAVIOUR.md](./PROMO_BANNER_BEHAVIOUR.md) — Promo banner display rules
