# Tracking Provider Registry — Design

**Date:** 2026-05-11
**Status:** Draft (awaiting user review)
**Domain:** `tracking`

## Problem

Today's conversion-tracking stack is asymmetric and hard to extend:

- **Facebook** has a complete dual-fire pipeline: rich browser pixel ([`src/components/FacebookPixel.tsx`](../../../src/components/FacebookPixel.tsx)) with production-hostname gating, CSP nonce support, `eventID`-based dedup, retries; a full CAPI library ([`src/lib/facebook.ts`](../../../src/lib/facebook.ts)) with dev/test-event-code support, sanitization, match-quality fields; a Zod-validated API route ([`src/app/api/facebook/track/route.ts`](../../../src/app/api/facebook/track/route.ts)); and a full admin analytics page ([`src/components/admin/FacebookAdsManagement.tsx`](../../../src/components/admin/FacebookAdsManagement.tsx)) backed by Meta Marketing API insights.
- **TikTok** has only a minimal browser pixel ([`src/components/TikTokPixel.tsx`](../../../src/components/TikTokPixel.tsx)): no CAPI, no dedup, no hostname gating, no admin analytics. Worse, it's only fired from client contexts inside [`trackPixelPurchase`](../../../src/utils/tracking/pixel-purchase-tracking.ts) — for Stripe-webhook-driven purchases (most subscription renewals and async confirmations), TikTok fires **zero** events because there's no server-side fallback. Silent data loss.
- **Snapchat** does not exist yet.
- The comment at [`pixel-purchase-tracking.ts:6`](../../../src/utils/tracking/pixel-purchase-tracking.ts#L6) claims "Browser pixel removed - using CAPI-only approach", which is false: `trackPurchaseWithEventId` is still invoked from [`PaymentProcessingScreen.tsx:175`](../../../src/components/loading/PaymentProcessingScreen.tsx#L175) and [`PaymentSuccessHandler.tsx:78`](../../../src/components/payment/PaymentSuccessHandler.tsx#L78). The browser pixel was moved, not removed. The stale comment is a maintenance hazard.
- **Production bug surfaced during brainstorming:** Meta Events Manager shows Purchase as "Conversions API" only (no browser pixel data). Root cause: [`PaymentSuccessHandler.tsx:58-86`](../../../src/components/payment/PaymentSuccessHandler.tsx#L58-L86) only fires `trackPurchaseWithEventId` when `use3DSRedirectHandler()` resolves a `paymentIntent` — which only happens when the success URL carries `payment_intent_client_secret` (the 3DS-redirect path). For non-3DS cards, async confirmations, and Stripe-webhook-driven renewals, the browser pixel never fires. The four success-page clients ([`PurchaseSuccessClient`](../../../src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx), [`UpsellSuccessClient`](../../../src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx), [`MiniDrawSuccessClient`](../../../src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx), [`CheckoutSuccessClient`](../../../src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx)) contain zero direct Purchase pixel calls — they all just embed `<PaymentSuccessHandler>` and inherit the 3DS-only behavior. This spec must fix this as part of enforcing the dual-fire contract.

The user wants to add **TikTok Events API** and **Snapchat Conversions API** alongside Facebook, each with its own admin analytics view. Doing this with the current per-provider sprawl would either triple the duplication or invite drift.

## Goals

1. Define a **provider-pluggable** layer that makes adding TikTok and Snapchat (and any future platform) a single-file change, not a sprawl across `lib/`, `components/`, `app/api/`, and admin.
2. **Refactor Facebook into the new shape** behind its existing facades so no call sites change. Existing helpers (`trackPurchaseWithEventId`, `trackPixelPurchase`, `sendFacebookEvent`) keep working unchanged.
3. **Standardize the dual-fire + dedup contract** (browser pixel + server CAPI sharing one event ID) across every provider. Today Facebook does this; TikTok cannot (no CAPI); Snapchat doesn't exist. After this spec the contract is enforced by the Provider interface — opting out is not possible.
4. **Standardize the production-hostname gate** across every browser pixel. Today only Facebook refuses non-prod hosts. After this spec every pixel does.
5. Scaffold the per-platform admin analytics so that a follow-up spec can plug in each platform's Marketing-API sync without touching the shell.

## Non-goals

- **Not in scope:** implementing TikTok Events API or Snapchat Conversions API end-to-end. This spec ships **stubs** for each — the registry knows about them, the pixel loaders fire, but `capiSend` is a no-op returning `false`. The full implementation is each platform's own follow-up spec.
- **Not in scope:** implementing TikTok or Snapchat Marketing-API insights sync. This spec defines the Mongoose schemas (`TikTokAdInsightsDaily`, `SnapchatAdInsightsDaily`) and admin-tab shells, but the sync services come later.
- **Not in scope:** rewriting any call site of the existing `trackPurchaseWithEventId` / `trackPixelPurchase` / `sendFacebookEvent` API. Those facades stay, redirected internally to the new layer.
- **Not in scope:** a unified cross-platform "all ads dashboard". One tab per platform, period.
- **Not in scope:** per-event provider routing. Every conversion fans out to every enabled provider.
- **Not in scope:** event bus / queue / retries — current direct-POST reliability is acceptable; we revisit only if there's an incident.

## Design

### 1. Provider interface

Every conversion-tracking platform implements one module at `src/lib/tracking/providers/<platform>.ts`. The interface:

```ts
// src/lib/tracking/types.ts

export type ProviderId = "facebook" | "tiktok" | "snapchat";

/** Canonical event shape — what dispatchers pass to providers. */
export interface CanonicalEvent {
  eventName: string;                // 'Purchase' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | ...
  eventId: string;                  // Used for browser↔CAPI dedup. REQUIRED.
  eventTime: number;                // Unix seconds.
  value?: number;
  currency?: string;                // ISO 4217, uppercase.
  userData?: {
    email?: string;                 // Raw — providers hash.
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    externalId?: string;
    birthdate?: string | Date;
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbc?: string;                   // FB click id — passed through to FB only.
    fbp?: string;                   // FB browser id — passed through to FB only.
    ttclid?: string;                // TikTok click id — passed through to TikTok only.
    scid?: string;                  // Snap click id — passed through to Snapchat only.
  };
  customData?: {
    contentIds?: string[];
    contentType?: string;
    contentName?: string;
    contentCategory?: string;
    numItems?: number;
    orderId?: string;
    packageType?: string;
    searchString?: string;
  };
  eventSourceUrl?: string;
  /** Escape hatch for provider-specific fields. Rare. */
  providerData?: {
    facebook?: Record<string, unknown>;
    tiktok?: Record<string, unknown>;
    snapchat?: Record<string, unknown>;
  };
}

export interface RequestContext {
  clientIpAddress?: string;
  clientUserAgent?: string;
  eventSourceUrl?: string;
}

export interface ConversionProvider {
  id: ProviderId;

  /**
   * Per-surface enablement. Pixel id and access token are independent —
   * a provider can have the pixel live while CAPI is still being onboarded, or vice versa.
   * Env vars are read lazily on every call so adding a token at runtime takes effect
   * on the next request without redeploying.
   */
  enabled(): { pixel: boolean; capi: boolean };

  /** Hostnames that may run the browser pixel. Hard contract: pixel refuses on any other host. */
  productionHostnames(): string[];

  /** Inject the provider's pixel script. Idempotent; respects CSP nonce. No-op if `enabled().pixel` is false. */
  loadPixel(opts: { nonce?: string }): void;

  /** Fire the event in the browser. MUST include the dedup id mapped per provider. No-op if `enabled().pixel` is false. */
  pixelTrack(event: CanonicalEvent): void;

  /** Send the event server-to-server. MUST return false (no network call) if `enabled().capi` is false. MUST return false on validation failure (never throw). */
  capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean>;
}
```

### 2. Dispatchers

Two thin fan-out functions — the canonical call sites for everything new:

```ts
// src/lib/tracking/dispatch.ts (server)
export async function sendConversion(
  event: CanonicalEvent,
  ctx: RequestContext,
): Promise<Record<ProviderId, boolean>>;

// src/lib/tracking/dispatch-client.ts (browser)
export function trackConversion(event: CanonicalEvent): void;
```

Both walk `registry.getAllProviders()`. The client dispatcher calls `pixelTrack` on every provider where `enabled().pixel === true`; the server dispatcher calls `capiSend` on every provider where `enabled().capi === true`. No filtering beyond that, no per-event routing — surface-by-surface independence is the only flexibility.

### 3. Hard contracts enforced by the registry

The registry enforces four invariants at runtime. Violations are programmer errors and throw in dev / log + skip in prod (never break a checkout):

1. **Every `CanonicalEvent` MUST have a non-empty `eventId`.** This is the browser↔CAPI dedup glue. Each provider maps it:
   - Facebook: `event_id` on CAPI; 4th param `{ eventID }` on `fbq('track', ...)`.
   - TikTok: `event_id` on Events API; passed as `event_id` in `ttq.track(name, data, { event_id })`.
   - Snapchat: `client_dedup_id` on CAPI; same field on `snaptr('track', ...)`.
2. **Every browser pixel refuses to fire on non-prod hostnames.** `productionHostnames()` is the per-provider allowlist. Today Facebook uses `["toolsaustralia.com.au", "www.toolsaustralia.com.au"]`; TikTok and Snapchat inherit the same list.
3. **Every Purchase event MUST dual-fire** (pixel + CAPI). This is a recommendation from all three platforms (Meta, TikTok, Snapchat) for match quality and lower cost-per-result. The Provider interface offers no way to disable one side — if `enabled()` is true, both `pixelTrack` and `capiSend` run.
4. **Missing credentials MUST never break the site.** TikTok and Snapchat accounts are still being onboarded, so their env vars (`NEXT_PUBLIC_TIKTOK_PIXEL_ID`, `TIKTOK_ACCESS_TOKEN`, `NEXT_PUBLIC_SNAPCHAT_PIXEL_ID`, `SNAPCHAT_ACCESS_TOKEN`) will be absent in production for an indeterminate period. The registry MUST treat absence as "disabled" — no thrown errors, no failed fetches, no console-spam, no rendered noscript fallbacks, no script tags injected. See "Runtime safety with missing credentials" below for the full behavior matrix.

### 4. File layout

```
src/lib/tracking/
  types.ts                      ← CanonicalEvent, ConversionProvider, RequestContext, ProviderId
  registry.ts                   ← getEnabledProviders(), guards
  dispatch.ts                   ← server fan-out (sendConversion)
  dispatch-client.ts            ← browser fan-out (trackConversion)
  canonical-event.ts            ← builders, hashData(), buildPurchaseEvent(...), eventId helpers
  providers/
    facebook.ts                 ← wraps src/lib/facebook.ts (thin facade calling existing helpers)
    tiktok.ts                   ← STUB: loadPixel + pixelTrack work; capiSend returns false
    snapchat.ts                 ← STUB: loadPixel + pixelTrack work; capiSend returns false
src/components/tracking/
  ConversionPixels.tsx          ← new entry point; replaces PixelTracker usage in layout.tsx
src/app/api/tracking/
  conversion/route.ts           ← provider-agnostic POST endpoint → sendConversion
src/models/
  TikTokAdInsightsDaily.ts      ← shape parallel to MetaAdInsightsDaily (no sync yet)
  SnapchatAdInsightsDaily.ts    ← same
src/components/admin/
  TikTokAdsManagement.tsx       ← shell tab, empty state, sidebar entry only
  SnapchatAdsManagement.tsx     ← shell tab, empty state, sidebar entry only
  ads/
    shared/                     ← MetricCard, DateRangeToggle, SpendByUrlSection moved here
                                   from src/components/admin/ if currently FB-specific.
```

### 5. Backwards-compatibility facades

These existing modules **stay** and become thin shims over the new layer:

| Existing surface | Becomes |
|---|---|
| `src/lib/facebook.ts` `sendFacebookEvent`, `sendFacebookPurchaseEventDev`, `buildFacebookPurchaseEventDev` | Delegate to `providers/facebook.ts` `capiSend`. |
| `src/components/FacebookPixel.tsx` `trackPurchaseWithEventId`, `trackFacebookEvent`, `trackPurchase`, `trackViewContent`, `trackAddToCart`, … | Delegate to `providers/facebook.ts` `pixelTrack`. |
| `src/components/TikTokPixel.tsx` `trackTikTokEvent`, `trackTikTokPurchase`, … | Delegate to `providers/tiktok.ts` `pixelTrack`. |
| `src/components/PixelTracker.tsx` | Delegate to `<ConversionPixels />`. Component file kept for any deep imports; nothing should need to change. |
| `src/app/api/facebook/track/route.ts` | Translate request body → `CanonicalEvent` → `sendConversion` (which will fan out to FB only if TikTok/Snap are not enabled). Stays as a deprecated alias of `/api/tracking/conversion`. |
| `src/utils/tracking/pixel-purchase-tracking.ts` | `trackPixelPurchase` and `trackPixelSubscription` build a `CanonicalEvent` once, then call `sendConversion`. The inline `trackTikTokEvent` block is removed — the dispatcher handles TikTok fan-out. The Klaviyo block stays as-is: Klaviyo is marketing automation, not a CAPI provider, so it remains a separate direct call. |
| Stale "Browser pixel removed" comment at `pixel-purchase-tracking.ts:6` | Rewritten to describe the new dispatcher. |

The two browser-side `trackPurchaseWithEventId` call sites at `PaymentProcessingScreen.tsx:175` and `PaymentSuccessHandler.tsx:78` continue to work unchanged — the function still exists, just routes through the registry internally. Once the registry is in place, every enabled provider's pixel fires when those are called, not just Facebook.

### 6. API route

New: `POST /api/tracking/conversion`

Body (Zod-validated): a `CanonicalEvent` minus the server-derived fields (`eventTime` defaults to now; `userData.clientIpAddress` and `userData.clientUserAgent` are extracted from request headers if absent).

Response: `{ ok: boolean, results: { facebook?: boolean, tiktok?: boolean, snapchat?: boolean } }`.

Existing `/api/facebook/track` stays. Its handler is replaced with a thin shim that builds a `CanonicalEvent` from the old Facebook-shaped body and forwards to the new dispatcher. Marked deprecated in a JSDoc on the file.

### 7. Admin analytics scaffold

**Sidebar** ([`AdminSidebar.tsx`](../../../src/app/admin/component/AdminSidebar.tsx) "analytics" group): add `tiktok-ads` and `snapchat-ads` tabs. Icons: TrendingUp (reuse) — actual brand icons can come later. The existing `facebook-ads` tab is untouched.

**Tab dispatcher** ([`AdminPage.tsx`](../../../src/app/admin/component/AdminPage.tsx)): add `case "tiktok-ads"` and `case "snapchat-ads"` routing to the new shell components.

**Shell components** (`TikTokAdsManagement.tsx`, `SnapchatAdsManagement.tsx`):
- Same overall page layout as `FacebookAdsManagement.tsx`: header, `DateRangeToggle`, summary metric cards.
- Metric cards display `—` (or "no data") with a single inline empty-state message: *"Insights sync not yet configured."* No link, no instructions — the follow-up spec will replace this empty state with real data.
- No data hooks, no API calls. This is purely a UI shell that proves the sidebar wiring and shared-primitives extraction.

**Shared primitives extraction** — move from FB-specific homes to `src/components/admin/ads/shared/`:
- `MetricCard` (currently `src/components/admin/metrics/shared/MetricCard.tsx` — already shared; verify import path stays valid)
- `DateRangeToggle` (already at `src/components/admin/DateRangeToggle.tsx`; only move if currently coupled to FB)
- `SpendByUrlSection` (currently `src/components/admin/SpendByUrlSection.tsx`) — leave under FB for now; this is Meta-specific until we know TikTok/Snap support equivalent reporting. **Do not** extract speculatively.

**Insights schemas** (created, not used in this spec):
- `src/models/TikTokAdInsightsDaily.ts`: same shape as `MetaAdInsightsDaily` with `adAccountId`, `date`, `adId`, `adsetId`, `campaignId`, names, `spendCents`, `impressions`, `clicks`, `conversions`, `revenueCents`, `raw`, `syncedAt`. Unique index `(adAccountId, date, adId)`.
- `src/models/SnapchatAdInsightsDaily.ts`: same shape with `adAccountId` → Snap's `ad_account_id`. Identical otherwise.
- Both registered in the `tracking` domain in the manifest.

### 8. Environment variables

Each provider's `enabled()` reads these (none new for Facebook; new ones for TikTok and Snapchat are stubs until you configure them):

| Provider | Pixel id (client) | Access token (server) | Test event code (optional) |
|---|---|---|---|
| Facebook | `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` | `FACEBOOK_ACCESS_TOKEN` | `FACEBOOK_TEST_EVENT_CODE` |
| TikTok | `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | `TIKTOK_ACCESS_TOKEN` | `TIKTOK_TEST_EVENT_CODE` |
| Snapchat | `NEXT_PUBLIC_SNAPCHAT_PIXEL_ID` | `SNAPCHAT_ACCESS_TOKEN` | `SNAPCHAT_TEST_EVENT_CODE` |

### 8a. Runtime safety with missing credentials

**Current state at ship time:** Facebook credentials are configured. TikTok and Snapchat business accounts are still being onboarded — neither pixel id nor access token will exist in production for an unknown period. The registry MUST handle this without any user-visible regression.

The `enabled()` check is per-surface, because pixel id is a `NEXT_PUBLIC_*` (browser-visible) and access token is server-only:

```ts
// providers/tiktok.ts (same pattern for snapchat.ts)
enabled() {
  // For browser surfaces, only the pixel id matters.
  // For server surfaces, only the access token matters.
  // Registry calls the right side at the right time.
  return {
    pixel: !!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    capi: !!process.env.TIKTOK_ACCESS_TOKEN,
  };
}
```

Behavior matrix when any provider's credentials are partially or fully missing:

| Surface | Provider state | Behavior | What the user sees |
|---|---|---|---|
| `<ConversionPixels />` load | pixel id missing | No `<script>` injected, no `<noscript>` fallback, no `window.ttq` / `window.snaptr` assignment | Nothing — page renders normally |
| Browser `trackConversion(event)` | pixel id missing for provider X | Provider X is silently skipped; other enabled providers still fire | Same purchase confirmation; no console error |
| Server `sendConversion(event, ctx)` | access token missing for provider X | Provider X's `capiSend` short-circuits and returns `false` before any network call | API responds `{ ok: true, results: { facebook: true, tiktok: false, snapchat: false } }` — no 500, no exception |
| `/api/tracking/conversion` POST | all CAPI providers missing tokens | Endpoint responds `200` with all-`false` results object | Caller logic continues; Stripe webhook handler does not retry |
| Admin `TikTokAdsManagement.tsx` / `SnapchatAdsManagement.tsx` | no insights data yet | Renders the empty-state shell ("Insights sync not yet configured.") | Admin sees the tab and the placeholder; no broken UI, no API call failures |
| `registry.getEnabledProviders()` | reads env on every call | Recomputed per request (no module-level caching of env), so flipping a token on at runtime takes effect on next request | When you add the TikTok token later, the next purchase fans out to TikTok automatically — no deploy needed beyond setting the env var |

**Explicit non-behaviors** (things the registry MUST NOT do when credentials are absent):

- No `throw` on missing env at module load. Env reads are lazy, inside `enabled()`.
- No `console.error` / `console.warn` on every event for missing credentials. One INFO-level startup log per provider per process is fine; per-event spam is not.
- No outbound `fetch()` calls. Returning `false` early before the network is mandatory — we will not be the source of a thundering herd against Meta/TikTok/Snap when env is partially set.
- No retries, no scheduled jobs queuing for "when the token shows up". Events sent while disabled are dropped, period.
- No `<script>` tag injection from disabled pixels. The browser bundle should not even reference `window.ttq` or `window.snaptr` until those pixels are enabled.

**Add an end-to-end smoke test** as part of Step 8 in migration order: `npm run test:tracking-dispatch` MUST include a case where TikTok and Snapchat are both fully disabled (no env vars) and a Purchase event flows through with the Facebook side succeeding and the other two cleanly skipped. This protects against future regressions during the months while you wait on ad-account approval.

### 9. Migration order

Each step is its own commit so failures are localized:

1. **Layer-only commit:** add `src/lib/tracking/**` and `src/components/tracking/ConversionPixels.tsx`. No existing file touched. Build-clean, but nothing uses it yet.
2. **Facebook provider:** implement `providers/facebook.ts` by calling the existing `sendFacebookEvent` and `fbq('track', ...)`. Add unit test asserting `capiSend` returns the same result as `sendFacebookEvent` for a synthetic event.
3. **TikTok / Snapchat stubs:** implement `providers/tiktok.ts` and `providers/snapchat.ts`. Pixels fire; `capiSend` returns `false`.
4. **Wire the entry point:** swap `<PixelTracker />` for `<ConversionPixels />` in `src/app/layout.tsx`. Verify Facebook + TikTok pixels still load.
5. **Facade swap:** rewrite `trackPurchaseWithEventId`, `trackFacebookEvent`, `trackTikTokEvent`, `sendFacebookEvent`, `buildFacebookPurchaseEventDev` to delegate. Existing tests under `src/lib/__tests__/facebook.test.ts` continue to pass.
6. **API route:** add `/api/tracking/conversion`. Replace `/api/facebook/track`'s handler with a forwarding shim.
7. **Pixel-purchase-tracking simplification:** rewrite `trackPixelPurchase` and `trackPixelSubscription` to build one `CanonicalEvent` and call `sendConversion`. Delete the inline TikTok branch inside those functions (TikTok now handled by the dispatcher). The Klaviyo block stays where it is — Klaviyo is marketing automation, not a CAPI provider, and its existing helpers in [`src/utils/tracking/klaviyo-helpers.ts`](../../../src/utils/tracking/klaviyo-helpers.ts) continue to be called directly. Fix the stale "Browser pixel removed" comment.
8. **Fix broken browser Purchase dual-fire on success pages.** This is the production bug surfaced in Problem. Each of the four success-page clients fires `Purchase` exactly once on mount using the new `trackConversion` dispatcher. The `eventId` MUST equal the `paymentIntentId` (or `orderId`) that the server-side CAPI used, so Meta/TikTok/Snap can dedup. Data source per page:
    - `PurchaseSuccessClient` — pull `payment_intent` from query params; if missing, call `/api/payment-status` to resolve. Value/currency from the resolved paymentIntent.
    - `UpsellSuccessClient`, `MiniDrawSuccessClient`, `CheckoutSuccessClient` — same pattern, adapted to each page's existing query-param convention.
    - Use a `useRef` "fired-once" guard (same pattern as `PaymentSuccessHandler.tsx:59`) so React StrictMode / re-renders don't double-fire.
    - Remove the now-redundant `trackPurchaseWithEventId` call inside `PaymentSuccessHandler.tsx` — the success page itself is now the canonical fire surface, and `PaymentSuccessHandler` is only one of four places that surface gets rendered. Leave the `PaymentProcessingScreen.tsx:175` call in place (defense-in-depth for users who never navigate off the processing screen) but verify the eventId-based dedup cache in `trackPurchaseWithEventId` prevents a double-fire if both surfaces run for the same payment.
9. **Admin scaffold:** add `TikTokAdsManagement.tsx`, `SnapchatAdsManagement.tsx`, sidebar entries, tab routing, and the two new Mongoose schemas.
10. **Domain manifest + docs:** update `docs/tracking/` (architecture, backend, frontend, models, api, patterns) to describe the registry. Update `CLAUDE.md` Domain Manifest's `tracking` `paths` array to include `src/lib/tracking/**` and `src/components/tracking/ConversionPixels.tsx`.

### 10. Testing

This repo's "tests" are standalone tsx scripts. Add:

- `src/lib/tracking/__tests__/dispatch.test.ts` — registers a fake provider, asserts `sendConversion` calls `capiSend` once per enabled provider, validates eventId is required, validates hostname gate on browser side. Wired into `package.json` as `test:tracking-dispatch`.
- Extend `src/lib/__tests__/facebook.test.ts` (or add a sibling) with one regression test: building a `CanonicalEvent` and dispatching through the Facebook provider produces the same Meta-bound payload as calling `sendFacebookEvent` directly.

No new test infrastructure. No mock for live Meta/TikTok/Snap APIs — tests stop at the network boundary as today.

### 11. Documentation

Update under `docs/tracking/`:

- `architecture.md` — replace the "Provider stack" table with the registry description; explain the dual-fire + dedup contract.
- `patterns.md` — document the "add a new provider" recipe: implement the interface, add env vars, register, done.
- `backend.md` — point at `src/lib/tracking/dispatch.ts` as the canonical server entry; note that `src/lib/facebook.ts` is now a facade.
- `frontend.md` — point at `<ConversionPixels />` and `trackConversion`; note that `<FacebookPixel>` / `<TikTokPixel>` are facades.
- `api.md` — document `/api/tracking/conversion` as primary, mark `/api/facebook/track` deprecated.
- `models.md` — add `TikTokAdInsightsDaily`, `SnapchatAdInsightsDaily`.
- `gotchas.md` — call out the production-hostname gate (every pixel refuses non-prod), and the dedup-id mapping per provider.

## Risks and trade-offs

- **Risk: the abstraction outlives its usefulness.** If we only ever ship Facebook + TikTok + Snapchat and never add a fourth, three implementations of one interface is cheap but not free. Acceptable: the registry pays for itself once the second provider lands.
- **Risk: provider-specific Marketing-API data shapes leak into the canonical event.** Mitigated by the `providerData` escape hatch — when TikTok's API needs a field that doesn't map to anything common, it goes in `providerData.tiktok` and the FB/Snap providers ignore it.
- **Trade-off: stubs ship before real TikTok/Snap CAPIs exist.** The registry will fan out to disabled providers as no-ops, which is fine, but admin users will see "no data" tabs for TikTok and Snapchat until the follow-up specs land. Acceptable — preferable to having half-wired structure that crashes when accessed.
- **Trade-off: backwards-compat facades stay forever.** They're a small per-file overhead and let us skip a high-blast-radius call-site sweep. The wrap-and-migrate choice was explicit.

## What this unlocks (follow-up specs)

- **Spec B:** TikTok Events API implementation. Replace the stub's `capiSend` with real Marketing API calls. Add TikTok Marketing-API insights sync (mirror `MetaInsightsSyncService` for TikTok). Light up `TikTokAdsManagement.tsx`.
- **Spec C:** Snapchat Conversions API implementation. Same shape as Spec B.
- **Spec D (optional):** cross-platform unified dashboard if there's actual user demand. Likely not needed.
