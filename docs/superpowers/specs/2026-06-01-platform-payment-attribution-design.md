# Server-Side Single-Platform Payment Attribution — Design (v2)

- **Date:** 2026-06-01
- **Branch:** `feature/analytics-payment-tracking`
- **Status:** Validated design (verdict: **BEST-WITH-ADJUSTMENTS**) → ready for implementation plan
- **Domains touched:** `tracking` (primary), `payment`, `metrics-analytics`, `admin`, `billing-stripe`

> **v2 changelog.** This revision folds in two adversarial validation passes: (A) platform-doc + industry + build-vs-buy + codebase-fit validation, and (B) an auth-lifecycle persistence trace (cookie/UTM retention across navigation, login, Google OAuth, the guest→auth bridge, logout, consent). Net result: the **architecture is proven correct** (esp. D7 send-vs-count), but four factual errors and one blocker-class bug were corrected. Material changes vs v1 are tagged **[v2]** inline. See §9 (Validation Verdict) and §10 (Honest Limits) for the evidence trail.

---

## 1. Problem

Meta, TikTok, and Klaviyo each **independently claim the same conversion** inside their own attribution windows. A single payment by a user who saw a Meta ad, a TikTok ad, and opened a Klaviyo email is counted as a conversion by all three. There is no internal source of truth for *which one platform* converted each payment.

**Why no platform can solve this for us (proven):** `event_id` deduplication only works *within* a single platform — that platform's pixel vs its own Conversions API. **No platform can dedupe across platforms** ([Meta](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/), [TikTok](https://ads.tiktok.com/help/article/event-deduplication), [Snap](https://developers.snap.com/api/marketing-api/Conversions-API/UsingTheAPI), [cross-platform analysis](https://analyzify.com/hub/event-deduplication-for-meta-conversions)). So an internal single-winner field is the *only* mechanism that can stop the cross-platform triple-claim.

### Current state (verified against code)

**One ledger, one writer.** Every successful payment writes exactly one `BenefitsGranted` row on `PaymentEvent` (`src/models/PaymentEvent.ts`), `_id = "BenefitsGranted-${paymentIntentId}"`, with a unique compound index on `paymentIntentId + eventType` (natural idempotency). Written only by `processPaymentBenefits()` in `src/utils/payment/payment-processing.ts`, called from the Stripe webhook handlers (`src/services/stripe-webhook-handlers/index.ts`) for one-time, mini-draw, upsell, and subscription (`invoice.payment_succeeded`) payments. A "net conversion" = a `BenefitsGranted` with no matching `RefundProcessed` for the same PI.

**What attribution exists today (verified):**
- `data.utmSource` (+ `utmMedium/Campaign/Content/Term`, `campaignId/adsetId/adId`) — free-text, no enum/normalization. The **only** platform name on the ledger.
- Indexed top-level `attributionAdId/AdsetId/CampaignId` — Meta-shaped, ad-level only, no read-side consumer.
- Click IDs (`fbclid→_fbc`, `ttclid`) live in cookies for CAPI match quality but are **never persisted to the ledger**. `ScCid` (Snap) and Google `gclid` are not captured at all.
- **The purchase path stamps UTM only.** `buildAttributionMetadata` (`src/utils/tracking/attribution-metadata.ts`) is the sole attribution stamper across all five `create-*` Stripe routes; **none** read `_fbc`/`ttclid` cookies. So the converting-platform signal is not on the ledger today — this is the core new work.

**Send path:** Purchase fans out to all enabled CAPIs via `sendConversion` (`src/lib/tracking/dispatch.ts`) plus Klaviyo "Placed Order" independently (`payment-processing.ts:1663`). **Count path:** the admin dashboard (`src/app/api/admin/dashboard/stats/route.ts`) sums revenue into six product-type buckets that are platform-blind.

---

## 2. Locked decisions (with v2 corrections)

| # | Decision | Choice |
|---|---|---|
| D1 | Attribution model | **Priority ladder + recency tiebreak.** Paid clicks (Meta/TikTok/Snap/Google) ⟫ owned channels (Klaviyo email/SMS) ⟫ direct/organic. Within the winning tier, most-recent click timestamp wins. *(Validated as the correct baseline below ~300 conv/mo; the cross-platform recency tiebreak is our own policy — see §10.)* |
| D2 | Klaviyo | **[v2 CORRECTED]** Attribute via the **UTM tuple** `utm_source=klaviyo` + `utm_medium=email\|sms` (+ campaign/flow id), **not** `_kx`. `_kx` is a Klaviyo *profile/identity* token, does not encode channel, and is not a click identifier ([Klaviyo](https://help.klaviyo.com/hc/en-us/articles/360034666712)). Treated first-class but below paid clicks. **Prereq [CONFIRMED 2026-06-01 in live account]:** auto-UTM toggle is ON; `utm_source` value = **`Klaviyo`** (capitalized — the resolver must lowercase/normalize to `klaviyo`); `utm_medium` = **`Message type`** (emits `email`/`sms`/`whatsapp`/`push` — map `whatsapp`/`push` → `other`). `utm_campaign`/`utm_id` currently OFF (optional, recommended for flow-level reporting). Per-campaign/flow opt-out exists — keep it off on live sends. |
| D3 | Windows (internal resolver) | Meta 7d, TikTok 7d, Snapchat 7d, Google 7d (reserved), Klaviyo email 5d, **Klaviyo SMS 5d [v2 CORRECTED from 1d]** (5d is Klaviyo's SMS *click* default; 1d is the *open* window — [Klaviyo](https://help.klaviyo.com/hc/en-us/articles/11118357030555)). Windows are **config-driven**, not hard-coded constants, and pinned to actual Ads-Manager CTA settings. |
| D4 | Backfill | **Forward + lower-fidelity backfill.** New payments resolved live; history backfilled from existing `utm_source`/`attribution*` only, tagged `inferred_backfill`. **Precondition:** UTM normalization (§3.3). |
| D5 | Renewals | **Sticky to acquisition platform** via Stripe `subscription.metadata` (renewal handler already reads it first — `stripe-webhook-handlers/index.ts:3828`). Stored with an `inherited_acquisition` flag so renewal ROAS can be separated from new-acquisition ROAS. **Known divergence:** Meta/TikTok will *not* attribute a 14–60-day-later renewal (click window expired); our ledger deliberately will. Document it (§10). |
| D6 | Google | **Reserve the enum slot, defer `gclid` capture.** |
| D7 | Send vs count | **Keep full CAPI fan-out unchanged** (proven correct — §9). Single-platform resolution is a purely internal accounting field. `dispatch.ts` is untouched. |

**Guiding principle: Send ≠ Count.**

---

## 3. Architecture

### 3.1 Data model

Add to `PaymentEvent` (`src/models/PaymentEvent.ts`), beside the existing `attribution*` fields:

| Field | Type | Indexed | Purpose |
|---|---|---|---|
| `convertingPlatform` | `"meta" \| "tiktok" \| "snapchat" \| "klaviyo_email" \| "klaviyo_sms" \| "google" \| "direct" \| "other" \| null` | ✅ `{ convertingPlatform: 1, timestamp: -1 }` | the single winner |
| `attributionConfidence` | `"click" \| "utm_only" \| "inferred_backfill" \| null` | **[v2]** NOT in the compound index (filter in-memory) | how the platform was determined |
| `isRenewal` | `boolean` | — | **[v2]** `= billing_reason !== 'subscription_create' && !isUpgrade && !isResubscribe` (flags already computed at `index.ts:3509-3533`) — excludes mid-cycle upgrades (`subscription_update`) so they aren't miscounted as new revenue |

**[v2] Persist raw evidence, not just the verdict** (P2 — closes the auditability/reversibility gap). In `data` (Mixed, no migration): `attributedClickId`, `attributedClickTimestamp`, `attributionWindowDays`, and an `observedTouches` array of `{ platform, clickIdPresent, capturedAt }` for every in-window signal seen at decision time. This buys (a) auditability ("why Meta?"), (b) reversibility — re-run the ladder with new windows or graduate to data-driven attribution **retroactively** once volume crosses ~300 conv/mo, with no forward-only gap.

`google` is in the enum but never selected until `gclid` capture is wired. **[v2]** Adding Google later = one enum-array edit applied via the existing delete-cached-model path (`PaymentEvent.ts:139-145`) + one capture/priority row — *not* literally "zero schema change."

### 3.2 Capture layer (Seam A) — durable, login-immune, consent-ungated

**[v2] Core change: collapse UTM + campaign IDs into a single durable first-party cookie, harden the click-ID cookies, and read everything server-side at the conversion edge.** This is what makes attribution survive the auth lifecycle (see §3.7).

**(a) Durable attribution cookie** — replaces the fragile 30-min `sessionStorage` (`tools-aus:utm-attribution`):
- Name e.g. `_ta_attr` (URL-encoded JSON: `utm_source/medium/campaign/content/term`, `campaign_id/adset_id/ad_id`).
- Attributes: `path=/; SameSite=Lax; Max-Age=7776000` (**90d**, matching `_fbc`); `Domain=.toolsaustralia.com.au` + `Secure` in prod; **NOT HttpOnly** (client reads it for pixel fires; server reads it at the `create-*` edge).
- Semantics: **first-touch** — don't overwrite a non-expired value on later param-less landings.
- `getStoredUTMParams` reads the cookie first (legacy `sessionStorage` as transitional fallback).

**(b) Click-ID capture registry** — one declarative table; each entry persists `{ value, capturedAt }`:

```ts
CLICK_CAPTURE_REGISTRY = [
  { platform: 'meta',     urlParam: 'fbclid', cookie: '_fbc' (+_fbc_ts), ttlDays: 90 }, // [v2] also synthesize _fbc at landing
  { platform: 'tiktok',   urlParam: 'ttclid', cookie: 'ttclid' (+ ts),   ttlDays: 7  }, // [v2] ADD capturedAt cookie
  { platform: 'snapchat', urlParam: 'ScCid',  cookie: '_sc_click' (+ ts), ttlDays: 7  }, // [v2] ScCid (case-sensitive), NOT sclid
  // klaviyo: NO click-id cookie — rides the durable UTM cookie (utm_source=klaviyo + utm_medium)
  // google deferred — one row when ready
]
```

**[v2] Capture corrections, all evidence-backed:**
- **Snapchat param is `ScCid` (case-sensitive)**, captured from the URL, sent to CAPI as `sc_click_id` ([Snap](https://developers.snap.com/api/marketing-api/Conversions-API/Parameters)). A lowercase `sccid`/`sclid` match finds nothing. Gate the `snapchat` enum on a captured `ScCid`, not on `utm_source=snapchat`.
- **TikTok `ttclid` has no timestamp today** (`tiktok-helpers.ts`) — a companion `capturedAt` cookie is **mandatory** before `ttclid` may win a recency tiebreak.
- **Synthesize a first-party `_fbc` at landing** when `?fbclid=` is present (`fb.1.<ts>.<fbclid>`, 90d, Lax) so ITP/ad-block users (no Meta SDK) and post-OAuth visits (URL no longer carries `fbclid`) still resolve.
- **Harden all click cookies:** add `Domain=.toolsaustralia.com.au` + `Secure` (prod) to fix the apex↔www host-only split.
- **All new cookies `SameSite=Lax`, never `Strict`** (Strict is NOT sent on the top-level GET back from `accounts.google.com`). Zero `Strict` cookies exist today — keep it that way; add a guard/test.
- **No `_kx` attribution capture.** Klaviyo's signal is the UTM tuple in the durable cookie. `_kx` may be read only for optional identity resolution, documented as identity-not-attribution.

A single `captureClickIds()` + the UTM-cookie writer run on mount in `src/components/tracking/ConversionPixels.tsx` / `useUTMPersistence`, on **every** route (incl. unauthenticated landings), **before** any marketing-consent decision (capture is functional/strictly-necessary; only marketing *dispatch* is consent-eligible — §3.7).

### 3.3 Resolver (Seam B) — config-driven, not an if-ladder

New module `src/services/attribution/resolveConvertingPlatform.ts`, driven by one ordered priority+window table (D1/D3). Algorithm (pure, total, never throws):

1. Keep only signals whose `capturedAt` is within that platform's window at payment time.
2. Highest non-empty tier wins (**paid** ⟫ **owned** Klaviyo ⟫ fallback).
3. Within the winning tier, the **most-recent `capturedAt`** wins → `confidence: "click"` (paid) / `"click"`-equivalent for a timestamped Klaviyo UTM touch.
4. No in-window click → normalize `utm_source` to a platform enum → `confidence: "utm_only"`.
5. Nothing → `direct`.

**[v2] Resolver guards (correctness):**
- **`fbc` timestamp guard.** `facebook-helpers.ts:297` stamps `Date.now()` when the capture-ts cookie is absent — an 8-day-old click would otherwise look fresh. Treat an absent/`now`-defaulted `capturedAt` as `utm_only`-confidence **at best**, never a fresh in-window click.
- **UTM normalization governance** (the #1 DIY-attribution failure mode — dirty `facebook` vs `Facebook` vs `fb`). Enforce a canonical lowercase source taxonomy + explicit `source → platform` map **at capture**, before resolution, because the verdict is frozen at write time.
- **Klaviyo split** (`klaviyo_email` vs `klaviyo_sms`) is read from `utm_medium`, which only exists if account auto-UTM is ON (D2 prereq).

### 3.4 Write path — **hybrid** edge + webhook fallback [v2]

v1 assumed "resolve at the edge" universally. **That is false in your own code:** `create-payment-intent/route.ts:150` does body-only attribution with **no cookie read**, and force-charge/past-due has no HTTP edge at all. So:

1. **Edge (primary):** each `create-*` route calls a new `extractClickIdsFromRequest(req)` (reads `_fbc`/`ttclid`/`_sc_click` cookies + the durable UTM cookie server-side), runs `resolveConvertingPlatform`, and stamps the **decision** (`converting_platform`, `attribution_confidence`, `attributed_click_id`, evidence) into Stripe metadata — **subscription metadata** for subs (→ sticky renewals for free), **PaymentIntent metadata** for one-time/upsell/mini-draw.
2. **Webhook (fallback):** when no decision metadata is present (e.g. `create-payment-intent`, force-charge, legacy), `processPaymentBenefits` runs a fallback resolver using the `sessionAttribution` already extracted at `index.ts:3828`. No entry point silently yields `null`/`direct` for lack of a stamp.
3. **Enumerate every create-route in the plan** — do not assume parity. (`create-subscription` and `upsell/purchase` call `extractRequestContext`; `create-payment-intent` does not.)

**Safety:** resolution is wrapped so it can **never block a payment** — failure ⇒ `direct` + `console.error` (survives prod console stripping).

### 3.5 Read / analytics path (Seam E)

- Extend `DashboardStatsDailySnapshot` (`src/models/DashboardStatsDailySnapshot.ts`) with `attributedRevenue: Map<platform, { revenueCents, conversions, byConfidence }>`, beside the existing product-type `revenue.buckets` and the `adChannels` spend Map.
- `revenueAggregator.ts` + `distinctUserCounts.ts` additionally group by `convertingPlatform`. The snapshot writer/reader populate and sum it.
- `GET /api/admin/dashboard/stats` surfaces `attributedRevenue` per platform alongside the existing `facebookAds` block → **true per-platform ROAS** (our attributed revenue ÷ that platform's `adChannels` spend) for the first time.
- The verdict stays **1:1 on `PaymentEvent`** (one ledger, one writer, natural idempotency) — refund net-conversion (`refund-ledger-reversal.ts`) and per-user lookups need the row-level field; a snapshot-only design can't answer "which platform converted *this* refunded payment." We keep both the row field **and** the snapshot Map.

### 3.6 Backfill (D4)

`scripts/backfill-converting-platform.ts` (+ `backfill:converting-platform:dry` / `backfill:converting-platform`):
- Derives `convertingPlatform` from normalized historical `data.utmSource` + `attribution*` only → `attributionConfidence: "inferred_backfill"`. **Never overwrites** a `click`/`utm_only` row.
- `--dry-run` default-safe; append-mode CSV audit log (mirrors commit `c9ea0220`). Dashboard segments `inferred_backfill` visibly. **Depends on UTM normalization (§3.3) landing first.**

### 3.7 Persistence & auth-lifecycle guarantees [v2 — new section]

The capture layer (§3.2) is designed so attribution survives the full unauthenticated→authenticated→pay journey. Verified facts and required fixes:

**Already safe (don't re-engineer):** `_fbc`/`_fbc_ts` (90d) and `ttclid` (7d) cookies are `SameSite=Lax`, origin-scoped, never deleted — they survive SPA nav, credentials login, the LoginModal popup OAuth, **and** the `/login` top-level Google OAuth redirect (Lax sent on the return GET). No auth callback or `signOut` touches them. Capture is genuinely site-wide (root-layout mounted) and **not** consent-gated today (`hasPixelConsent` is hardcoded `true`).

**Required fixes (each a real loss vector for the user's scenario):**
1. **BLOCKER — remove `sessionStorage.clear()` on 401** (`useErrorHandling.ts:230`, the only `.clear()` in `src`). It bulk-wipes UTM + A/B + promo + referral + affiliate + upsell on any 401 before purchase. Replace with targeted removal of auth keys by name. (The durable UTM cookie also makes UTM survive this regardless.)
2. **Migrate UTM off 30-min `sessionStorage` to the durable cookie** (§3.2a) — fixes both the 30-min TTL (vs 90d/7d cookies) and the `/login` top-level-OAuth-redirect loss (`sessionStorage` may be discarded across the cross-origin round-trip; cookies are not).
3. **Decouple `signupAttribution` from the promo-slug gate** (`register/route.ts:217`): persist the snapshot whenever attribution params are present; make `promotionSlug` an optional field, not the gate for the whole snapshot. (Today a homepage ad-lander's signup attribution is silently dropped.)
4. **`Domain` + `Secure`** on all attribution cookies (apex↔www).

**Cookie attribute contract (all attribution cookies):** `path=/`, `SameSite=Lax` (never Strict), `Domain=.toolsaustralia.com.au` + `Secure` in prod, non-HttpOnly. UTM cookie 90d first-touch; click cookies per-platform TTL.

---

## 4. Phasing

1. **Foundation** — *(1a) Persistence hardening:* durable UTM cookie + harden/standardize click cookies + remove `sessionStorage.clear()` + decouple `signupAttribution`. *(1b) Attribution core:* data-model fields + capture registry (ScCid, `capturedAt`, synthesized `_fbc`) + resolver (+ guards + UTM normalization) + hybrid write path across all 5 create-routes + webhook fallback. *Win:* every new payment is correctly single-attributed and survives the auth lifecycle.
2. **Dashboard** — snapshot `attributedRevenue` dimension + `/stats` response + admin UI revenue-by-platform and true per-platform ROAS. *Win:* the data is visible.
3. **Backfill** — UTM normalization of history + script + confidence labeling. *Win:* history populated, clearly tiered.

## 5. Out of scope (seams left clean)

- **Snapchat CAPI** (still a stub — `providers/snapchat.ts`); we only add `ScCid` capture so it can self-attribute internally once CAPI lands.
- **TikTok/Snapchat insights & spend sync** (models exist, no writer) — per-platform ROAS for those waits on a Marketing-API sync. `AdChannelProvider` registry is the append-one seam.
- **Google `gclid` capture** — enum slot reserved.
- No platform flipped from "shell" to "live."

## 6. Testing

`tsx` regression tests (add matching `test:*` npm scripts):
- `resolveConvertingPlatform`: priority ladder, recency tiebreak, window-boundary edges (6d23h vs 7d1h), `klaviyo_email` vs `klaviyo_sms` via `utm_medium`, `utm_only` fallback + de-aliasing map, `direct` fallback, renewal stickiness, **`isRenewal` excludes `subscription_update`**, **`fbc` `now`-default demoted to `utm_only`**, **absent `ttclid` timestamp cannot win tiebreak**.
- Backfill dry-run: confidence tagging + no-overwrite guarantee + normalization.
- **Persistence:** cookie attributes (`SameSite=Lax`, `Domain`, `Secure`); assertion that no attribution cookie uses `Strict`; `signupAttribution` persists without a promo slug; 401 handler no longer clears the UTM cookie.
- **Runtime (manual, §10):** real Google OAuth round-trip on `/login` — confirm the durable UTM cookie survives across Chrome/Safari(ITP)/Firefox.

## 7. Documentation updates (Domain Manifest)

- **tracking** (`docs/tracking/`) — primary: capture registry, durable cookie contract, resolver, `convertingPlatform` enum + windows + priority policy, Send-vs-Count rule, persistence/auth-lifecycle guarantees; `architecture.md`, `models.md`, `backend.md`, `frontend.md`, `gotchas.md`, `patterns.md`, `EVENT_PARAMETER_MATRIX.md`, `rules.md`, `KLAVIYO_INTEGRATION.md`, `TIKTOK_EVENTS_API_IMPLEMENTATION.md`.
- **payment** — `models.md` (new fields), `architecture.md`, `backend.md` (hybrid resolver call), `rules.md`, `gotchas.md`.
- **metrics-analytics** — `architecture.md`.
- **admin** — `backend.md`, `api.md`, `models.md`, `architecture.md`.
- **billing-stripe** — `models.md`, `gotchas.md` (decision keys + raw-evidence in Stripe metadata; ledger-vs-dashboard divergence).
- **Canonical:** `docs/PAYMENT_ATTRIBUTION.md` + `docs/UTM_ATTRIBUTION.md`.
- **README.md / BUSINESS.md:** no change — internal accounting only; no tier/access/pricing change; no ad platform flipped to "live."

## 8. Resolved questions

All seven decisions (§2) are locked, with v2 corrections applied.

---

## 9. Validation verdict (evidence trail)

**Verdict: BEST-WITH-ADJUSTMENTS.** Correct approach for *this* business at *this* scale (sub-threshold, no warehouse, custom Next.js + Stripe). The core engine (D7) is **proven correct**; four factual errors (now fixed in §2/§3.2) had to be corrected first.

**Proven correct:**
- **D7 send-vs-count** — every platform dedupes only its own pixel-vs-CAPI on `event_id`; none dedupe across platforms, so the internal enum is the only fix and gating sends would starve bidders (browser-only loses 20–30% conversions). [Meta dedup](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/), [Meta best practices](https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices/), [TikTok](https://ads.tiktok.com/help/article/event-deduplication), [Snap](https://developers.snap.com/api/marketing-api/Conversions-API/UsingTheAPI).
- **D1 priority ladder** is the recommended baseline below ~300 conv/mo; data-driven attribution needs that volume to not be noise ([Improvado](https://improvado.io/blog/multi-touch-attribution), [GA4 last-click model](https://support.google.com/analytics/answer/10596866)).
- **D3 Meta 7d** matches Meta's current default (7-day click; 7d/28d view removed Jan-2026) ([Meta](https://www.facebook.com/business/help/2198119873776795)).
- **D5 sticky renewals** is a recognized subscription pattern ([Cometly](https://www.cometly.com/post/subscription-business-attribution)) and verified free in code.

**Alternatives, scored (build wins decisively):**
| Alternative | Verdict | Reason |
|---|---|---|
| **Build-on-ledger (this design)** | **WINS** | Only option that stamps a single-winner enum into *your* Stripe ledger AND ties renewals to acquisition channel; near-zero marginal cost. |
| Buy a tool (Triple Whale / Northbeam) | LOSES | Triple Whale is Shopify-only; Northbeam floors ~$50k/mo spend; none model Stripe renewal stickiness. |
| CDP/warehouse (Segment + dbt) | LOSES | Batch dbt runs *after* the browser cookies are gone; you'd capture at the edge anyway, then pay for infra to recompute. CLAUDE.md §4 forbids speculative infra. |
| Data-driven / algorithmic | LOSES now, right later | Needs ~300+/mo conversions; below that it's statistical noise. (Why §3.1 keeps raw evidence — clean graduation path.) |
| Separate `AttributionEvent` collection | PARTIAL | Verdict belongs 1:1 on PaymentEvent; the *evidence* gap it flags → solved by raw-evidence fields on the same row. |
| Resolve in webhook (raw IDs) | SITUATIONAL → hybrid | Webhook never sees cookies; adopt as the **fallback** layer (§3.4), not primary. |

## 10. Honest limits & residual risks (not papered over)

1. **View-through and machine-opens are structurally uncapturable by a click-based ladder.** Meta 1d VTA, TikTok 6-sec EVTA, and Klaviyo open/MPP-auto-open conversions have *no click*. "Stop every platform claiming the same conversion" is **unachievable for view-through by any design.** Market the ledger as reconciling **click-based conversions only**; it will deliberately diverge from each platform's dashboard.
2. **Cross-platform recency tiebreak is our own policy**, unvalidated against incrementality (no holdout). Acceptable at this scale; the raw-evidence fields (§3.1) make it reversible.
3. **D5 multi-year ROAS distortion** — sticky renewals over-credit the acquisition channel across a multi-year horizon. Mitigated by the `inherited_acquisition` flag so renewal ROAS is separable.
4. **`convertingPlatform` has zero effect on any platform's dedup** (keyed on `event_id`, never our enum). Add a code comment so no one assumes otherwise.
5. **Medium-confidence external facts** (keep windows tunable): Snapchat 7d window (Snap's default is 28d-click/1d-view; 7d is a deliberate strict choice; `ScCid` casing is verbatim-confirmed, the window is partner-doc); Meta Jan-2026 view-window removal scope (documented vs Insights API; confirm it touches optimization windows); Meta 48h dedup-window figure (mechanism is high-confidence, the 48h number is third-party). TikTok/Snap CTA windows are ad-group-configurable to 14/28d — if a campaign runs longer, bump the internal window or accept known under-credit.
6. **Runtime tests still required** (static reading can't settle): does per-tab `sessionStorage` survive a real `/login` Google OAuth redirect (mooted once the cookie migration lands, but verify any interim); which 401 endpoints actually fire pre-purchase; staging capture needs the host added to `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` + the testing flag or it silently captures nothing.
