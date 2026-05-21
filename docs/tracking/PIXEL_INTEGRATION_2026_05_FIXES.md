# Pixel Integration Fixes — 2026-05

Changes landed on `feature/pixel-integrations`. Six phases. Use this as the changelog when reviewing the PR.

## Summary of behavior changes

| Symptom (before) | Cause | Fix |
|---|---|---|
| CompleteRegistration count looked ~2× real signups (18.2K vs ~2.9K Purchases) | `trackFacebookEvent` put `eventID` inside the 3rd-arg customData, so Meta never deduplicated Pixel↔CAPI | Phase 2 — pass `eventID` as 4th-arg options object per [Meta dedup spec](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/) |
| PageView 103.3K with EMQ only 6.5/10 | Pixels fired on `/admin/**`, `/my-account/**`, `/affiliate/**` — admin & repeat-customer sessions dragged match quality down | Phase 3 — `shouldTrackRoute()` gate suppresses PageView/ttq.page()/Klaviyo "Viewed Page" on internal prefixes |
| "Subscribe — last received 3 days ago, 1 warning" | Upgrade/downgrade routes called client-side `trackFacebookEvent` server-side → no-op, no event ever fired | Phase 5 — replaced with `sendFacebookEvent` CAPI calls using Custom Events `MembershipUpgrade` / `MembershipDowngrade` |
| Graph API `v18.0` hardcoded | Expired Jan 26, 2026 — Meta auto-routes expired versions, which is fragile | Phase 1 — `FB_GRAPH_API_VERSION = "v23.0"` constant |
| AddPaymentInfo EMQ 6.1/10 with weird low-value events | `/checkout` mock page fired real `InitiateCheckout` + `AddPaymentInfo` events with mockCartItems data | Phase 4 — removed mock-cart pixel calls; re-add when real shop ships |
| `fbc` parameter constructed with `Date.now()` on every event | Per [Meta spec](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc), timestamp must be click-capture time | Phase 4 — read Meta's `_fbc` cookie when present; otherwise persist `_fbc_ts` capture timestamp |
| Webhook-initiated Purchase claimed `action_source: "website"` with synthetic `event_source_url: "https://example.com/dev-checkout"` | Hardcoded "website" in `buildFacebookPurchaseEventDev` | Phase 4 — `action_source: "system_generated"` for webhook path |
| PageView could double-fire on slow connections | 2-second JS-side fallback timer | Phase 4 — removed; `fbq` queues commands until library loads, fallback was redundant |
| `/test-pixels` page reachable in prod, could fire real test events | No env gate | Phase 4 — `notFound()` when `NODE_ENV === "production"` |
| `trackPurchaseWithExperiment` and 2 siblings sent Pixel+CAPI Purchase **without** matching event_ids | Constructed CAPI event with no `event_id` field | Phase 4 — deleted; entire `src/utils/tracking/ab-testing/` folder removed (3 files, 233 lines, zero callers) |
| TikTok pixel had no `event_id` plumbing | `trackTikTokEvent` passed `eventID` (camelCase) which TikTok ignored | Phase 5 — `trackTikTokEvent` normalizes `eventID` → `event_id` (snake_case per TikTok's spec) |

## What to watch in Events Manager over the next 7 days

- **CompleteRegistration daily count should drop ~50%** as Meta starts deduping the Pixel+CAPI pair. Compare 7-day average pre/post deploy.
- **PageView EMQ should rise** above 6.5/10 — admin/account sessions stop contributing low-signal events.
- **Subscribe event count drops to ~zero** (only initial signups now); two new Custom Events `MembershipUpgrade` and `MembershipDowngrade` appear.
- **Purchase total should be unchanged** — the dedup path was already working for Purchase (verified via server 34 vs browser 32 split in screenshots before the work). EMQ may improve slightly from cleaner `event_source_url` and consistent `fbc`.
- **Ad spend should not change.** This work touches the Conversions API and Pixel — not Marketing API. ROAS may shift as conversion counts re-baseline; give it ~7 days.

## Files touched (full list)

**Added (3):**
- `docs/tracking/FACEBOOK_TRACKING_IMPLEMENTATION.md` — replaces the old root-level doc; describes current state accurately
- `docs/tracking/PIXEL_INTEGRATION_2026_05_FIXES.md` — this changelog
- `src/utils/tracking/should-track-route.ts` — route-gating helper

**Modified (10):**
- `src/lib/facebook.ts` — `FB_GRAPH_API_VERSION` constant; `actionSource` param on `buildFacebookPurchaseEventDev`
- `src/components/FacebookPixel.tsx` — 4-arg fbq dedup; route gating; PageView fallback removed
- `src/components/TikTokPixel.tsx` — route gating; `eventID` → `event_id` normalization; quieter logging
- `src/components/KlaviyoPageTracker.tsx` — route gating
- `src/utils/tracking/facebook-helpers.ts` — `_fbc_ts` capture-timestamp cookie; `extractFBCFromRequest` prefers `_fbc` cookie
- `src/utils/tracking/pixel-purchase-tracking.ts` — `actionSource` plumbing; dead code deleted; Custom Event tier-change rewrites
- `src/utils/payment/payment-processing.ts` — webhook caller passes `actionSource: "system_generated"`
- `src/app/api/stripe/upgrade-subscription-payment/route.ts` — passes user PII + `requestContext` for EMQ
- `src/app/api/stripe/downgrade-subscription/route.ts` — same
- `src/app/test-pixels/page.tsx` — `notFound()` in production
- `src/app/(site)/checkout/components/CheckoutPageClient.tsx` — removed mock-cart Pixel calls
- `docs/PAYMENT_ATTRIBUTION.md` — cross-reference update

**Deleted (4):**
- `docs/FACEBOOK_TRACKING_IMPLEMENTATION.md` (moved to `docs/tracking/` with corrected content)
- `src/utils/tracking/ab-testing/tracking-wrappers.ts`
- `src/utils/tracking/ab-testing/pixel-integration.ts`
- `src/utils/tracking/ab-testing/experiment-metadata.ts`

## Not done (deliberately deferred)

- **TikTok Events API server-side integration** — the client-side TikTok Pixel was made dedup-ready (`event_id` plumbing). The server-side Events API call is a separate piece of work.
- **Snapchat pixel** — not integrated yet. Do it after this work has stabilized so the impact is measurable in isolation.
- **`src/lib/facebook-marketing.ts` Graph API bump (v21 → v23)** — separate concern, response-shape risk for `actions` field, currently safe through Oct 2026. Bump in its own PR with explicit before/after ROAS comparison.
- **GTM admin-route filter** — must be done in the GTM UI as a trigger filter; not code. Pattern: exclude pathnames matching `^/(admin|my-account|affiliate|test-pixels|dev)(/|$)`.
- **Consent modal** — system is in auto-accept mode (`hasPixelConsent() === true`). Wire a real consent flow when needed for GDPR/CCPA jurisdictions.
- **Test infrastructure** — no test runner exists in this branch. Verification done via static analysis + type-check + lint + manual trace.

## Verification checklist

- [x] `npm run type-check` — no new errors (only pre-existing PNG-import errors)
- [x] `npm run lint` (on all touched files) — clean
- [x] Confirmed no callers reference deleted `trackPurchaseWithExperiment`, `trackPixelSubscription`, `trackPixelCancellation`
- [ ] **Manual smoke test before merge:** load `/admin/dashboard` in dev, confirm no PageView in Meta Pixel Helper extension. Load `/shop`, confirm PageView fires.
- [ ] **Post-deploy smoke test:** trigger one real CompleteRegistration in prod, check Events Manager for ONE event (not two) with dedup status.
- [ ] **Day-7 review:** compare CompleteRegistration count to pre-deploy baseline. Should be ~50%.
