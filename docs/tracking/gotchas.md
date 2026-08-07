# Tracking — Gotchas

## Owned channels (Klaviyo) MUST resolve last-touch, not first-touch

**Incident (June 2026):** after server-side payment attribution shipped (~Jun 1), Klaviyo conversions cratered in the dashboard — `convertingPlatform=klaviyo_*` ran ~100% of `data.utmSource=klaviyo` Mar–May (backfilled), then dropped to ~55% from Jun 1, the rest leaking to **`direct`**. **Not a Klaviyo config problem** — landings and `data.utmSource=Klaviyo` kept coming at normal volume (Klaviyo's `utm_source=klaviyo` + `utm_medium=email|sms` tagging was fine the whole time).

Root cause: the live resolver read the **first-touch** `_ta_attr` cookie (90-day, never overwritten). Klaviyo email/SMS is a **returning-user** channel, so the recipient's first touch is almost always an earlier acquisition source (or a no-UTM visit → no cookie). The first-touch model therefore never saw the Klaviyo touch → `direct`. The 5-day Klaviyo window measured against the (old) first-touch `capturedAt` made it worse.

Fix (June 2026): owned channels resolve **last-touch** via the overwriting [`_ta_attr_last`](../../src/utils/tracking/attribution-cookie.ts) cookie ([`resolveConvertingPlatform`](../../src/services/attribution/resolveConvertingPlatform.ts), `isOwnedChannel`). Tests: `npm run test:converting-platform`, `npm run test:attribution-cookie`. **Lesson:** a single global first-touch model is wrong for owned/re-engagement channels — keep paid first-touch, owned last-touch.

**Update (2026-07): owned channels now race paid clicks on recency (no longer a lower tier).** The June fix ranked owned last-touch *below* every in-window paid click; it now competes in ONE recency race at the SAME level (product decision — see [architecture.md → "Attribution resolver — unified recency race"](./architecture.md)). So a more-recent Klaviyo last-touch beats an *older* in-window Meta/TikTok paid click, not just an untrusted (`capturedAt: null`) one. On an exact recency tie the paid click still wins. Windows/confidence unchanged (paid 7d/`click`, Klaviyo 5d/`utm_only`); `PlatformRule.tier` was replaced by an `owned: boolean` flag.

**SIGNUP-touch leak — closed by [`reconcilePersistedAttribution`](../../src/services/attribution/reconcilePersistedAttribution.ts) (June 2026):** the resolver's `attr_platform` win path is cookie-only, so a Klaviyo email/SMS touch captured at **signup** and persisted on the user (`User.signupAttribution.utmSource/utmMedium`) was invisible to it → stamped `direct`. This is the exact leak the per-cycle `backfill-klaviyo-attribution-cycle` script kept correcting after the fact. Before stamping the ledger, [`payment-processing.ts`](../../src/utils/payment/payment-processing.ts) now calls `reconcilePersistedAttribution`: when the edge result is `direct`/absent it recovers an **owned-channel** platform from the persisted UTM (paid sources are NOT recovered — a real paid click already wins at the edge). **The recovery is gated by the owned-channel recency window** (`windowDaysFor`, 5d for Klaviyo — the same source of truth the cookie resolver uses): a signup-Klaviyo touch only counts if it is within window of the conversion, so a months-old signup click with no fresh touch correctly stays `direct`, not Klaviyo (this cycle it moved 10 stale rows / $309.99 off `klaviyo_email`, leaving 3 recent / $77.50; the non-windowed version over-credited Klaviyo ~4×). The LIVE path now matches the backfill, so that backfill is **no longer needed going forward** (kept only for already-saved historical rows — [`backfill-klaviyo-attribution-cycle.ts`](../../scripts/backfill-klaviyo-attribution-cycle.ts) now applies the same windowed function bidirectionally). See [backend.md → "Persisted-UTM reconciliation"](./backend.md). Tests: `npm run test:reconcile-attribution`.

## Klaviyo brand attribution must derive from the canonical brand set (not a forked list)

[`klaviyo/brand-extraction.ts`](../../src/utils/integrations/klaviyo/brand-extraction.ts)
`extractBrandFromSlug` turns a promo slug into the brand for the Klaviyo `brandInterest` profile
property (consumed by `ensureUserProfileSynced`). It used to validate the slug's brand against a
**hardcoded** `["milwaukee","dewalt","makita","ryobi"]` array — so when **HiKOKI** shipped as a 5th
toolset, every `hikoki-*` slug failed the check and silently fell back to the default `"milwaukee"`,
mis-attributing HiKOKI signups/conversions to Milwaukee in Klaviyo segmentation. Fixed (2026-06-30)
by deriving `validBrands` from `getAllBrandKeys()` ([`src/config/brand-theme.ts`](../../src/config/brand-theme.ts))
— the same source of truth the rest of the app uses — so new brands stay in lockstep. **Lesson:** the
brand set lives in `brand-theme.ts` / `promo-landing-slugs.ts`; never re-type it in a consumer. See
config-and-data/patterns.md → "Adding a promotion brand".

## Klaviyo + Meta CAPI `fetch failed` — route outbound calls through `lib/http/outbound.ts`

**Incident (June 2026):** both the Klaviyo client ([`src/lib/klaviyo.ts`](../../src/lib/klaviyo.ts)) and the Meta CAPI senders ([`src/lib/facebook.ts`](../../src/lib/facebook.ts)) flooded prod logs with opaque `TypeError: fetch failed`. This is an **undici keep-alive socket race** in Vercel's freeze/thaw model, NOT a Klaviyo/Meta config problem — full root cause + fix in [infrastructure/gotchas.md](../infrastructure/gotchas.md) → "Outbound third-party `fetch`…".

Tracking-specific notes:
- **Meta CAPI had NO timeout and NO retry** — a single stale socket = a permanently lost conversion event (the `CompleteRegistration` failures in the logs). Both senders now use `resilientFetch` (5s/attempt timeout, 2 retries). Safe because Meta dedups on `event_id` (already required, see `sendCAPIPurchase` / `sendFacebookEvent`).
- The Klaviyo client keeps its own retry loop but now calls `outboundFetch` (tuned dispatcher) and enriches its "network error" message with `describeFetchError`'s `error.cause.code` — so a future failure shows `(cause: UND_ERR_SOCKET …)` instead of a bare "fetch failed".
- **`attempts: 2` = the non-fatal upsert idempotency pre-check, NOT a lost profile.** `upsertProfile` does a profile-search GET (`maxRetries: 2`) only to choose PATCH-vs-POST; on failure it catches and proceeds to create/update, and a `409 already-exists` is recovered via `duplicate_profile_id` → PATCH, so the write still lands. `retryRequest` takes a `{ label, critical }` context and now logs this as `⚠️ Klaviyo profile idempotency pre-check failed after 2 attempts (non-fatal — caller recovers)` instead of a scary `❌ … request failed`. Only a `❌ Klaviyo profile create failed after 5 attempts` (`MAX_RETRIES = 5`, critical) means that event's profile update was actually dropped — and even then it self-heals on the user's next event / the monthly draw-reset sweep.
- When adding a new third-party tracking call, use `outboundFetch`/`resilientFetch`, never bare `fetch`.

## Isomorphic tracking modules must NEVER *eagerly* import undici/server-only code (it crashes the browser bundle)

**Incident (June 2026, prod outage):** after the outbound-fetch change shipped (PR #617), **every page** crashed at load with `Uncaught Error: Cannot find module 'node:net'` (Turbopack). `@/lib/facebook` imports the server-only `@/lib/http/outbound` (undici → `node:net`).

**Root cause (found via a deterministic import-graph trace — `temp/readonly/trace-client-undici.mjs`):** all **76** client components that crashed funneled through ONE chokepoint — the **isomorphic** provider [`src/lib/tracking/providers/facebook.ts`](../../src/lib/tracking/providers/facebook.ts), reached from the browser via the tracking registry → `usePixelTracking`. It did a **static** `import { sendFacebookEvent } from "@/lib/facebook"`. `sendFacebookEvent` is only called in `capiSend()` (server-only), but the static import dragged undici into the **eager** client bundle, which evaluates on load → crash. (A passing `next build` does NOT catch it — Turbopack stubs `node:net` and it throws only at *runtime* when the eager chunk evaluates.) A secondary path — the client helper `facebook-helpers.ts` importing `hashData` from `@/lib/facebook` — was also cut.

**Fix (the proven isomorphic pattern):**
- `providers/facebook.ts`: `import type { FacebookEvent }` (erased) + **lazy** `const { sendFacebookEvent } = await import("@/lib/facebook")` inside `capiSend()`. undici now lives in a lazy chunk that is **never evaluated in the browser** (capiSend only runs server-side).
- `hashData` extracted to [`src/lib/facebook-hash.ts`](../../src/lib/facebook-hash.ts) (crypto-only); `facebook-helpers` imports it from there.

**Rule:** an **isomorphic** module (no `"use client"`, bundled into both server and browser — e.g. the tracking providers/registry) may *reference* server-only code (undici, `@/lib/facebook` CAPI senders, `@/lib/klaviyo`, `@/lib/http/outbound`) **only via `import type` or a lazy `await import()` on a server-only call path** — NEVER a static value import, which pulls it into the eager client bundle.

**Guardrail:** `temp/readonly/trace-client-undici.mjs` statically traces every `"use client"` module's **eager** (static, non-type) import graph and reports any that reach `outbound.ts`. It must print "0" — wire it into CI/lint. (We did NOT use `import "server-only"` on `outbound.ts`: it's too blunt — it forbids the module from the client bundle *entirely*, including legitimate lazy chunks, so it breaks valid isomorphic modules. The eager-only tracer is the correct check for this codebase's isomorphic tracking design.)

## Pixel bootstraps are imperative provider code — NEVER inline script text

**Since 2026-07-19 (Path B of the CSP/ISR migration)** the three provider `loadPixel()` functions ([`facebook.ts`](../../src/lib/tracking/providers/facebook.ts), [`tiktok.ts`](../../src/lib/tracking/providers/tiktok.ts), [`snapchat.ts`](../../src/lib/tracking/providers/snapchat.ts)) contain **zero inline `<script>` text**. Each is a faithful TS transcription of the vendor's official bootstrap: create the pre-SDK queue stub as real code (fbq callMethod-or-queue closure / ttq array with method proxies / snaptr handleRequest-or-queue closure), inject the SDK as a **src-script** on a host-allowlisted origin (`connect.facebook.net`, `analytics.tiktok.com`, `sc-static.net`), then make the same config calls in the same order the old inline text did (`disablePushState` → `set autoConfig false` → `init` → conditional PageView, etc.).

**Why:** the old `script.innerHTML = \`…'${pixelId}'…\`` blobs interpolated env (pixel ids), route state (the `shouldTrackRoute` PageView line), and user data (advanced matching) — making them **unhashable** under CSP: a sha256 allowlist only covers a byte-exact string. The only way to run them under nonce-CSP was a per-request nonce, and threading `getNonce()` (a `headers()` read) through the root layout made **every auto-static route dynamic**, killing marketing-route ISR. Imperative bootstraps + src-script SDKs need neither nonce nor hash, so the layout is nonce-free and `/`, `/promotions/**`, `/winners`, `/draw-results`, `/terms`, `/competition-term-majordraw` prerender.

**Rules when touching a provider bootstrap:**
- Never reintroduce `script.innerHTML` / `dangerouslySetInnerHTML` in `src/lib/tracking/providers/**` (grep gate: must stay zero). If a vendor snippet changes, re-transcribe it imperatively.
- Preserve call ORDER — e.g. Meta's `fbq('set','autoConfig',false,id)` MUST precede `fbq('init',…)`, and `fbq.disablePushState = true` must be set before init or Meta's History-State listener re-enables auto-PageView on SPA navigations, bypassing the `shouldTrackRoute` gate.
- The `loadPixel` signature takes no `nonce` (removed 2026-07-19); the pre-existing early-return semantics still hold: if the global (`fbq`/`snaptr`) already exists, stub+SDK injection is skipped but the config calls still run — same as the original IIFEs.
- The only inline scripts the app renders at all are the four FIXED constants in [`src/utils/security/inline-snippets.ts`](../../src/utils/security/inline-snippets.ts) (theme, device-tier, GTM init, Klaviyo queue), hash-allowlisted in `csp.ts` and drift-guarded by `npm run test:csp-inline-hashes`. GTM's container-id half is a src-script (`gtm.js?id=…`); Klaviyo's suite is a src-script — only their fixed, interpolation-free halves are inline.
- NOTE: `sc-static.net` (Snap SDK) is not currently in CSP `script-src` — Snapchat's pixel is env-disabled (shell only); add the host when Snap goes live.

## Legacy `FacebookPixel` / `TikTokPixel` components are gone — helpers live in `utils/tracking/legacy-pixel-helpers.ts`

`src/components/FacebookPixel.tsx` and `src/components/TikTokPixel.tsx` each used to hold a loader COMPONENT plus a set of imperative event helpers. The loader components were **never mounted** (the live loaders are the provider `loadPixel()`s above, via `ConversionPixels`), so both files were deleted (perf Tier-2, 2026-07-20). The still-consumed helpers (`trackFacebookEvent`, `trackTikTokEvent`, `trackPurchase`, `trackCompleteRegistration`, …) moved **verbatim, with identical names** to [`utils/tracking/legacy-pixel-helpers.ts`](../../src/utils/tracking/legacy-pixel-helpers.ts). Consumers: `usePixelTracking`, `pixel-purchase-tracking.ts`, `MembershipModal` — zero behaviour change.

- `window.fbq` stays typed by the **ambient** `Window` augmentation in [`providers/facebook.ts`](../../src/lib/tracking/providers/facebook.ts) (the deleted file's own augmentation is no longer needed); the TikTok helpers delegate to `tiktokProvider` and never touch `window.ttq`, so nothing local is required.
- **Prefer** `trackConversion(...)` / the provider registry in new code — these legacy helpers synthesize a fake TikTok `event_id` (no Pixel↔Events-API dedup) and fire the FB browser pixel only.

## Bulk Klaviyo profile sync must be throttled (per-account rate limits)

`syncMultipleUserProfilesToKlaviyo` ([`klaviyo-profile-sync.ts`](../../src/utils/integrations/klaviyo/klaviyo-profile-sync.ts)) previously fired **all** users at once via one unbounded `Promise.allSettled`. Each user-sync hits the Klaviyo **Profiles API twice** (1 Get-Profiles search by email + 1 Create/Update). Klaviyo's limits are **per-account, per-endpoint: 75/s burst, ~700/min steady** on each profile endpoint ([get_profiles](https://developers.klaviyo.com/en/reference/get_profiles)); the **Get-Profiles search is the binding bucket** (every user hits it once → ~11.6/s). Firing everyone at once → 429s **and** the undici keep-alive socket pressure behind the June 2026 "fetch failed" incident. Now throttled to **`CONCURRENT_SYNC_LIMIT = 8` / `BATCH_DELAY_MS = 700`** (~5–10 syncs/s, comfortably under the steady limit, ~2× faster than a 5/2000ms baseline). The Klaviyo client already backs off 429s via `Retry-After`, so a brief overshoot self-corrects.

**Caveats when running a sweep:**
- **Run off-peak** — the per-account quota is shared with live registration upserts (`createKlaviyoProfileAndSubscribe`) and the draw-reset sweep.
- **The HTTP route ([`/api/admin/sync-klaviyo-profiles`](../../src/app/api/admin/sync-klaviyo-profiles/route.ts)) `await`s the whole throttled sync** — fine for a few-hundred-user set (it has `maxDuration = 300`), but a **whole-DB sweep (thousands) will exceed the serverless limit**; run that as an ops script instead, or use Klaviyo's **Bulk Import Profiles** endpoint (10k profiles/request, upsert) — a worthwhile follow-up.
- **Keep the search a plain email filter.** If anyone adds `additional-fields[profile]=predictive_analytics` to the profile search, the Get-Profiles bucket collapses to 10/s·150/min and this cap would massively overshoot.
- That admin route is now gated by `requirePermissionWithAudit("users.edit")` (was previously an open, unauthenticated mass-write endpoint — fixed June 2026).

## Tracking beacons must not block the response (promo-page-visit 504s)

`POST /api/tracking/promo-page-visit` records the visit inside `after()` (Next 15), not on the request's critical path. It previously `await`ed a dedup `findOne` + `recordVisit` inline; under ad-burst traffic, fresh serverless instances racing for Mongo connections (small pool + Atlas new-connection rate limit) stalled long enough to blow the function `maxDuration` → **504** on the beacon (observed in prod, ~4/day). `after()` returns the response immediately and Vercel keeps the function alive for the deferred work — unlike the floating-promise `executeBackgroundJob` helper (`src/utils/webhook/background-jobs.ts`), which can be dropped when the instance freezes, exactly the high-load moment we need the attribution write to survive. **Two limits still apply, so don't over-promise when copying this pattern:** (1) `after()` work is killed at the function's `maxDuration` (10s here via the vercel.json catch-all) — it is *not* unbounded post-response execution; (2) `.maxTimeMS(5000)` on the dedup read bounds **server-side query execution only**, not connection acquisition / server selection (those are bounded by `connectDB`'s own 10s timeouts). Two hardening details that are part of the pattern: the deferred path must call `connectDB()` **before** its first query (mongoose never auto-connects; a bare `findOne` on a cold instance just buffers ~10s and the visit dies silently), and the dedup read **fails open** (a dedup error records the visit anyway — worst case one duplicate row in the 60s window, instead of a silently lost visit). The orchestration (dedup → attribution → persist) is extracted into `recordPromoVisit` (`src/utils/promo-analytics/record-promo-visit.ts`) with its side effects injected as deps, so the route stays a thin shell and the logic is unit-tested without a DB (`npm run test:promo-visit`).

## Adding a new Klaviyo event? Use the canonical schema, not the legacy helper

New Klaviyo events (added after 2026-05-27) use a **canonical property schema** — `price` as a number (not string), `tier` (not `package_tier`), ISO `*_at` timestamps (not locale strings like `"December 22, 2025"`), and properties omitted entirely when absent (no `""` / `"unknown"` sentinels). See the "Canonical property names — new events only (drift containment)" section of [KLAVIYO_INTEGRATION.md](./KLAVIYO_INTEGRATION.md) for the full table and rationale.

**Two helpers, one rule:**
- Legacy events in [klaviyo-events.ts](../../src/utils/integrations/klaviyo/klaviyo-events.ts) (Subscription Started, Placed Order, Subscription Renewal Failed, etc.) — keep using `formatPackageDataForKlaviyo`. They are **frozen** because active Klaviyo flows / templates / segments / campaigns reference their exact property names; renaming silently breaks production.
- NEW events — use `formatCanonicalPackageData`. The snapshot test at `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` will fail CI if you drift to legacy aliases. Run via `npm run test:klaviyo-canonical`.

If you find yourself wanting to "clean up" legacy property names, **don't**. Read the no-refactor policy in KLAVIYO_INTEGRATION.md first — refactors require explicit user authorization + ads-team confirmation + a dual-write plan.

## Pixel double-fire

If the root-layout pixel fires AND a feature component also fires the same event, you get duplicates in Meta / Klaviyo. Convention: root-layout fires the standard PageView; feature components fire conversion events on user action.

## Pixel-blocked clients

Up to 30%+ of users have ad-blockers / ITP suppressing pixels. Server-side events catch these. Don't trust pixel-only metrics for revenue.

## CSP gotcha

Adding a new pixel requires CSP updates. Otherwise the pixel SDK fails silently. See [security-csp](../security-csp/).

## Stripe metadata 500-char cap on `capi_event_source_url`

Facebook ad referer URLs (long UTMs + `fbclid` + `_aem_` + `brid`) regularly exceed 500 chars. Stripe metadata values are capped at 500 chars per key, so passing the raw `referer` directly into a `subscriptions.create` / `paymentIntents.create` call would reject the entire request with `Metadata values can have up to 500 characters` — meaning the user cannot complete checkout.

All server-side metadata builders run the URL through [`safeEventSourceUrl`](../../src/utils/tracking/event-source-url.ts) before storing it. When the URL is over 500 chars, the helper drops the query/fragment and keeps `origin + pathname` only. That is sufficient for Facebook CAPI's `event_source_url` field; the dropped attribution (fbc, UTMs) is already captured separately under `capi_fbc` and `attr_utm_*` metadata keys.

Anyone wiring a new endpoint that stores a referer / location URL into Stripe metadata must use the same helper. Do not push raw `request.headers.get("referer")` into metadata.

## UTM expiry

`useUTMPersistence` keeps UTMs for the session. _TODO: confirm exact TTL — likely localStorage with stale-after-N-days._ Don't expect UTMs to survive a multi-day signup gap.

## Webhook + API double-fire

(Reinforces [billing-stripe R2](../billing-stripe/rules.md#r2).) Don't fire tracking events from BOTH API path AND webhook for the same conversion. Pick the webhook.

## Migrated stubs

- [Facebook Tracking](../tracking/architecture.md) → _TODO: read root `docs/FACEBOOK_TRACKING_IMPLEMENTATION.md`_
- [GTM Integration](../tracking/architecture.md) → _TODO: read `docs/GTM_INTEGRATION.md`_
- [UTM Attribution](../tracking/architecture.md) → _TODO: read `docs/UTM_ATTRIBUTION.md`_
- [Klaviyo Integration](../tracking/architecture.md) → _TODO: read `src/docs/KLAVIYO_INTEGRATION.md`_
- [Pixel Integration](../tracking/architecture.md) → _TODO: read `src/docs/PIXEL_INTEGRATION.md`_

Read all five and merge content during a refresh pass.

## Both browser and server fbc read `_fbc` cookie first; URL fallback uses `Date.now()`

[`extractFBCFromRequest`](../../src/utils/tracking/facebook-helpers.ts) (server) and [`getFBCFromURL`](../../src/utils/tracking/facebook-helpers.ts) (browser) both read the Facebook Pixel `_fbc` cookie first. Only when no cookie is present do they fall back to building `fb.1.{Date.now()}.{fbclid}` from a URL `?fbclid=…` parameter.

The fallback's timestamp is **the request time, not the click time** — Meta's spec calls for click time. We prefer it over rejecting fbc entirely so cookie-blocked first-touch visitors still contribute partial attribution.

The browser helper was previously *only* using the URL fallback, even when the SDK had already written a canonical `_fbc` cookie. That produced a different `fbc` on every call and caused pixel↔CAPI mismatches. Fixed 2026-05-14.

Important: the fallback is non-deterministic across calls. Any code path that uses the returned fbc in a Stripe idempotency-keyed request body (subscription create) must wrap the call with the [billing-stripe P10 pattern](../billing-stripe/patterns.md#p10-one-shot-idempotency-retry-on-key-collisions). For other CAPI flows (the standard `/api/facebook/*` event endpoints), the drift is harmless.

## Production-hostname gate

Every browser pixel refuses to fire on any hostname not listed in `productionHostnames()`. For all three current providers that means **only** `toolsaustralia.com.au` and `www.toolsaustralia.com.au`. To test pixels in dev/preview, set `NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true` (which `<ConversionPixels disabled />` reads) **and** mock the hostname in your test — there is no global "ignore hostname" override; this is intentional.

## Meta Events Manager: keep "Automatic Advanced Matching" and "Track events automatically" OFF

In Events Manager → Pixel `794467123372847` → Settings, two toggles must stay **Off**:

1. **Automatic Advanced Matching** ("Automatic website matching" — the master toggle plus every per-field sub-toggle: Email, Phone, First/last name, Gender, City/State/ZIP, Country, Date of birth, External ID).
2. **Track events automatically without code** (under "Event setup" — Meta's auto button/form click harvester that emits `SubscribedButtonClick`, `Lead`, etc. from page DOM heuristics).

**Why off, not on:**

- **AM is supplied manually in code.** [ConversionPixelsAdvancedMatching.tsx](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) calls `fbq('init', pixelId, AM)` with `buildAdvancedMatching(userData)` after the user authenticates. Every subsequent `fbq('track', …)` automatically carries the nine hashed identity fields (em/ph/fn/ln/ct/st/zp/country/db/external_id) — controlled, post-consent, with the fields we choose. CAPI `user_data` is built server-side in [providers/facebook.ts](../../src/lib/tracking/providers/facebook.ts) the same way. Leaving auto-AM on means Meta *also* scrapes whatever happens to be in form inputs on the page — duplicate, uncontrolled, and active on pages like `/my-account/settings`, `/support`, `/reset-password` that aren't conversion contexts.
- **Auto events pollute event quality.** `SubscribedButtonClick` fires on *every* `<button>` tap (state-tile picks, profession-tile picks, reset, navigation) and ships the button's `innerText` + hashed identity to Meta. It doesn't replace properly modeled funnel events; it just adds noise that depresses EMQ and inflates volume. Our explicit `trackConversion()` calls already cover the events that matter (`Purchase`, `Lead`, `CompleteRegistration`, etc.).
- **Compliance.** Both auto features are the pattern EU/AU regulators have repeatedly flagged as undisclosed data sharing because the user never consented to having form-field PII or button labels exfiltrated on every page interaction.

**What you'd notice if either gets re-enabled:**

Outbound requests to `https://www.facebook.com/privacy_sandbox/pixel/register/trigger/?…&ev=SubscribedButtonClick&cd[buttonText]=…&ud[em]=…&ud[ph]=…` firing on routine clicks across non-conversion pages, including `/my-account/*`. If you see that pattern in DevTools Network, the toggle flipped on the Meta side — fix it in Events Manager, not in code.

**Don't try to compensate in code.** There is no client-side switch to suppress Meta's auto features once they're enabled at the Pixel level; the only off-switch lives in Events Manager.

## Dedup id mapping

Each provider's dedup field has a different name. The canonical `eventId` maps to:
- Facebook: `event_id` (CAPI) / `eventID` (Pixel SDK 4th arg)
- TikTok: `event_id` (Events API) / `event_id` (Pixel SDK 3rd arg)
- Snapchat: `client_dedup_id` (both)

If you grep for `eventID` and find no hits in a provider's code, you're looking at the wrong field name.

## TikTok Events API: easy ways to silently lose data

All verified 2026-05-22 against working code (Stape/mParticle/Adobe) + TikTok help center — see [TIKTOK_EVENTS_API_IMPLEMENTATION.md](./TIKTOK_EVENTS_API_IMPLEMENTATION.md).

- **Success is `code: 0`, not HTTP 200.** TikTok returns 200 with a non-zero `code` on logical failures. `sendTikTokEvent` treats `code !== 0` as failure and logs `code`/`message`/`request_id`. Don't "fix" it to key off `res.ok` alone.
- **`event_time` is Unix SECONDS.** Milliseconds put the event ~50,000 years in the future → dropped. `eventTimeNow()` already returns seconds; don't pass `Date.now()`.
- **Event name must be identical on pixel + Events API**, or dedup double-counts. We use `Purchase` on both. `CompletePayment`/`PlaceAnOrder` are legacy aliases (`PlaceAnOrder` sunsets 2027) — TikTok officially renamed `CompletePayment` → `Purchase`; use `Purchase` for new work.
- **v1.3 uses `data[].user`, NOT `context.user`.** The `context.user` + top-level `pixel_code` + `timestamp` shape is the deprecated v1.2 endpoint. v1.3 is `event_source` + `event_source_id` + `data[].user` + `event_time`.
- **The Events API phone field is `phone`, the pixel's is `phone_number` — they genuinely differ.** We originally sent `phone_number` server-side on the reasoning that it "matches the pixel exactly". It does not: `phone_number` is the **v1.2** name, and v1.3 **silently drops unknown `user` keys** (no error, no Diagnostics entry), so every server-side event went out with no phone at all. The only symptom was EMQ — `CompleteRegistration`, our lone Events-API-only event and one that *requires* a mobile at signup, read **0% phone coverage** while browser-assisted events read 74–91% off `ttq.identify` alone. Rule: **`user.phone` server-side, `phone_number` in `ttq.identify`.** Do not "unify" them.
- **`ttclid`/`ttp`/`ip`/`user_agent` are sent RAW**, and **`city`/`state`/`country` are sent as lowercase PLAINTEXT.** Hashed: `email`, `phone`, `external_id`, `first_name`, `last_name`, `zip_code`. Hashing a raw/plaintext field breaks matching exactly as silently as a wrong field name.
- **The webhook-fired Purchase has no cookies**, so `ttclid`/`ttp` can't be read at send time. The payment-creation routes stash them in Stripe metadata (`capi_ttclid` / `capi_ttp`, beside Meta's `capi_fbc` / `capi_fbp`); the webhook's `extractRequestContextFromMetadata` reads them back onto `requestContext`. If you add a new payment-creation route, add those two keys or Purchase loses its click id.
- **`test_event_code` is top-level** (next to `event_source`/`event_source_id`/`data`), not inside `data[]`. Without it, non-prod refuses to send (same guard as Meta).
- **`ttq.identify` auto-hashes.** Pass normalized plaintext (lowercased email, E.164 phone via `normalizePhoneE164`) — do NOT pre-hash, or the SDK double-hashes and the hash won't match the server's.

## Meta books Purchase at `event_time` — send the charge time, not the webhook send time

Meta's CAPI reports/attributes the conversion at `event_time` (Unix **seconds**, accepted up to **7 days** old; an out-of-range value rejects the **ENTIRE** `/events` request — verified against Meta docs 2026-07-08). `buildPurchaseEvent` used to stamp `eventTime` = "now" (the webhook send moment), so a purchase paid seconds before midnight (Australia/Melbourne) whose webhook landed after midnight was booked by Meta into the **next** day. Verified 2026-07-08: $200 of purchases bled across the day boundary and inflated "today's" Meta ROAS.

Fix: pass the payment-success time as `eventTimeUnixSeconds` (`BuildPurchaseEventInput` / `PixelPurchaseParams`); [`payment-processing.ts`](../../src/utils/payment/payment-processing.ts) feeds it `normalizeEpochToUnixSeconds(paymentMetadata?.chargedAt ?? paymentMetadata?.created)`. `chargedAt` (ms) = Stripe `event.created` on `payment_intent.succeeded` paths / invoice `paid_at` on the membership path — NOT `paymentIntent.created`, which is the PI's creation time and can precede payment by minutes-to-days (form opened, deferred confirm), back-dating the conversion.

Two footguns the helpers in [canonical-event.ts](../../src/lib/tracking/canonical-event.ts) absorb:
- **ms vs seconds:** `paymentMetadata.chargedAt`/`created` are **ms** at the webhook call sites (`* 1000`) but seconds elsewhere. `normalizeEpochToUnixSeconds` divides anything `> 1e11` by 1000 (unix seconds stay below 1e11 until year 5138), so an ms epoch never reaches the wire.
- **out-of-range rejection:** `resolveEventTime` clamps to Meta's window (7d past **minus a 1h safety margin**, so an event queued near the boundary can't invalidate the batch it ships in; +60s future skew) and falls back to "now" — the worst case is the pre-fix behavior, never a rejected request.

Test: `npm run test:purchase-event-time`.

## DEFERRED (owner decision 2026-07-08): membership Purchase value = catalog price, not `amount_paid` — fix BEFORE any membership discount promo

The membership webhook grant reports `membershipPackage.price` (catalog) to Meta and `PaymentEvent.data.price` ([stripe-webhook-handlers/index.ts](../../src/services/stripe-webhook-handlers/index.ts), the `price: membershipPackage.price` arg), and the modal fires `activePlan.price` ([MembershipModal](../../src/components/modals/MembershipModal/index.tsx)) — not the invoice's `amount_paid`. Verified harmless today: a 30-day Stripe sweep (2026-07-08, 5,527 charges) found **every new membership signup charged exactly catalog price** (595× $20, 206× $40, 177× $80; the only off-catalog membership charges were renewals, which are never sent to Meta). The owner chose to leave the code alone. **Hard trigger to revisit:** before launching any discounted-first-month or coupon promo on memberships, switch the reported value to the invoice's `amount_paid` — otherwise every discounted signup over-reports revenue to Meta (poisoning value-based bidding) and to internal dashboards.

## `/api/tracking/conversion` is unauthenticated — its eventName allowlist is what stops forged revenue

The funnel-mirror endpoint must accept guest traffic, so it has no auth. Until 2026-07-08 it accepted ANY `eventName` (`z.string().min(1)`) — anyone could POST a fully-valued `Purchase`/`Subscribe` and Meta would record revenue with no server-side record. `eventName` is now validated with [`mirrorEventNameSchema`](../../src/utils/tracking/mirror-event-names.ts) (`MIRROR_EVENT_NAMES`: ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Lead, Search). That shared module (no `"use client"`) is the single source of truth — [`meta-capi-mirror.ts`](../../src/utils/tracking/meta-capi-mirror.ts) type-only re-exports `MirrorEventName` from it, so the client helper, the server Zod schema, and the tests can't drift. Value-bearing events reach CAPI only via the Stripe-webhook path (`trackPixelPurchase`, gated on a real verified payment). The route also treats client-supplied `eventTime` as untrusted: `resolveEventTime(normalizeEpochToUnixSeconds(...))` (Meta rejects the whole `/events` request on out-of-range event_time). If you add a funnel event to the mirror, extend `MIRROR_EVENT_NAMES` — never widen the route schema back to a bare string. Test: `npm run test:mirror-event-names`.

## Browser-side Purchase pixel must fire from success pages

Historically, only `PaymentSuccessHandler.tsx` fired the browser Purchase pixel — and only on the 3DS-redirect code path. Most purchases skipped that path, so Meta Events Manager saw Purchase as Conversions API only. The success-page clients (`PurchaseSuccessClient`, `UpsellSuccessClient`, `MiniDrawSuccessClient`, `CheckoutSuccessClient`) now each fire `trackConversion` on mount with `eventId === paymentIntentId` so the browser-side fires for every purchase path.

**Refire guard (2026-07-08):** Meta's pixel↔CAPI dedup matches `event_name` + `event_id` within a **48h window** (first-received wins) — so a success-page refresh today is harmless, but reopening the same success URL (history, restored tab) **more than 48h after purchase** re-fires a fully-valued Purchase that Meta counts as a brand-new conversion (the in-component `firedRef` only survives a single mount). All four success clients now consult [`purchase-pixel-fired-storage.ts`](../../src/utils/tracking/purchase-pixel-fired-storage.ts) — `shouldSuppressPurchasePixel` / `markPurchasePixelFired`, localStorage key `purchasePixelFired_${eventId}` → first-fire `Date.now()` string. The guard is **window-aware, not fire-once**: re-fires are suppressed only when the first-fire mark is older than **46h** (2h safety margin inside Meta's window). Younger re-fires stay allowed — Meta merges them, and they recover a first fire that was silently swallowed (ad blocker, tab closed before fbevents.js drained) — which matters most for shop checkout, which has no CAPI backstop. Re-marks never overwrite the first-fire anchor (Meta's window anchors at the FIRST received event; a sliding mark would re-open >48h double counts). 30-day prune, every op try/caught so a broken/full storage (Safari private mode) degrades to the pre-guard behavior. **Deliberately NOT cleared at sign-out**: it holds no PII (only a Stripe PaymentIntent id) and clearing would reintroduce the >48h re-fire. Test: `npm run test:purchase-pixel-fired`.

If a new success page is added, it MUST fire the pixel AND use this guard — see `PurchaseSuccessClient.tsx` for the pattern.

## Debug logs are invisible on staging unless you use `console.error`

`next.config.ts` `compiler.removeConsole` strips `console.log` / `info` / `debug` / `warn` from production builds. **Vercel preview / staging deploys are production builds**, so any `console.log("[DEBUG] ...")` you add to diagnose a live tracking issue (like "is my dispatcher being called?", "what does fbq receive?") is stripped from the bundle and never appears in the browser console.

If you've ever stared at a clean staging console wondering why your debug logs aren't appearing, this is why.

**Always use `console.error` for ad-hoc debug logging on staging.** `console.error` is preserved (it's listed in `removeConsole.exclude`). Once you've finished diagnosing, remove the debug logs — they shouldn't ship.

```ts
// ❌ silent on staging (stripped at build time)
console.log("[DEBUG] fb.pixelTrack entered", { eventName, hostname });

// ✅ visible on staging
console.error("[DEBUG] fb.pixelTrack entered", { eventName, hostname });
```

## Provider modules must NOT have `"use client"`

The three provider files — [facebook.ts](../../src/lib/tracking/providers/facebook.ts), [tiktok.ts](../../src/lib/tracking/providers/tiktok.ts), [snapchat.ts](../../src/lib/tracking/providers/snapchat.ts) — are **isomorphic**: server code (Stripe webhook → `trackPixelPurchase` → `sendConversion` → `dispatch.ts`) imports them to call `capiSend()`, and browser code (`ConversionPixels.tsx`) imports them to call `loadPixel()` / `pixelTrack()`.

Tagging these files with `"use client"` **breaks the server-side path silently in production builds.** Next.js's bundler treats `"use client"` modules as client-references when imported from server code — it replaces the actual exports with proxy objects. `provider.enabled` becomes a Reference token instead of a function, and `dispatch.ts:38`'s `provider.enabled()` call throws:

```
TypeError: r.enabled is not a function
  at Array.map (dispatch.ts:36)
```

The bug doesn't surface in dev because Next's RSC boundary is loose in dev mode; it only manifests on Vercel preview / production. We hit this on 2026-05-12 and lost every server-side Purchase event for the staging branch until the directive was removed.

**Rule:** No `"use client"` on `src/lib/tracking/providers/*.ts`. The browser-only branches inside `loadPixel` / `pixelTrack` already guard with `typeof window === "undefined"`, so the modules are safely bundled into both runtimes without the directive.

## Subscription Purchase event_id must override `invoicePaymentId`

The subscription webhook path ([handleInvoicePaymentSucceeded](../../src/app/api/stripe/webhook/route.ts)) keys storage on `invoicePaymentId = "invoice_" + invoice.id` for PaymentEvent idempotency, ledger dedup, and A/B tracking. But the browser-side Purchase pixel fires from [MembershipModal.tsx](../../src/components/modals/MembershipModal.tsx) with the real PaymentIntent id (`pi_…`) as its `event_id`. If the server CAPI sent `invoice_in_…` as `event_id`, Meta would see two distinct Purchase events with the same parameters — its dedup mechanism would not collapse the pair, EMQ would suffer, and the Diagnostics panel would flag "Event deduplication: Not meeting best practices."

Fix: the webhook extracts `expandedInvoice.payment_intent` (string or expanded id) and passes it as `paymentMetadata.trackingOrderId`. [processPaymentBenefitsInternal](../../src/utils/payment/payment-processing.ts) reads that field as a one-off override for the Facebook `orderId` parameter only — every other use of `paymentIntentId` (PaymentEvent storage, ledger writes, retry locks) still sees `invoice_${invoice.id}` and stays idempotent.

**If you add a new subscription-billing webhook path** (e.g., a recovery cron, a backfill script), and you call `processPaymentBenefits` with `invoice_…` as the first arg, you MUST also resolve the underlying PaymentIntent and set `trackingOrderId` on the metadata. Otherwise browser↔server dedup silently breaks for that flow.

## MembershipModal browser Purchase pixel uses `lastChargedStaticPackageIdRef`, not `activePlan.id`

`activePlan.id` is the tier slug ("tradie", "boss", "foreman"). The server CAPI sends `packageId` from the MembershipPackage document ("tradie-subscription", "boss-subscription", …) — these are NOT the same string. Browser-side `content_ids` must use [`lastChargedStaticPackageIdRef.current`](../../src/components/modals/MembershipModal.tsx) (the canonical static package id assigned during `handlePurchaseClick`) for the values to match the server, with `activePlan.id` only as a last-resort fallback.

Both `handlePaymentProcessingSuccess` (existing-user flow) and `handlePaymentSuccess` (new-user autologin flow) must read the same ref. We shipped a Phase 3 regression on 2026-05-12 where `handlePaymentSuccess` used `activePlan.id` directly — browser sent `["tradie"]`, server sent `["tradie-subscription"]`, Meta flagged the dedup mismatch.

## CAPI user_data: raw vs hashed field matrix

Meta's CAPI accepts some `user_data` fields **raw** and others as SHA-256 hashes. Mixing them up silently degrades Event Match Quality with no error.

| Field | Format | Examples |
|---|---|---|
| `em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp`, `country`, `external_id`, `db` | SHA-256 lowercased | `hashPII("nsw")` |
| `fbp`, `fbc`, `client_ip_address`, `client_user_agent` | Raw | `fb.1.1700000000000.AbC123` |

`hashPII` and `prepareUserData` both lowercase-trim before hashing. Pass `"NSW"` and the helper handles normalization. Do not pre-hash any field — that double-hashes it.

## `db` (birthdate) format is `YYYYMMDD`, not ISO

The `db` parameter must be hashed `YYYYMMDD` digits (e.g. `hashPII("19900615")`), **not** ISO `YYYY-MM-DD`. Use `toYYYYMMDD()` from `facebook-helpers.ts` — it accepts `Date` objects, ISO strings, and pre-formatted 8-digit strings, and returns `null` for unparseable input so the caller can skip the field. Wrong format produces no error but silently drops match quality.

## `FACEBOOK_MARKETING_ACCESS_TOKEN` — verified non-expiring System User token (ad-spend snapshots)

`FACEBOOK_MARKETING_ACCESS_TOKEN` powers the ad-spend / ROAS / CAC numbers on the admin dashboard. It is read by [`adChannelProviders.ts`](../../src/services/admin/dashboard-stats/adChannelProviders.ts) → [`fetchFacebookInsights`](../../src/lib/facebook-marketing.ts) and is **separate** from the CAPI token `FACEBOOK_ACCESS_TOKEN`. The ad account is `act_1115200520594316` ("Tools Australia", AUD) — despite an old `.env` comment calling it "sandbox," it is the **real** spend account.

**Verified 2026-06-12 (Access Token Debugger):** the current token is `Type: System User`, `Expires: Never`, `Data Access Expires: Never`, `Valid: True`, App `1378088760332870` (Tools Australia Pty Ltd), scopes include `ads_read`, `ads_management`, `business_management`. `ads_read` is **exempt from the 90-day data-access cutoff**, so reading insights never lapses on a timer.

**Triage rule — if you see `Error validating access token: Session has expired` again with this token, it is NOT a misconfiguration on our end.** A genuine System User "Never" token only dies on a Facebook-side *event*: the authorizing user's password change, App Secret reset, the app flipping Development↔Live, a 2FA/permission/asset change, or a Meta security invalidation. Confirm by pasting the token into <https://developers.facebook.com/tools/debug/accesstoken/> (or `GET /v21.0/debug_token`): a healthy token shows **Expires: Never** / `expires_at: 0`. If it shows an expiry or `Valid: False`, regenerate a System User token (Business Settings → System Users → Generate, expiry "Never", `ads_read`) and update it in **Vercel** (production reads it from there, not from `.env.local`).

**Silent-zero footgun (how a dead token corrupts history):** when the token is invalid, [`adChannelProviders.fetchForDay`](../../src/services/admin/dashboard-stats/adChannelProviders.ts) catches the error and returns `null`; the [snapshot writer](../../src/services/admin/dashboard-stats/DashboardStatsSnapshotWriter.ts) then does `if (metrics) adChannelsMap.set(...)`, so the `facebook` channel is **omitted** from that day's `DashboardStatsDailySnapshot`, and the reader renders the missing channel as `$0`. No error surfaces on the dashboard — spend just silently reads zero, which **understates spend and overstates ROAS**.

**The daily snapshot cron rewrites a 90-day sliding window** ([`SLIDING_WINDOW_DAYS = 90`](../../src/app/api/cron/dashboard-stats-daily-snapshot/route.ts), runs 14:00 **and** 15:00 UTC), which makes a token outage far worse than a today-only bug: a dead token doesn't just zero *today*, it **retroactively overwrites the trailing 90 days** of previously-correct snapshots with nothing on the cron's next run. This happened in production **2026-06-11**: the token expired 14:34 UTC; the 14:00 run wrote Facebook fine, but the 15:00 run (~26 min after death) rewrote the window 2026-03-14→06-12 with the dead token — wiping ~$283k of correct Facebook spend from history in one 17-second batch (all 91 affected days share `computedAt` 15:00:45–15:01:02; days older than the 90-day window kept their last-good values). Facebook still had the data the whole time; only the snapshots were clobbered.

**Guarded since 2026-06-12:** the snapshot writer no longer overwrites a channel with nothing when the live fetch fails — `fetchForDay` distinguishes `error` from `empty`, and the writer preserves the prior stored value on `error` (pure `mergeAdChannels`, test `npm run test:merge-ad-channels`). So a future token death makes a day's spend go *stale*, not *zero*. See [admin/gotchas.md](../admin/gotchas.md) → "Ad-spend snapshots". The wipe described above predates that guard.

**The flip side is the easy fix:** because the cron rewrites the *same* 90-day window every run, simply updating the token in **Vercel** lets the next cron run re-fetch and **self-heal** every still-in-window day automatically — no manual step for days inside the trailing 90. Only days that have already aged out of the window (or if you don't want to wait for the cron) need a manual backfill:

```bash
# immediate repair / for days aged out of the 90-day window — recomputes from Facebook (idempotent upsert)
npm run backfill:dashboard-stats-snapshots -- --start-date 2026-03-14 --end-date 2026-06-12
```

⚠️ **DB-name footgun:** production data lives in the Mongo database named **`Production`**, but `connectDB` sets no `dbName` (it uses the URI's path, defaulting to `test`). The `MONGODB_URI` you run the backfill with **must include `/Production` in the path**, or it writes to an empty `test` db and silently does nothing. Run it in the production environment (where `MONGODB_URI` already targets `/Production`) or with an explicit `/Production` URI locally. A read-only inspection that lands in `test` will report `0 snapshots` even though `Production` has them — don't conclude "no snapshots" from that.

## Funnel CAPI events only carry PII if a caller passes `userData`

`fireFunnelEvent` (and `trackInitiateCheckout` / `trackAddPaymentInfo`) forward an optional `userData: MirrorUserData` **only to the CAPI mirror** ([meta-capi-mirror.ts](../../src/utils/tracking/meta-capi-mirror.ts)) — never to the browser pixel. If no caller passes `userData`, the funnel event reaches CAPI with no identity params beyond what the server route enriches from the session/request (so guest/anonymous funnel events have low EMQ until a caller supplies PII). Empty fields are stripped (`stripEmpty` drops `undefined` / `null` / `""`) so a partially-filled `userData` never clobbers the session enrichment the route layers in.

## Bulk Import Profiles — fast path for large profile resyncs

For a **whole-DB profile-data resync** (e.g. backfilling a new `KlaviyoProfileProperties` field across every member), the per-profile path (`upsertProfile` / `syncMultipleUserProfilesToKlaviyo`) is the wrong tool: each user hits the Profiles API **twice** (a Get-Profiles search + a Create/Update), and the search is the binding rate bucket (~11.6/s), so a thousands-row sweep crawls and risks 429s. Klaviyo's async **Bulk Import Profiles** endpoint is the smart tool here — **`POST /profile-bulk-import-jobs/` upserts up to 10,000 profiles in ONE request** (~1 request per 10k vs ~2 per profile), returning **HTTP 202** + a job id you poll.

The client methods live on `KlaviyoClient` ([klaviyo.ts](../../src/lib/klaviyo.ts)): `bulkImportProfiles(profiles)` → `{ jobId }`, `getBulkImportJobStatus(jobId)` → `status` (`queued | processing | complete`), `getBulkImportErrors(jobId)` → per-profile error array (empty = clean). The payload is built by the pure helpers in [bulk-import.ts](../../src/utils/integrations/klaviyo/bulk-import.ts) (`buildBulkImportPayload` + `chunkProfilesForBulkImport`, unit-tested via `npx tsx src/utils/integrations/klaviyo/__tests__/bulk-import.test.ts`).

**Data-only upsert — no list/consent change.** The request body deliberately omits `data.relationships.lists`. A bulk-import job *with* a list relationship would change list membership/consent — exactly what a profile-data resync must NOT do. Keep it list-free; use the subscribe/list endpoints (`subscribeToEmailList`, etc.) for consent, never this.

**Limits + why the chunker caps below them.** Klaviyo's hard caps are **10,000 profiles/job, 5MB/payload, 100KB/profile** (rate limit 10/s burst, 150/min steady). `chunkProfilesForBulkImport` defaults to **2,000 profiles / 4.5MB per chunk** — a safety margin under the 5MB/10k ceilings so a chunk never gets rejected for size, with room for header/encoding overhead. It also drops profiles with no email (the required identifier; counted in `skippedNoEmail`) and any single profile whose own JSON exceeds 100KB (counted in `oversized`) since that one can never fit. Always run a sweep's profiles through the chunker, then `bulkImportProfiles` each chunk.

**Async, so poll — don't assume done on 202.** The 202 only means the job was accepted. Poll `getBulkImportJobStatus` until `complete`, then `getBulkImportErrors` to see which individual profiles failed (the job can complete with some rows rejected). This is the follow-up flagged in the "Bulk Klaviyo profile sync must be throttled" gotcha above for whole-DB sweeps that would otherwise exceed the serverless `maxDuration` on the per-profile route.

## Klaviyo two-stage load: the queue stub must stay at `afterInteractive` (2026-07-19)

`KlaviyoScriptLoader` renders TWO scripts: the official proxy/queue snippet (`klaviyo-onsite-queue`, afterInteractive) and the heavy onsite suite (`klaviyo-onsite-suite`, lazyOnload). The helpers in `utils/tracking/klaviyo-helpers.ts` (and `KlaviyoPageTracker`) **bail silently when `window.klaviyo` is undefined** — they do not create their own queue. If the queue snippet is ever demoted to `lazyOnload` (or merged into the suite script), every event fired between hydration and browser idle — initial page view, session identify, `Viewed Giveaway` on ad landings — is dropped, not delayed. This nearly shipped during the 2026-07 perf work; the split is the fix, not an optimization.

Also load-bearing: the suite's official snippet skips itself when `window.klaviyo` already exists (`if(!window.klaviyo)`), which is why the queue stub had the script-injection tail REMOVED rather than the whole snippet duplicated — a second copy would no-op and the suite would never load.

## Third-party hydration pile-up (2026-07-17 audit)

Before R7's timing policy, GTM + Meta + TikTok + Klaviyo + Contentsquare (~539 KB gz / 1.75 MB uncompressed) all began parse/execute at hydration — ~1.5–2.5 s of main-thread time on a mid-range Android, right when the page was trying to become interactive. Keep the R7 table honest when adding tags.

## Klaviyo suite: first-event trigger + idle fallback (2026-07-20 fix)

Pure `lazyOnload` for the suite LOST every queued event when a visitor bounced before browser idle — including the authed `Started Checkout` that drives the abandoned-checkout email. `KlaviyoScriptLoader` now injects the suite script on the FIRST `klaviyo`/`_klOnsite` push (patched queue push, with retry because the afterInteractive queue snippet may install after the effect) or at browser idle, whichever comes first. Tracked visitors ship events as fast as pre-split; event-less visitors keep the full deferral. Don't "simplify" back to a plain lazyOnload `<Script>`.

## Contentsquare double-counted every SPA navigation (tag-side CSTC + client push, 2026-08-07)

**Incident (verified live 2026-08-07):** `/membership` and `/faq` each sent **two** artificial
pageviews per client-side navigation (`pn=2` and `pn=3`, then `pn=5` and `pn=6`). Cause: the live
Contentsquare project config contained a **CSTC** snippet pairing the "Artificial Pageview"
template with a **"HistoryChange"** trigger (fires on `pushState` / `replaceState` / `popstate`)
**in addition to** our own `trackPageview` push. Contentsquare does not de-duplicate the two —
its docs assume you use CSTC or a manual push, never both. Effect: inflated pages/session and
phantom self-loops (`/membership` → `/membership`) in Journey Analysis.

**Why code review could not catch it:** the CSTC snippet lives in the Contentsquare dashboard,
not in this repo. Worse, `ContentsquarePageTracker`'s header comment asserted the tag "does NOT
auto-detect History API navigations" — true when verified against the bundle on 2026-08-03, and
silently false once the snippet was enabled. A comment about third-party dashboard state ages
without any local signal; verify it, don't trust it.

**Resolution:** the CSTC snippet was disabled and the client-side push kept — it also applies
`shouldTrackRoute()` filtering and the 255-char cap, which the tag-side trigger does not.
Check the (public) tag-side config with
`curl -s https://t.contentsquare.net/settings/598444.json | jq .implementations`; an empty array
is healthy. Full rule: [rules.md R11](./rules.md#r11-contentsquare-virtual-pageviews-come-from-the-client-push-only--never-also-from-a-tag-side-cstc-snippet).

## Contentsquare replay masks form fields, not text nodes — rendered PII was unmasked until 2026-08-07

Verified against the live project config on 2026-08-07: session replay ran at 100% capture with
**no masking configured at all** (`anonymisationMethod: null`, `textVisibilityEnabled: 0`,
`maskMedia: false`). That is less exposed than it sounds — `<input>` / `<textarea>` /
contenteditable content is masked by default, and Automatic Personal Data Redaction (always on)
strips emails, JWTs, OAuth tokens and card numbers from the DOM, URLs and error strings. The gap
was **personal data rendered as a text node**: a member's name in the header, a shipping address
on checkout success, a date of birth, free text typed into support chat.

Closed by pushing `setPIISelectors` with `[data-cs-mask]` and marking those render sites — see
[frontend.md](./frontend.md#contentsquare-pii-masking--data-cs-mask-2026-08-07). Two footguns when
touching this: the push **must** happen before the main tag fires (Contentsquare's docs are
explicit; a late masking rule has already lost the first pageview), and masking is driven by the
bare attribute only — adding a class-based selector list instead would break the next time someone
renames a class.

## GTM custom-HTML tags are blocklisted client-side (2026-07-20)

`GTM_INIT_SNIPPET` pushes `{'gtm.blocklist':['html']}` before gtm.js loads. Why: container GTM-TBCCQQVZ's ONLY tag is a dead legacy Hotjar custom-HTML tag whose loader is CSP-blocked (console error on every page); the blocklist stops GTM from attempting the injection at all. If you ever add a legitimate custom-HTML tag to the container, REMOVE the blocklist key from `src/utils/security/inline-snippets.ts` (and recompute the GTM_INIT_SNIPPET hash in csp.ts — `npm run test:csp-inline-hashes` guards the pairing). Best end-state: delete the Hotjar tag in the GTM UI, then this blocklist becomes belt-and-braces.
