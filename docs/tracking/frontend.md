# Tracking — Frontend

## Conversion pixels

[`<ConversionPixels />`](../../src/components/tracking/ConversionPixels.tsx) is the canonical browser-side pixel loader, mounted once in [`src/app/layout.tsx`](../../src/app/layout.tsx). It iterates the provider registry and calls each provider's `loadPixel({ nonce })` for those whose `enabled().pixel` is true.

`<FacebookPixel />` and `<TikTokPixel />` remain in the codebase as backwards-compat re-exports of their helper functions, but should not be mounted directly.

To fire a conversion from a client component, use `trackConversion(buildPurchaseEvent(...))` from [`src/lib/tracking/dispatch-client.ts`](../../src/lib/tracking/dispatch-client.ts).

## Pixel components (top-level)

[src/components/](../../src/components/) directly:
- `FacebookPixel.tsx`
- `GoogleTagManager.tsx`
- `KlaviyoPageTracker.tsx`
- `KlaviyoScriptLoader.tsx`
- `PixelTracker.tsx` (generic)
- `TikTokPixel.tsx`

These are mounted in the root layout and load each provider's SDK.

## Tracking subdir

[src/components/tracking/](../../src/components/tracking/) — additional tracking components / wrappers.

## Contentsquare PII masking — `data-cs-mask` (2026-08-07)

[`ContentsquarePageTracker`](../../src/components/tracking/ContentsquarePageTracker.tsx) pushes
`setPIISelectors` with a **single** selector: `[data-cs-mask]`. To keep an element's text out of
session replay, put the bare `data-cs-mask` attribute on it **at the render site**. One attribute
selector rather than a list of CSS class paths is deliberate — a renamed class silently stops
masking, whereas a moved attribute moves with the element.

Scope — what the attribute is actually for, since the tag already covers a lot:

- `<input>`, `<textarea>` and contenteditable content are masked **by default**; typed text is
  never collected, so form fields need no attribute.
- **Automatic Personal Data Redaction** (always on, cannot be disabled) replaces email addresses,
  JWTs, OAuth tokens and credit-card numbers found anywhere in the DOM, URLs or error strings.
- What neither covers is **personal data rendered as a text node** — a member's name in the
  header, a shipping address on checkout success, a date of birth, free text typed into support
  chat. That is this attribute's job.

Routes in `EXCLUDED_TRACKING_PREFIXES` (`/admin`, `/affiliate`, `/my-account/settings`) are
excluded from replay entirely, so elements only ever rendered there need no attribute. Grep
`data-cs-mask` for the current render sites (today: header, dashboard hero, monogram, my-account
nav, checkout success, birthdate picker, support-chat widget, the email-verification steps,
payment-methods settings, portal transit).

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useKlaviyoTracking()` | Fire Klaviyo events from components | [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts) |
| `usePixelTracking()` | Fire arbitrary pixel events | [src/hooks/usePixelTracking.ts](../../src/hooks/usePixelTracking.ts) |
| `useAttribution()` | Read attribution data (UTM, referrer) | [src/hooks/useAttribution.ts](../../src/hooks/useAttribution.ts) |
| `useUTMPersistence()` | Persist UTM params across navigation | [src/hooks/useUTMPersistence.ts](../../src/hooks/useUTMPersistence.ts) |

## CSP considerations

Pixels load third-party scripts. CSP must allow these domains (Facebook, Google, Klaviyo, TikTok). See [security-csp](../security-csp/).

## className conventions (2026-05-08)

Tracking/pixel components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Print-stylesheet markers (2026-05-09)

Pixel `<Script>` tags are tagged with `data-tracking-pixel="true"` (`GoogleTagManager`, `KlaviyoScriptLoader`, the Contentsquare loader in `app/layout.tsx`). The print stylesheet in [src/app/globals.css](../../src/app/globals.css) hides any `[data-tracking-pixel]` element so they don't leak into printed pages. When wiring a new pixel script, add the same attribute. See [shared-ui/patterns.md](../shared-ui/patterns.md#print-stylesheet) for the full set of print-hidden markers.

## Poppins now loads weight 800 (2026-07-21)

The `next/font/google` Poppins call in [src/app/layout.tsx](../../src/app/layout.tsx) added `"800"` to its `weight` array (now `400/500/600/700/800/900`) for the prize builder's `font-extrabold` type. No tracking behavior is affected; noted here only because `layout.tsx` is a tracking-domain file. Rationale + the "weight set is not trimmable" rule: [shared-ui/tailwind-conventions.md §10](../shared-ui/tailwind-conventions.md).

## Global `.ta-results` stylesheet import (2026-06-11)

[src/app/layout.tsx](../../src/app/layout.tsx) now imports `./(site)/draw-results/draw-results.css` globally (alongside `globals.css`). Every selector in that file is scoped under `.ta-results`, so the global import is inert on pages that don't use the class — it exists so the portable `WinnersTestimony` "Hear from our winners" section (draws domain) renders correctly on any host page (homepage, promotions, my-account). No tracking behavior is affected; noted here only because `layout.tsx` is a tracking-domain file.

## Viewport meta change (2026-06-09)

The `<meta name="viewport">` in [src/app/layout.tsx](../../src/app/layout.tsx) changed from `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no` to `width=device-width, initial-scale=1, viewport-fit=cover`.

- Dropping `maximum-scale=1.0, user-scalable=no` restores pinch-to-zoom (WCAG 1.4.4 / W3C ACT) and removes an iOS zoom crutch that was already ineffective (iOS ignores it for inputs).
- Adding `viewport-fit=cover` makes `env(safe-area-inset-*)` non-zero, so notch / home-indicator-safe padding now works (those CSS usages were previously inert).
- **Caveat:** `viewport-fit=cover` is global and removes the browser's automatic safe-area inset, so every bottom-fixed element now needs its own `env(safe-area-inset-bottom)` padding.
