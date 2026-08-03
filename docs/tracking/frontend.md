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

## Contentsquare SPA pageviews + replay exclusion (2026-08-03)

[`ContentsquarePageTracker`](../../src/components/tracking/ContentsquarePageTracker.tsx) is mounted from [`src/app/layout.tsx`](../../src/app/layout.tsx) behind `NEXT_PUBLIC_CONTENTSQUARE_ID`. Two commands, both pushed onto `window._uxa`:

| Command | When | Argument |
|---|---|---|
| `["excludeURLforReplay", <regex string>]` | once, on mount | A **regex string** (not a path/glob). Stops session-replay capture on matching URLs. |
| `["trackPageview", <path>]` | every `usePathname()` change except the first | **Path only** — no scheme, no domain, no hash, max 255 chars. The tag prepends the domain and appends the query string itself. |

Facts verified against the live bundle (`t.contentsquare.net/uxa/<id>.js`) rather than the docs, because the vendor docs are thin here:

- **Pushing before the tag loads is safe.** The tag does `window._uxa = window._uxa || []` on init and re-queues commands onto that array while its command service is still starting. This matters because the tag is `lazyOnload` — it initialises well after hydration, so every push from this component lands in the queue first.
- **The first pageview must be skipped.** The tag emits its own "natural" pageview per document load; sending ours too double-counts every landing page.
- **`excludeURLforReplay` takes one regex and replaces it on each set** (it is not additive). Default is `.^`, which matches nothing.
- **Replay exclusion and pageview suppression are independent controls** in the tag — excluding a URL from replay does not stop it counting as a pageview. This component does both, driven off the same `EXCLUDED_TRACKING_PREFIXES` list in [`should-track-route.ts`](../../src/utils/tracking/should-track-route.ts) so they cannot drift.

Why the exclusion list rather than just `/admin`: `/admin` renders a full customer-PII dossier (emails, names, subscription state) and `/affiliate` renders payout bank details. Neither has UX-research value, both are the highest-PII screens on the site, and replay quota is billed per pageview. Reusing the existing list keeps one source of truth for "surfaces that must not feed third-party tracking".

**Note on the masking model:** the tag's built-in default already strips the `value` attribute of every `input:not([type=button]):not([type=submit])`, and applies no blanket text masking — so "input values hidden, everything else visible" is the out-of-the-box behaviour, governed further by the project's **Data Masking** setting in the Contentsquare dashboard. `<textarea>` content is **not** covered by that default (it lives in a text node, not `value`); add `data-cs-mask` to any textarea holding sensitive text.

## Poppins now loads weight 800 (2026-07-21)

The `next/font/google` Poppins call in [src/app/layout.tsx](../../src/app/layout.tsx) added `"800"` to its `weight` array (now `400/500/600/700/800/900`) for the prize builder's `font-extrabold` type. No tracking behavior is affected; noted here only because `layout.tsx` is a tracking-domain file. Rationale + the "weight set is not trimmable" rule: [shared-ui/tailwind-conventions.md §10](../shared-ui/tailwind-conventions.md).

## Global `.ta-results` stylesheet import (2026-06-11)

[src/app/layout.tsx](../../src/app/layout.tsx) now imports `./(site)/draw-results/draw-results.css` globally (alongside `globals.css`). Every selector in that file is scoped under `.ta-results`, so the global import is inert on pages that don't use the class — it exists so the portable `WinnersTestimony` "Hear from our winners" section (draws domain) renders correctly on any host page (homepage, promotions, my-account). No tracking behavior is affected; noted here only because `layout.tsx` is a tracking-domain file.

## Viewport meta change (2026-06-09)

The `<meta name="viewport">` in [src/app/layout.tsx](../../src/app/layout.tsx) changed from `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no` to `width=device-width, initial-scale=1, viewport-fit=cover`.

- Dropping `maximum-scale=1.0, user-scalable=no` restores pinch-to-zoom (WCAG 1.4.4 / W3C ACT) and removes an iOS zoom crutch that was already ineffective (iOS ignores it for inputs).
- Adding `viewport-fit=cover` makes `env(safe-area-inset-*)` non-zero, so notch / home-indicator-safe padding now works (those CSS usages were previously inert).
- **Caveat:** `viewport-fit=cover` is global and removes the browser's automatic safe-area inset, so every bottom-fixed element now needs its own `env(safe-area-inset-bottom)` padding.
