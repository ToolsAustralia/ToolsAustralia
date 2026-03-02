# Payment Attribution System

## Overview

The Payment Attribution System captures and persists marketing attribution (UTM parameters + platform-specific campaign/adset/ad IDs) on every payment—for both **new signups** and **existing users** who land from ads or emails.

All attribution is **optional and non-blocking**; the payment flow is unaffected by missing or invalid attribution.

**Supported platforms:** Facebook, Instagram, Klaviyo, TikTok, and extensible for future platforms.

---

## Data Model

### PaymentEvent.data (conventions)

The `data` field is `Schema.Types.Mixed`. New attribution keys follow these conventions:

| Field             | Type                     | Source    | Description                                    |
| ----------------- | ------------------------ | --------- | ---------------------------------------------- |
| utmSource         | string                   | URL/body  | Platform: facebook, instagram, klaviyo, tiktok |
| utmMedium         | string                   | URL/body  | e.g. cpc, email                                |
| utmCampaign       | string                   | URL/body  | Campaign name or ID                            |
| utmContent        | string                   | URL/body  | Ad creative/variation (optional)                |
| utmTerm           | string                   | URL/body  | Keywords (optional)                            |
| campaignId        | string                   | URL param | Platform campaign ID (e.g. Meta campaign_id)   |
| adsetId           | string                   | URL param | Platform adset ID                              |
| adId              | string                   | URL param | Platform ad ID                                |
| attributionSource | "signup" \| "session"    | computed  | Where attribution came from                    |
| promotionSlug     | string                   | existing  | Kept for promo analytics                       |
| promotionPageType | string                   | existing  | Kept                                           |

Existing fields (entries, points, price, billingReason, etc.) remain unchanged.

### User.signupAttribution

Optional fields on the User model (snake_case in API, camelCase in MongoDB):

- `utmSource`, `utmMedium`, `utmCampaign`
- `utmContent`, `utmTerm`
- `campaignId`, `adsetId`, `adId`

---

## URL Conventions

Ad links (Facebook, TikTok, Klaviyo, etc.) should use:

```
?utm_source=facebook&utm_medium=cpc&utm_campaign=winter_sale
&utm_content=ad_creative_1
&campaign_id=1202000001234567&adset_id=1202000001234568&ad_id=1202000001234569
```

- **utm_source**: Platform (facebook, instagram, klaviyo, tiktok)
- **campaign_id, adset_id, ad_id**: Platform-specific IDs (add in Ads Manager / campaign URLs)

**Important:** Campaign/adset/ad IDs are **not** provided by platforms automatically. They must be added to destination URLs when creating ads (Facebook Ads Manager, TikTok Ads Manager, Klaviyo campaign links).

---

## Platform Setup Guides

### Facebook / Instagram Ads

1. Create your ad in Ads Manager.
2. In the destination URL, add UTM params and campaign IDs:
   ```
   https://yoursite.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=winter_sale
   &campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
   ```
3. Meta supports dynamic parameters; use `{{campaign.id}}`, `{{adset.id}}`, `{{ad.id}}` if your tool supports them.

### TikTok Ads

1. Use the same URL structure with `utm_source=tiktok`.
2. Add campaign_id, adset_id, ad_id from TikTok Ads Manager when configuring the destination URL.

### Klaviyo

1. When building email campaigns, add UTM params to links:
   ```
   ?utm_source=klaviyo&utm_medium=email&utm_campaign=spring_sale
   ```
2. Optionally add `utm_content` for A/B test variants.

---

## Attribution Priority

1. **Session attribution** (from Stripe metadata, i.e. from the current purchase session) — **highest priority**
2. **Signup attribution** (from `User.signupAttribution`) — **fallback** when no session attribution

When building `PaymentEvent.data`, the system merges:
- If session attribution exists (utm_source or campaign_id from metadata) → use it, set `attributionSource: "session"`
- Otherwise, use signup attribution, set `attributionSource: "signup"`

---

## New vs Existing Users

### New users (signup + purchase in one flow)

1. User lands with UTM + campaign params in URL.
2. `useUTMPersistence` stores them in sessionStorage.
3. On registration, `getAttributionFromRequest` (or equivalent) captures attribution and stores in `User.signupAttribution`.
4. On purchase (subscription/one-time), attribution is sent from client via `useAttribution()` and stored in Stripe metadata.
5. Webhook extracts `attr_*` from metadata and passes to `processPaymentBenefits`.
6. PaymentEvent is created with session attribution (priority over signup).

### Existing users (logged in, land from ad)

1. User lands with UTM + campaign params in URL.
2. `useUTMPersistence` stores them in sessionStorage.
3. Purchase APIs (create-subscription-existing-user, etc.) receive attribution from client via `useAttribution()`.
4. Attribution is stored in Stripe metadata.
5. Webhook extracts and passes to `processPaymentBenefits`.
6. PaymentEvent is created with session attribution.

---

## Migration Notes

- **Backward compatibility:** No removal of existing fields; all changes are additive.
- **Existing PaymentEvents:** No migration needed. New fields apply only to future events.
- **Existing users:** Will receive attribution when they land from ads and make a purchase (session attribution).

---

## Troubleshooting

### Missing attribution on PaymentEvent

- **Check:** User landed with UTM/campaign params in URL.
- **Check:** `useUTMPersistence` is mounted (e.g. via PromoLinkTracker).
- **Check:** sessionStorage has not expired (30 minutes).
- **Check:** Purchase API is receiving `attribution` in the request body (client hooks include it when available).
- **Check:** Webhook is extracting `attr_*` from Stripe metadata.

### Wrong ROAS in hourly insights

- **Check:** Use `utmSource=facebook` query param when you want Facebook-only revenue.
- **Check:** PaymentEvent has `data.utmSource` populated for the events in question.
- **Check:** Date range and timezone (AEST) match your expectations.

### Attribution from signup when session expected

- Session attribution takes priority. If you see signup attribution, it means no session attribution was present (e.g. no UTM in sessionStorage at purchase time).
- Verify the user landed from an ad link with UTM before purchasing.

---

## Related Documentation

- [UTM_ATTRIBUTION.md](./UTM_ATTRIBUTION.md) — UTM capture and storage
- [DATA_SOURCES_EXPLANATION.md](./DATA_SOURCES_EXPLANATION.md) — Revenue data sources
- [FACEBOOK_TRACKING_IMPLEMENTATION.md](./FACEBOOK_TRACKING_IMPLEMENTATION.md) — CAPI and ROAS
