# Event Parameter Matrix — TikTok & Meta

**Status:** Verified against code 2026-05-22. **Domain:** `tracking`.

This is the single reference for **exactly what data we send to TikTok and Meta**, on which surface (browser pixel vs server API), what is hashed vs raw, and how events deduplicate. It's the map for diagnosing match-quality (EMQ) and "parameter mismatch" issues.

> **What drives EMQ / match quality:** the **customer-information (identity) parameters**, not the content parameters. Email, phone, external_id, click-id (ttclid/fbc), browser-id (ttp/fbp), IP, and user-agent are what platforms match against their user graph. content_id / content_name / value affect *reporting, catalog/VSA, and optimization*, **not** the match score.

---

## 1. Architecture recap

Every conversion flows through the canonical registry ([`src/lib/tracking/`](../../src/lib/tracking/)):

- **Browser:** `trackConversion(event)` / `tiktokProvider.pixelTrack(event)` / `fbq('track', …)` — fires the on-page pixels.
- **Server:** `sendConversion(event, ctx)` → each provider's `capiSend` — fires Meta CAPI + TikTok Events API.
- **Dedup glue:** one `event_id` shared by both surfaces of a platform. TikTok matches `event` name + `event_id` + pixel (48h window); Meta matches `event_name` + `event_id`.

Two server entry points:
- **Purchase:** `trackPixelPurchase(...)` from the Stripe webhook ([pixel-purchase-tracking.ts](../../src/utils/tracking/pixel-purchase-tracking.ts)) → `sendConversion`.
- **Funnel events** (ViewContent / AddToCart / InitiateCheckout / AddPaymentInfo / Lead): browser fires via [`usePixelTracking`](../../src/hooks/usePixelTracking.ts) `fireFunnelEvent`, which fires the FB + TikTok browser pixels **and** mirrors to `/api/tracking/conversion` → `sendConversion`, all sharing one `event_id`.

> **Optional `userData` on the mirror.** `fireFunnelEvent` (and the `trackInitiateCheckout` / `trackAddPaymentInfo` wrappers) accept an optional `userData: MirrorUserData` that is forwarded **only to the CAPI mirror**, never to the browser pixel calls. The mirror runs it through `stripEmpty` (drops `undefined` / `null` / `""`) and `/api/tracking/conversion` SHA-256-hashes the supplied fields server-side via `hashPII` → `em / ph / fn / ln / ct / st / zp / country / db / external_id`. Fields: `email, phone, firstName, lastName, city, state, zipCode, country, birthdate, externalId`. fbc/fbp/IP/UA are server-derived and intentionally excluded from `MirrorUserData`. `fireFunnelEvent` also threads `packageType` through to CAPI `custom_data` (AddPaymentInfo needs it; without the passthrough it was dropped).

---

## 2. TikTok — events & surfaces

| Event | Browser pixel | Events API (server) | Deduped | Source |
|---|---|---|---|---|
| `Pageview` (native) | ✅ `ttq.page()` | — | n/a | [ConversionPixels](../../src/components/tracking/ConversionPixels.tsx) load + SPA route change |
| `Purchase` | ✅ | ✅ | ✅ (`event_id = paymentIntentId`) | success pages (browser) + Stripe webhook (server) |
| `ViewContent` | ✅ (content_id) | ✅ (mirror) | ✅ (shared mirror id) | `usePixelTracking.trackViewContent` |
| `AddToCart` | ✅ | ✅ (mirror) | ✅ | `trackAddToCart` |
| `InitiateCheckout` | ✅ | ✅ (mirror) | ✅ | `trackInitiateCheckout` (MembershipModal) |
| `AddPaymentInfo` | ✅ | ✅ (mirror) | ✅ | `trackAddPaymentInfo` |
| `Lead` | ✅ | ✅ (mirror) | ✅ | `trackLead` |
| `CompleteRegistration` | ✅ | — | browser-only | `trackCompleteRegistration` |
| `Subscribe` | ✅ (legacy helper) | — | browser-only | `trackPixelSubscription` |
| `Search` / `Contact` | ✅ (legacy helper) | — | browser-only | `trackSearch` / `trackContact` |

> Renamed events: TikTok renamed **`CompletePayment` → `Purchase`** and **`SubmitForm` → `Lead`**; we use the new names. `PlaceAnOrder` is sunset in 2027.

### TikTok — event (content) parameters

| Canonical field | TikTok key | Surface | Notes |
|---|---|---|---|
| `value` | `value` | pixel `properties` + Events API `properties.value` | total order value (number) |
| `currency` | `currency` | both | ISO 4217 (AUD) |
| `customData.contentType` | `content_type` | both | "product" |
| `customData.orderId` | `order_id` | both | paymentIntentId |
| `customData.contentIds[]` | `contents[].content_id` | both | array of items |
| `customData.contentName` | `contents[].content_name` + `content_name` | both | only when set (see gap §5) |
| `customData.numItems` | `contents[].quantity` | both | per-item quantity |
| `customData.searchString` | `query` | Events API | Search events |
| `eventSourceUrl` | `page.url` | Events API | — |

### TikTok — customer information parameters (identity → EMQ)

| Source | TikTok key | Hashed? | Where set |
|---|---|---|---|
| email | `user.email` | **SHA-256** (lowercase+trim) | server: `mapCanonicalToTikTokEvent`; browser: `ttq.identify` (SDK hashes) |
| phone | `user.phone_number` | **SHA-256** (E.164 first, via `normalizePhoneE164`) | server + `ttq.identify` |
| user `_id` | `user.external_id` | **SHA-256** | server + `ttq.identify` |
| ttclid | `user.ttclid` | **raw** | URL `?ttclid=` → cookie ([captureTikTokClickId](../../src/utils/tracking/tiktok-helpers.ts)); server reads cookie; pixel auto-attaches |
| `_ttp` cookie | `user.ttp` | **raw** | server reads cookie (`extractTikTokContext`); pixel sets/uses it |
| IP | `user.ip` | **raw** | server from request headers |
| user-agent | `user.user_agent` | **raw** | server from request headers |

**Endpoint:** `POST https://business-api.tiktok.com/open_api/v1.3/event/track/`, header `Access-Token`, body `{ event_source:"web", event_source_id:<pixelId>, test_event_code?, data:[…] }`. Success = HTTP 200 **and** body `code === 0`.

---

## 3. Meta — events & surfaces

| Event | Pixel | CAPI | Deduped | Source |
|---|---|---|---|---|
| `PageView` | ✅ | — | n/a | pixel init + SPA route change |
| `Purchase` | ✅ | ✅ | ✅ (`event_id = paymentIntentId`) | success pages + Stripe webhook |
| `ViewContent` / `AddToCart` / `InitiateCheckout` / `AddPaymentInfo` / `Lead` | ✅ | ✅ (mirror) | ✅ | `usePixelTracking` |
| `CompleteRegistration` | ✅ | ✅ | ✅ | register route + browser |
| `Subscribe` (initial) | ✅ | ✅ | ✅ | `trackPixelSubscription` |
| `MembershipUpgrade` / `MembershipDowngrade` (custom) | — | ✅ | n/a | upgrade/downgrade routes |

> Renewals are intentionally **not** sent to Meta as Purchase (avoids inflating the optimization signal).

### Meta — custom_data (content parameters)

`value`, `currency`, `order_id`, `content_ids[]`, `content_type`, `content_name`, `content_category`, `num_items`, `package_type`, `search_string` — built in [facebook.ts](../../src/lib/facebook.ts) / [providers/facebook.ts](../../src/lib/tracking/providers/facebook.ts).

### Meta — user_data (identity → EMQ)

| Source | Meta key | Hashed? |
|---|---|---|
| email | `em` | **SHA-256** |
| phone | `ph` | **SHA-256** (digits) |
| first / last name | `fn` / `ln` | **SHA-256** |
| city / state / zip | `ct` / `st` / `zp` | **SHA-256** |
| country | `country` | **SHA-256** (2-letter) |
| birthdate | `db` | **SHA-256** (`YYYYMMDD`) |
| user `_id` | `external_id` | **SHA-256** |
| fbc (click id) | `fbc` | **raw** |
| fbp (browser id) | `fbp` | **raw** |
| IP | `client_ip_address` | **raw** |
| user-agent | `client_user_agent` | **raw** |

**Browser Advanced Matching** ([ConversionPixelsAdvancedMatching](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) → `buildAdvancedMatching`): `em, fn, ln, ph, st, db, country, external_id` set via `fbq('init', pixelId, AM)` on login — applies to every subsequent browser event.

**Endpoint:** `POST https://graph.facebook.com/v23.0/<pixelId>/events`, body `{ data:[…], access_token, test_event_code? }`.

---

## 4. The golden rule: hashed vs raw

| | Hashed (SHA-256, lowercase+trim) | Sent raw |
|---|---|---|
| **TikTok** | email, phone_number (E.164), external_id | ttclid, ttp, ip, user_agent |
| **Meta** | em, ph, fn, ln, ct, st, zp, country, db, external_id | fbc, fbp, client_ip_address, client_user_agent |

Same `hashPII` helper ([canonical-event.ts](../../src/lib/tracking/canonical-event.ts)) is used server-side for both, and the browser SDKs (`ttq.identify`, `fbq` AM) hash with identical normalization — so browser and server hashes match and the platforms can merge identity across surfaces. **Never pre-hash a field the SDK already hashes (double-hash = no match); never hash a raw field (breaks click/IP matching).**

---

## 5. Parameter coverage status — no outstanding gaps

No outstanding **functional** or **EMQ** gaps. The reporting-param items from the initial audit are resolved:

- **`content_name` on Purchase** — ✅ now sent on **both** surfaces. Server: `trackPixelPurchase` maps `packageName → contentName`. Browser: the membership/upsell/mini-draw success clients pass `contentName: status.data.packageName` (same `packageName` source as the server, so the values match — no parameter-mismatch). Improves readable reporting + catalog matching.
- **`content_id` on funnel pixel events** — ✅ fixed via `fireFunnelEvent`; each funnel caller passes `contentIds`/`productId` (resolved the "content_id not received" Pixel-Helper warning).
- **Multi-item `quantity`** — ✅ `quantity` (and `content_name`) are per-row; the order-wide `numItems` is only stamped as `quantity` when there's a single `content_id`, so multi-line carts won't duplicate the total across rows.
- **Per-item `price` in `contents`** — **N/A by design.** TikTok's `price` is a per-item catalog / Video-Shopping-Ads field. Tools Australia has no product feed, and the order-wide `value` is the revenue signal TikTok uses for ROAS. Deriving a unit `price` would be speculative data, so we intentionally omit it. Revisit only if a product catalog + VSA campaigns are introduced.
- **Shop checkout (`CheckoutSuccessClient`)** — browser-only Purchase (no server CAPI), so `content_name` parity is moot there. A shop-order **server** CAPI is a separate, pre-existing follow-up (from the Meta parity spec), not a TikTok gap.

---

## 6. Verification

- TikTok: Events Manager → **Test Events** (with `TIKTOK_TEST_EVENT_CODE`). A purchase should show browser + server `Purchase` with the **same `event_id`**, deduped to one, and identity params present.
- Meta: Events Manager → **Test Events** + **Diagnostics**; EMQ ≥ 7 ("Good") and no "parameter mismatch" on Purchase.
- Tests: `npm run test:tiktok-capi`, `npm run test:tracking-dispatch`, `npm run test:facebook-capi`, `npm run test:advanced-matching`.
