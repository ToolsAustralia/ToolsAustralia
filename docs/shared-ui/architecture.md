# Shared UI — Architecture

## Categories

| Folder | Purpose |
|---|---|
| [src/components/ui/](../../src/components/ui/) | Primitives (button, input, etc.) |
| [src/components/cards/](../../src/components/cards/) | Card layouts |
| [src/components/cta/](../../src/components/cta/) | Call-to-action buttons |
| [src/components/layout/](../../src/components/layout/) | Page layout (header, footer, container) |
| [src/components/loading/](../../src/components/loading/) | Loaders, skeletons |
| [src/components/modals/](../../src/components/modals/) | Modal primitives + feature modals (see "Modal folder layout") |
| [src/components/sections/](../../src/components/sections/) | Page section primitives |
| [src/components/seo/](../../src/components/seo/) | SEO meta tags, JSON-LD |
| [src/components/system/](../../src/components/system/) | System messages, banners |
| [src/components/filters/](../../src/components/filters/) | Filter primitives |
| [src/components/banners/](../../src/components/banners/) | Site-wide banners (also used by [promo](../promo/)) |

## Modal folder layout

`src/components/modals/` holds three different kinds of thing. Know which you are adding before you add it.

| Location | What belongs there |
|---|---|
| [modals/ui/](../../src/components/modals/ui/) | **Shared primitives** — `ModalContainer`, `ModalHeader`, `ModalContent`, `ModalFooter`, `Button`, `Input`, `Select`, `Textarea`, `Checkbox`, `ImageUpload`, `DateTimePicker`, `FormSection`. Nothing feature-specific. |
| `modals/<Feature>/` | A **feature group** — every modal reachable from one product surface, behind an `index.ts` barrel. Currently: [modals/draws/](../../src/components/modals/draws/). |
| `modals/*.tsx`, `modals/<Name>/` | Everything else: a single modal, flat if one file, in its own folder if it decomposes. |

### Feature groups

A feature group exists when a set of modals is only ever reached from one surface and is large enough that finding them in the flat list is the hard part. `modals/` is 50+ top-level entries, so this matters.

Rules for one:

- **Name the folder after the domain it serves**, using the term already in the [Domain Manifest](../../CLAUDE.md) — `draws/`, not a synonym. One concept, one name.
- **Export through `index.ts`.** Consumers import `@/components/modals/draws`, not a deep path.
- **Do not pull shared primitives in.** `modals/ui/*` stays where it is; a feature group importing `../ui` is correct and expected.
- **Do not pull in a modal with callers outside the feature.** `ConfirmationModal` stays at `modals/` — 20+ non-draws callers.
- If you add a modal to a group, add it to the barrel in the same change, or it is invisible to everyone reading the barrel to find out what exists.

`modals/draws/` holds the eight modals for the four admin draws pages. Two intentional non-merges live in it: `AdminMajorDrawModal` (create) and `MajorDrawEditModal` (edit) are separate components because create owns the scheduled-months restriction and the activation/freeze auto-derivation while edit owns `configurationLocked` gating — zero shared behaviour, so a `mode` prop would fork most of the component. They share **field sections**, not a mode flag. The barrel comment records this so it does not get "simplified" back.

## Utilities

| Folder | Purpose |
|---|---|
| [src/utils/dom/](../../src/utils/dom/) | DOM utilities (incl. `listenerHelpers.ts` — passive/RAF-throttled scroll/resize) |
| [src/utils/motion/](../../src/utils/motion/) | Animation helpers |
| [src/utils/url/](../../src/utils/url/) | URL parsing/building |
| [src/utils/common/](../../src/utils/common/) | Generic helpers |
| [src/utils/images/](../../src/utils/images/) | Image-related helpers |
| [src/utils/package-colors/](../../src/utils/package-colors/) | Per-package color config |
| [src/utils/display-name.ts](../../src/utils/display-name.ts) | Generic display-name helper |
| [src/utils/brand-utils.ts](../../src/utils/brand-utils.ts) | Brand-related display helpers |
| [src/utils/prize-brand-colors.ts](../../src/utils/prize-brand-colors.ts) | Prize/brand color resolution |
| [src/lib/device/](../../src/lib/device/) | Device-tier resolution (`deviceTier.ts` — `mobile`/`tablet`/`desktop` + Save-Data) |

## Cross-cutting hooks

| Hook | Purpose |
|---|---|
| [`useDeviceProfile`](../../src/hooks/useDeviceProfile.ts) | Reactive `{ tier, viewportTier, flags }` for JS-side tier branching |
| [`useInViewportAnimation`](../../src/hooks/useInViewportAnimation.ts) | IntersectionObserver gate to pause offscreen animations |
| [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) | Self-contained `setInterval` so parents don't re-render on every tick |

See [patterns.md](./patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for usage and the device-tier token system.

### `src/utils/common/timezone.ts` — expiry DISPLAY helpers (2026-08, trimmed 2026-08-26)

Two helpers for rendering a stored deadline in Australia/Sydney time. This file no longer **computes** any
expiry: `endOfDayAESTAfterDays` was deleted on 2026-08-26 along with its test
(`src/utils/common/__tests__/expiry-window.test.ts`). Bonus-code windows are now an exact hours offset
computed by `expiryAfterHours` in
[src/utils/redeemables/bonus-code-policy.ts](../../src/utils/redeemables/bonus-code-policy.ts) — plain
epoch-millisecond arithmetic with no calendar involved, so no timezone helper is needed to produce the instant.

| Function | Purpose |
|---|---|
| `getAESTAbbreviation(utcDate: Date): string` | `"AEST"` or `"AEDT"` for a given instant. **Looks orphaned; is not** — its only caller is `formatExpiryLabelAEST` one line below, which has four production callers. Do not delete it alongside a neighbour. |
| `formatExpiryLabelAEST(utcDate: Date): string` | The one canonical customer-facing expiry string (e.g. `"Monday 5 October 2026, 3:00PM AEDT"`, the value `test:bonus-code-expiry` pins for a 72-hour window opened 2 Oct 2026) — never hardcode the timezone abbreviation, and never use `formatDateForKlaviyo`, which has no `timeZone` option. Under the exact-hours model the time of day is now whatever the 72-hour offset lands on, not always `11:59PM`. **Its JSDoc was corrected on 2026-08-26:** it used to say the Klaviyo email renders this value. It does not — the label reaches the `Bonus Code Issued` metric, which the three discount emails cannot read (a flow email renders against its own trigger metric). The three real consumers are that metric, the checkout `campaignCodeExpiredMessage` refusal, and `RedeemableWalletItem.expiresAtLabel` — whose two renderers are both currently unreachable. |

`createAESTDateAsUTC` in the same file is unrelated to expiry, has roughly a hundred callers including the
anchor-day-24 billing logic, and is untouched.

## Embla carousel wrappers

[src/components/ui/embla/](../../src/components/ui/embla/) — `EmblaCarousel`, `EmblaThumbsGallery`, `EmblaCarouselButton`. Wrap `embla-carousel-react` with the touch-action and reinit-contract conventions documented in [patterns.md](./patterns.md#embla-wrappers).

## Index

[src/components/index.ts](../../src/components/index.ts) — re-exports common primitives for clean imports. (2026-07: the dead never-mounted `FacebookPixel.tsx` + `TikTokPixel.tsx` components were deleted; their still-used pixel helper functions moved to [`src/utils/tracking/legacy-pixel-helpers.ts`](../../src/utils/tracking/legacy-pixel-helpers.ts), so the barrel no longer re-exports either file.)

## Principles

- No business logic in shared-ui components
- No API calls — components are presentational
- Take data via props; don't fetch
- Use Tailwind classes for styling
- Honour theme context (light/dark)

## 2026-07-31 — Portal hand-off components + `taPt*` CSS

Three components landed under `src/components/sections/rewards/` (`PortalHandoff`, `PortalTransit`, `PortalConsent`) for the partner-portal SSO hand-off, plus a `.ta-pt-*` block in [globals.css](../../src/app/globals.css).

Two conventions worth copying:

- **Reuse loader keyframes, don't redeclare them.** `PortalTransit`'s medallion drives the *existing* `DashboardLoader` keyframes (`taSeat` / `taBoltStep` / `taWrench` / `taSpark` / `taWarm` / `taSpin`); only genuinely new motion is declared, namespaced `taPt*`. Two loaders sharing a rig must not be able to drift in cadence.
- **Overlays return `null` when idle.** `usePortalHandoff()` hands back an `overlay` node that is `null` until first use and `createPortal`s to `<body>` — so an unclicked page pays nothing, and a call site's placement doesn't affect layout. Same spirit as the `LazyMembershipModal` gate-on-first-open rule.

Full behaviour: [docs/partner/frontend.md](../partner/frontend.md).
