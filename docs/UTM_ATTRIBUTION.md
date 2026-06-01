# UTM Attribution Feature

## Overview

This feature captures UTM parameters from the URL and persists them to sessionStorage, so they can be attributed at signup or conversion even if the user navigates away before registering. It supports multi-touch attribution for marketing channels (e.g. Facebook, Google Ads, Klaviyo).

**Supported UTM parameters:** `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`

**Platform IDs (for payment attribution):** `campaign_id`, `adset_id`, `ad_id` — see [PAYMENT_ATTRIBUTION.md](./PAYMENT_ATTRIBUTION.md) for details.

## Problem It Solves

A user may land on the site via a paid ad with UTM params, browse around, and then register several minutes later from a different page (e.g. checkout). Without persistence, the UTM params would be lost and the conversion could not be attributed to the original campaign.

## Architecture

```
User lands on site with ?utm_source=facebook&utm_medium=cpc&utm_campaign=spring_sale
    │
    ▼
PromoLinkTracker (in root layout via providers.tsx)
    │
    ├── useUTMPersistence()
    │       │
    │       ▼
    │   extractUTMParams(window.location.search)
    │       │
    │       ▼
    │   setStoredUTMParams(params)  →  sessionStorage["tools-aus:utm-attribution"]
    │
    ▼
User navigates to /checkout, /register, etc. (no UTM in URL)
    │
    ▼
MembershipModal (registration) or other conversion flow
    │
    ▼
getStoredUTMParams()  →  retrieves from sessionStorage
    │
    ▼
UTM sent to API (register, payment)  →  stored on User model
```

## Key Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `utm-storage.ts` | `src/utils/tracking/utm-storage.ts` | Read/write UTM to sessionStorage with expiry |
| `utm-helpers.ts` | `src/utils/tracking/utm-helpers.ts` | Extract UTM from URL string or URLSearchParams |
| `useUTMPersistence` | `src/hooks/useUTMPersistence.ts` | Capture UTM from current URL and persist on navigation |
| `PromoLinkTracker` | `src/components/tracking/PromoLinkTracker.tsx` | Mounts `useUTMPersistence` site-wide |
| `getStoredUTMParams` | Used in MembershipModal | Retrieve stored UTM at conversion time |

## Storage Details

- **Key:** `tools-aus:utm-attribution`
- **Storage:** `sessionStorage` (not localStorage) — survives navigation within the same tab but is cleared when the tab closes
- **Expiry:** 30 minutes from `capturedAt` timestamp
- **Format:**

```json
{
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "spring_sale",
  "utm_content": "ad_creative_1",
  "utm_term": "keywords",
  "campaign_id": "1202000001234567",
  "adset_id": "1202000001234568",
  "ad_id": "1202000001234569",
  "capturedAt": 1704067200000
}
```

Extended fields (`utm_content`, `utm_term`, `campaign_id`, `adset_id`, `ad_id`) support payment attribution—see [PAYMENT_ATTRIBUTION.md](./PAYMENT_ATTRIBUTION.md).

## API Reference

### `getStoredUTMParams(): UTMParams | null`

Returns stored UTM params if present and not expired. Returns `null` on SSR, missing data, or expiry.

```typescript
const utm = getStoredUTMParams();
// { utm_source: "facebook", utm_medium: "cpc", utm_campaign: "spring_sale" } or null
```

### `setStoredUTMParams(params: UTMParams): void`

Writes UTM params to sessionStorage. Only stores if at least one of `utm_source`, `utm_medium`, or `utm_campaign` is present. No-op on SSR or empty params.

```typescript
setStoredUTMParams({ utm_source: "google", utm_medium: "cpc" });
```

### `extractUTMParams(urlOrParams: string | URLSearchParams): UTMParams`

Extracts UTM params from a URL string or URLSearchParams. Handles full URLs, query strings, and URLSearchParams objects.

```typescript
extractUTMParams("?utm_source=facebook&utm_medium=cpc");
extractUTMParams(new URLSearchParams(search));
```

## Attribution Flow: Registration

1. **Capture:** User lands with UTM → `useUTMPersistence` calls `setStoredUTMParams`.
2. **Retrieval:** On submit, MembershipModal checks:
   - Current URL UTM (via `extractUTMParams(window.location.search)`)
   - Stored UTM (via `getStoredUTMParams()`)
   - Uses URL first if present, otherwise storage.
3. **Send:** UTM passed in register request body as `utm_source`, `utm_medium`, `utm_campaign`.
4. **Store:** Register API saves to User model as `utmSource`, `utmMedium`, `utmCampaign` (camelCase for MongoDB).

## User Model Fields

```typescript
// User document (signup snapshot)
utmSource?: string;   // e.g. "facebook"
utmMedium?: string;   // e.g. "cpc"
utmCampaign?: string; // e.g. "spring_sale"
```

## Usage in Conversion Flows

### MembershipModal (Registration)

```typescript
const fromUrl = extractUTMParams(window.location.search);
const fromStorage = getStoredUTMParams();
utmParams = (fromUrl.utm_source || fromUrl.utm_medium || fromUrl.utm_campaign)
  ? fromUrl
  : fromStorage || {};
// Sent to /api/auth/register
```

### Register API

Accepts `utm_source`, `utm_medium`, `utm_campaign` in request body. Falls back to referer URL if not provided. Stores on User for Klaviyo and other integrations.

## Why sessionStorage (not localStorage)

- **Privacy:** Cleared when tab closes; no long-lived tracking.
- **Attribution window:** 30 minutes is sufficient for single-session conversions.
- **Freshness:** New visit = new attribution; avoids stale campaign data from weeks ago.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No UTM on landing | Nothing stored; `getStoredUTMParams()` returns `null` |
| UTM on conversion URL | URL params take precedence over storage |
| Expired storage (>30 min) | `getStoredUTMParams()` returns `null`, storage entry removed |
| New tab/window | Fresh session; no shared sessionStorage |
| SSR / build time | All functions no-op or return `null` (guard with `typeof window`) |

## Migration: 30-minute sessionStorage → durable `_ta_attr` cookie (2026-06-01)

The original storage used a 30-minute `sessionStorage` TTL (key `tools-aus:utm-attribution`). The single-platform payment attribution feature replaced this with a **durable `_ta_attr` cookie** stored in `sessionStorage` but with a **90-day effective TTL** baked into the JSON payload (`captured_at` + 90-day check on read). SameSite=Lax, first-party.

Key differences:

| | Before | After |
|---|---|---|
| Storage key | `tools-aus:utm-attribution` | `_ta_attr` |
| TTL | 30 minutes | 90 days |
| Click IDs stored | No | Yes (`fbclid`/`_fbc`, `ttclid`, `ScCid`) |
| Used by | `useAttribution()` at conversion time | Attribution resolver at `create-*` route edge |

**Back-compat:** the old `tools-aus:utm-attribution` key is still read if `_ta_attr` is absent (legacy sessions). New landings write `_ta_attr` only.

### UTM normalization

UTM values are normalized to lowercase during capture. Klaviyo auto-UTM appends `utm_source=Klaviyo` (capital K) — the normalizer converts this to `klaviyo` before storage and before passing to the resolver. When reading `_ta_attr` always treat `utm_source` as already lowercase; never compare against `"Klaviyo"` (capitalized).

## Related

- [PROMO_PAGE_ANALYTICS.md](./PROMO_PAGE_ANALYTICS.md) — Promo page visits, signups, conversions (UTM stored per visit)
- **Klaviyo:** User's UTM snapshot used for list segmentation and attribution
- **Facebook CAPI:** UTM passed in purchase events for campaign attribution
- [PAYMENT_ATTRIBUTION.md](./PAYMENT_ATTRIBUTION.md) — Single-platform resolution model built on top of `_ta_attr`
