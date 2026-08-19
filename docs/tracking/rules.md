# Tracking — Rules

## R1. Server-side events for purchases / cancellations

Canonical purchase / cancel / refund events fire SERVER-SIDE (Meta CAPI, Klaviyo events API). Client-side pixels are best-effort backup. Don't rely on browser pixels for revenue-relevant data — ad-blockers and ITP suppress them.

## R2. Webhook is the single emitter for cancel / paid events

Per [billing-stripe R2](../billing-stripe/rules.md#r2-the-webhook-is-the-only-emitter-of-cancellation-tracking-events): cancel / paid analytics fire from the matching webhook only, not from API paths. Prevents double-counting.

## R3. Honour unsubscribe / GDPR deletion

When a user is suppressed (Klaviyo unsubscribe) or requests deletion, don't send tracking events involving them. Klaviyo / SendGrid suppression lists are checked at send time.

## R4. No PII in pixel events without consent

UTM params, generic user ids OK. Email + phone require Meta CAPI's hashing convention. Don't send raw PII.

**Corollary — every tracking provider must be disclosed in the privacy policy.** `src/app/(site)/privacy/page.tsx` §7 (Cookies & Tracking) names the marketing pixels AND the server-side conversion APIs. When you add or remove a provider (or move one from pixel-only to server-side), update that section in the same change, and touch CUSTOMER.md §8e (rule 5b). 2026-07-24 (panel F-012): TikTok was tracking every visitor via pixel + Events API while the policy named only the Facebook Pixel — now both Meta and TikTok are disclosed, including the hashed-identifier server-side sharing.

## R5. UTM persistence respects same-origin

`useUTMPersistence` writes to localStorage / sessionStorage. Don't try to share UTM across origins (privacy + tech limits).

## R6. CSP must include tracking origins

Adding a new tracking provider requires updating CSP — see [security-csp](../security-csp/). Don't bypass CSP with `unsafe-inline`.

## R7. Third-party script timing policy (2026-07-19 perf)

| Class | Scripts | strategy | Why |
|---|---|---|---|
| Conversion-critical | GTM (`GoogleTagManager`, next/script `afterInteractive`); Meta + TikTok pixels (`ConversionPixels` — mounts via `useEffect`/`provider.loadPixel()`, equivalent immediate post-hydration timing) | immediate post-hydration | Ad attribution/conversions must not miss early events. |
| Klaviyo queue stub | `klaviyo-onsite-queue` (inline Proxy, ~1 KB) | `afterInteractive` | Must exist before any identify/track/page call or events DROP (helpers bail on `!window.klaviyo`). |
| Analytics / marketing suites | Contentsquare, Klaviyo onsite suite (`klaviyo-onsite-suite`) | `lazyOnload` | ~157 KB gz + ~80 KB gz; at hydration they competed with interactivity on low-end phones. Queued Klaviyo events deliver on arrival. |

Adding a new `afterInteractive` (or earlier) tag requires a written perf justification in the PR — the combined third-party payload measured ~539 KB gz / 1.75 MB raw at hydration before this policy (2026-07-17 audit). Never collapse the Klaviyo queue stub into the lazy suite script — see the gotcha below.

## R8. Every third-party script must be env-gated, no exceptions

Every tracker mounted from `src/app/layout.tsx` or a loader component must no-op when its id/token env var is blank — `GoogleTagManager` (`!gtmId`), `KlaviyoScriptLoader` (`!companyId`), `ConversionPixels` (per-provider `enabled()`). Contentsquare's `<Script>` was the one exception (a hardcoded `src` with no gate, loading for every visitor in every environment) until 2026-07-22, when it was extracted to `NEXT_PUBLIC_CONTENTSQUARE_ID` (blank ⇒ renders nothing, mirrors `GoogleTagManager`'s convention) — see [.env.example](../../.env.example). Never hardcode a third-party tag id directly into a `<Script src>` — always route it through a `NEXT_PUBLIC_*` var so dev/e2e/staging can disable it without a source change.

The gate applies to **companion components**, not just the `<Script>`: both `<ContentsquarePageTracker />` (mounted in `src/app/layout.tsx`) and `<ContentsquareDynamicVariables />` (mounted in `src/app/providers.tsx`) are wrapped in the same `NEXT_PUBLIC_CONTENTSQUARE_ID` check at their mount sites, so a blank id means they are never mounted and nothing is pushed onto `window._uxa`.

## R9. No consent banner — pixels load for every visitor (deliberate, 2026-07-24)

**Tools Australia runs without a cookie/pixel consent banner.** The tracking pixels
(Meta, TikTok, Snapchat) and the server-side conversion APIs load and fire for every
visitor. This is a **deliberate product decision**, not an oversight — recorded here so
nobody "restores" a consent gate believing it was lost by accident.

The codebase already encoded this: `hasPixelConsent()` in
[`src/components/PixelTracker.tsx`](../../src/components/PixelTracker.tsx) hard-returns
`true` ("auto-accept mode"), and `grantPixelConsent`/`revokePixelConsent` are no-op
stubs kept only so legacy deep imports keep compiling.

**What was removed (panel F-019).** `PixelConsentModal` + its `"pixel-consent"`
`ModalType`, priority entry, `UnifiedModalManager` case, and dev-gallery entry were
deleted. The modal had been **permanently unreachable**: the manager rendered it with a
hard-coded `isOpen={false}` and a `// This would be controlled by pixel consent logic`
placeholder, and both its Accept and Decline handlers merely closed it — Decline gated
nothing. A consent control that cannot appear, and would not work if it did, is worse
than none: it implies a choice the visitor does not actually have.

**If a consent banner is ever wanted, it is not a UI task.** It requires, at minimum:
pixels must not load until consent is given (`ConversionPixels` currently mounts every
enabled provider on first effect); Decline must actually prevent Meta/TikTok/Snapchat
from loading AND suppress the server-side CAPI sends for that visitor; consent must
persist across sessions; and `hasPixelConsent()` must become a real read. Expect
measured conversions and ROAS to drop when it lands — that is the cost of the control,
and it should be a planned, communicated change rather than a side effect.

The privacy policy discloses the tracking that actually happens (see R4's corollary).

## R10. A TikTok page view goes through `ttq.page()` — never `ttq.track("PageView")`

TikTok's standard page-view event is the SDK method **`ttq.page()`**, whose event code is
**`Pageview`** (capital P, lowercase v). `ttq.track(name, …)` passes an unrecognised `name`
through verbatim and registers a **custom** event of that name.

This is not hypothetical. `ConversionPixels` dispatches a canonical event literally named
`"PageView"` on SPA route changes; before the provider learned to translate it, it fell through
to the generic `ttq.track(event.eventName, …)` tail and created a **custom `PageView` event
sitting alongside the standard `Pageview`** — 3,748 events on a separate Events Manager row.
The translation now lives in [`providers/tiktok.ts`](../../src/lib/tracking/providers/tiktok.ts)
(`eventName === "PageView"` → `window.ttq.page()` → early return) so `ConversionPixels` stays
provider-agnostic, and it is pinned by a test.

Consequences worth knowing, because they are not symmetrical:
- Custom events **cannot** be used for campaign optimization, so this did not poison delivery.
- Custom events **can** be used for **audience building** — so a stray one can silently back an
  audience rule aimed at the wrong population.
- Dedup can never merge the two rows: it keys on identical event **name** + `event_id`.
- TikTok publishes no way to **delete** a custom event that has already been received. It ages
  out. Do not expect to clean it up in the dashboard.

Corollary: **never** add manual `ttq.track` calls for `LandingPageView` or `EngagedSession`.
Those are emitted by the SDK's own LPV plugin, which piggybacks on `Pageview`; a manual copy
would double-count *and* create two more custom events.

## R11. Contentsquare virtual pageviews come from the client push ONLY — never also from a tag-side CSTC snippet

Contentsquare can emit a virtual pageview from **two** places, and it does **not** de-duplicate
them:

1. [`ContentsquarePageTracker`](../../src/components/tracking/ContentsquarePageTracker.tsx) —
   `window._uxa.push(["trackPageview", path])` on every App Router route change (this repo).
2. A **CSTC** snippet in the Contentsquare Tag Configurator pairing the **"Artificial Pageview"**
   template with a **"HistoryChange"** trigger, which fires a virtual pageview on
   `pushState` / `replaceState` / `popstate`. That is dashboard-side config, **not** in this repo,
   and therefore invisible to code review.

Contentsquare's own docs assume you use CSTC **or** a manual push, never both. Both were live
until **2026-08-07**: `/membership` and `/faq` each sent **two** artificial pageviews per
navigation (`pn=2` and `pn=3`, then `pn=5` and `pn=6`), inflating pages/session and putting
phantom self-loops into Journey Analysis.

**Resolution: the CSTC snippet is disabled; the client-side push stays.** The client push is the
one worth keeping — it also applies `shouldTrackRoute()` route filtering and the 255-char path
cap, neither of which the tag-side trigger does.

The tag-side config is public, so this is checkable without dashboard access:

```bash
curl -s https://t.contentsquare.net/settings/598444.json | jq .implementations
```

An **empty array** is the healthy state (this component is the only source). Any
ArtificialPageview / HistoryChange entry means the double-count is back — disable that snippet in
the Tag Configurator rather than deleting the client-side push. Incident detail:
[gotchas.md](./gotchas.md#contentsquare-double-counted-every-spa-navigation-tag-side-cstc--client-push-2026-08-07).

## R9 — Shop Purchase fires from `finalizeShopOrder`, keyed on `orderNumber`

Merchandise is the one payment type whose canonical Purchase does **not** come
from `processPaymentBenefits`.

**Why it is excluded there.** Every other server emitter keys its event id on
`paymentIntentId`, while the shop's browser fire on `/checkout/success` keys on
`orderNumber`. Two different ids for one sale means Meta cannot dedup them and
every merch order is counted twice. That guard in `payment-processing.ts` stays.

**Why not hung off `processPaymentBenefits` at all.** It returns early while
`includedEntries` is 0 — which is every merch order today, and will stay so until
the permit variation lands. Hanging Purchase there means **no merch sale is ever
reported**.

So it lives on the fulfilled path of `finalizeShopOrder`, keyed on
`order.orderNumber` to match the browser half. That placement is also what makes
it fire exactly once:

| Case | Outcome |
| --- | --- |
| First delivery | `markPaid` matches, fulfilled path runs, Purchase emits once |
| Redelivered webhook | `markPaid` returns null, the `already_processed` branch returns before the emit |
| Stock lost after payment | Refunded and returned above the emit — a refunded order reports no Purchase |
| Belt and braces | Both halves key on `orderNumber`, so Meta merges within its window |

**Klaviyo gets an order-shaped `Placed Order`**, not the package-shaped one.
`trackShopPlacedOrder` sends the frozen revenue keys (`$value`, `Currency`,
`Order ID`, `items[]`) plus `order_type: "shop"` as the discriminator, and
deliberately omits `package_type` / `package_id` / `package_name` — those would
write "Unknown Package" into Klaviyo on every merch sale.

⚠️ **Klaviyo dashboard follow-up:** any existing flow or segment filtering
`Placed Order` on `package_type` will not match merchandise orders. That is a
dashboard decision, not a code one.

**Click ids ride through Stripe metadata.** The webhook has no cookies, so
`/api/shop/checkout` stashes `capi_fbc` / `capi_fbp` / `capi_ttclid` / `capi_ttp`
/ ip / ua on the PaymentIntent, exactly as the one-time and mini-draw routes do,
and the webhook reads them back with `extractRequestContextFromMetadata`. Without
that hand-off the server Purchase reaches Meta and TikTok with no click id and
cannot be attributed at all.
