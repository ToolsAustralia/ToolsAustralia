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

---

## Single-Platform Resolution Model (2026-06-01)

The v1 system above captures raw UTM + campaign IDs and writes them to `PaymentEvent.data` but does not collapse them to a single winner. The single-platform resolver adds that final step.

### How it works

At the `create-*` route edge, the resolver (`src/services/attribution/`) reads the durable `_ta_attr` cookie (90-day first-party, written at landing by the client) plus any click IDs in the request body, and assigns exactly **one** `convertingPlatform` and `attributionConfidence` per payment. The resolved values are stamped into Stripe metadata (`attr_platform`, `attr_confidence`, `attr_click_id`, `attr_click_ts`) and then persisted on `PaymentEvent` by the Stripe webhook handler.

For renewals the resolver reads from `subscription.metadata` written at initial purchase — no client-side signal needed on renewal, making attribution sticky for the subscription lifetime.

### Webhook-time reconcile (`reconcilePersistedAttribution`)

The edge resolver is **cookie-only**, so before the webhook persists the `PaymentEvent` it runs `reconcilePersistedAttribution` (`src/services/attribution/reconcilePersistedAttribution.ts`) to merge the edge decision with the UTM persisted on the event (session UTM, else the user's `signupAttribution`). When the edge yielded `direct`, two persisted-signal classes can be recovered, with different strictness:

- **Owned channels (Klaviyo email/SMS)** — recovered leniently: unknown touch timing still counts (signup-era Klaviyo data predates timestamps), gated by the 5d window when timing is known.
- **Paid platforms (meta/tiktok/snapchat/google)** — recovered **strictly** (2026-07-19): only when the persisted touch is *affirmatively* inside the platform's click window (7d), anchored to a REAL persisted date. In practice that means **signup-sourced UTMs only**, anchored to the **captured ad-visit time** (`persistedTouchAt = resolveSignupTouchAtMs(signupAttribution.visitedAt, user.createdAt)` — `visitedAt` is stamped at the promo landing that carried the UTM; `createdAt` is only the legacy fallback). Anchoring on account age was itself a bug (fixed same day): registration refreshes `signupAttribution` in place for returning accounts, so a 196-day-old member who clicked a BOF retargeting ad 62 seconds before buying was wrongly "stale". **Session-carried UTMs are undatable and never recovered as paid**: the client payload prefers the 90-day first-touch cookie with `capturedAt` stripped, and renewals re-carry frozen subscription metadata — dating those "now" would fabricate freshness, resurrect stale paid touches the edge correctly ruled out, and flip every renewal. So a stale or undatable paid UTM stays `direct` — the ledger never resurrects a paid touch it cannot date. (Known bounded over-credit: an organic re-registration capturing a still-live <90d cookie UTM gets `visitedAt` = registration time; stamping the cookie's own `capturedAt` into Stripe metadata would remove this — not built yet.) Regression-guarded by `npm run test:reconcile-attribution`.

### New PaymentEvent fields

| Field | Values |
|---|---|
| `convertingPlatform` | `meta \| tiktok \| snapchat \| klaviyo_email \| klaviyo_sms \| google \| direct \| other` |
| `attributionConfidence` | `click \| utm_only \| inferred_backfill` |
| `isRenewal` | `boolean` |

### Honest limits of this ledger

- **View-through conversions are not tracked.** The ledger counts only click-based conversions: `fbclid` / `_fbc`, `ttclid`, `ScCid`, and Klaviyo-email/SMS UTM signals. A user who saw an ad but did not click will be attributed as `direct`.
- **Klaviyo-open conversions are not tracked.** Klaviyo's `_kx` parameter is not used for attribution (it cannot be re-read server-side reliably). Klaviyo is attributed only when `utm_source=klaviyo` + `utm_medium=email|sms` are present.
- **The ledger will deliberately diverge from each platform's dashboard.** Each ad platform uses its own attribution model (view-through, click, post-view windows). This ledger uses click-only with fixed recency windows (Meta/TikTok/Snap 7d, Klaviyo email/SMS 5d). The divergence is by design: the ledger provides a consistent, auditable cross-platform view, not a replica of any single platform's number.
- **One payment = one platform.** Multi-touch attribution is intentionally excluded. The most-recent click-ID within its recency window wins.

### Relationship to CAPI fan-out

CAPI dispatch to Meta, TikTok, and Snap is **unchanged** — all enabled platforms continue to receive their conversion events. The single-platform ledger is an analytics layer on top of that signal layer; it does not filter what gets sent to the platforms.

---

---

## Backfill (historical rows)

### Phase 1 (live, forward-fill)

The single-platform resolver runs at the `create-*` route edge for every payment from its deploy date onward. New `BenefitsGranted` events are stamped with a live `convertingPlatform` (`click` or `utm_only` confidence) before the Stripe webhook handler persists them — no backfill required for these rows.

### Phase 2 (inferred backfill)

Historical `BenefitsGranted` rows written before the resolver shipped have `convertingPlatform: null`. The script [`scripts/backfill-converting-platform.ts`](../scripts/backfill-converting-platform.ts) fills these in post-hoc using `deriveBackfillAttribution`, which reads:

- `data.utmSource` / `data.utmMedium` — UTM signals already captured on the event.
- Indexed `attribution*` Meta ad-id fields (`campaignId`, `adsetId`, `adId`) — available on events that carried click IDs at purchase time.
- `data.billingReason` — to set the `isRenewal` flag.

All rows resolved by this script are tagged `attributionConfidence: "inferred_backfill"`. The dashboard segments by confidence so `inferred_backfill` rows never inflate live `click` / `utm_only` ROAS figures — they appear in a separate breakdown tier.

### Idempotency guarantee

The backfill filter is `{ eventType: "BenefitsGranted", convertingPlatform: null }`. Live-resolved rows (`click` or `utm_only`) and previously backfilled rows (`inferred_backfill`) are never overwritten. Re-running the script after a partial failure is safe and converges.

### Dashboard segmentation

The dashboard's `byConfidence` breakdown surfaces three tiers: `click`, `utm_only`, and `inferred_backfill`. Attribution confidence affects only the analytics layer — ROAS exclusion for renewals continues to use `packageType + data.billingReason`, not the `isRenewal` flag that the backfill sets.

See [`docs/infrastructure/architecture.md` — Converting-platform attribution backfill](./infrastructure/architecture.md#converting-platform-attribution-backfill) for the full runbook, CLI flags, and exit-code reference.

---

## Related Documentation

- [UTM_ATTRIBUTION.md](./UTM_ATTRIBUTION.md) — UTM capture and storage
- [DATA_SOURCES_EXPLANATION.md](./DATA_SOURCES_EXPLANATION.md) — Revenue data sources
- [tracking/FACEBOOK_TRACKING_IMPLEMENTATION.md](./tracking/FACEBOOK_TRACKING_IMPLEMENTATION.md) — CAPI and ROAS
