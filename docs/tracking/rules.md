# Tracking — Rules

## R1. Server-side events for purchases / cancellations

Canonical purchase / cancel / refund events fire SERVER-SIDE (Meta CAPI, Klaviyo events API). Client-side pixels are best-effort backup. Don't rely on browser pixels for revenue-relevant data — ad-blockers and ITP suppress them.

## R2. Webhook is the single emitter for cancel / paid events

Per [billing-stripe R2](../billing-stripe/rules.md#r2-the-webhook-is-the-only-emitter-of-cancellation-tracking-events): cancel / paid analytics fire from the matching webhook only, not from API paths. Prevents double-counting.

## R3. Honour unsubscribe / GDPR deletion

When a user is suppressed (Klaviyo unsubscribe) or requests deletion, don't send tracking events involving them. Klaviyo / SendGrid suppression lists are checked at send time.

## R4. No PII in pixel events without consent

UTM params, generic user ids OK. Email + phone require Meta CAPI's hashing convention. Don't send raw PII.

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
