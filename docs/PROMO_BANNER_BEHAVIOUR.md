# Promo Banner Behaviour

This document describes how the **PromoBanner** component behaves: left image, right countdown, and corner multiplier badge. All times use **Australia/Sydney (AEST/AEDT)**.

---

## Banner layout

| Area | Description |
|------|-------------|
| **Left** | Single image: variant URL → scheduled admin URL → static files under `public/images/promoBanner` (brand + state + multiplier tier, with fallbacks). See `resolvePromoBannerLeftVisual` and `public/images/promoBanner/README.md`. |
| **Right** | Countdown tiles, static urgency label, gap countdown, or `NEXT DRAW` when no promo — from `resolveCountdownDisplay`. |
| **Corner** | Optional `X{m}` badge image (`/images/badge/X{m}.webp`) when multiplier is 2, 3, 5, or 10. |

**Draw tomorrow** is not a special case: there is no separate badge or right-side “DRAWN TOMORROW” block; behaviour follows the same rules as other non-today draw days (scheduled / midnight / static urgency per variant).

---

## Definitions

| Term | Meaning |
|------|--------|
| **Scheduled promo** | Promo with `source: "scheduled"` and `scheduledEndDate` from `useEffectiveForBanner` |
| **Variant override** | `variantConfig.banner` — `leftImageUrl`, `multiplier`, `showCountdown`, `countdownMode`, `countdownLabel` |
| **Scheduled banner asset** | Mongo `PromoBannerText` (schedule rules + `imageUrl`), exposed via `/api/admin/promo/banner-text/active` |
| **Freeze time** | `currentDraw.freezeEntriesAt` |
| **Effective promo** | Resolved per tab from `useEffectiveForBanner` |

---

## Left image resolution

Order (`resolve-promo-banner-left-visual.ts`):

1. **`variantConfig.banner.leftImageUrl`** if set (A/B test).
2. **Active scheduled row `imageUrl`** if set.
3. **Static** under `/images/promoBanner/{Brand}/`:
   - **Brand folder** (`Dewalt`, `Makita`, `Milwaukee`, `Ryobi`) comes from promo theme context: `usePromoThemeStore` **`toolsetSlug`** if it is a toolset landing slug, else the first segment of **`slug`** when that segment is a toolset slug, else **`Milwaukee`**.
   - Draw **today** → `{Brand}/DrawnTonight/drawn-tonight-{2\|3\|5\|10}x.webp`
   - Scheduled promo **`>= 24h`** to end → `{Brand}/LastChance/last-chance-{m}x.webp`
   - Scheduled promo **`< 24h`** to end → `{Brand}/EndsTonight/ends-tonight-{m}x.webp`
   - Otherwise → **LastChance** (same filename pattern under `{Brand}/`)

**Fallback order** (implemented in `buildStaticPromoBannerPaths`; `PromoBanner` advances the `<img src>` on `onError`):

1. Requested brand path  
2. **Milwaukee** path (if the requested brand was not already Milwaukee)  
3. **Legacy** generic path without a brand segment (e.g. `/images/promoBanner/DrawnTonight/...`) if you keep or restore flat folders

Unknown or null multiplier uses **`10`** in the filename so a single `10x` asset keeps working until more tiers exist.

---

## Gold badge text (legacy pipeline)

The visible left column is **image-only**. A small internal **badgeText** `useMemo` may still drive analytics or future use; priority is roughly: gap → no-promo → **DRAWN TONIGHT** if draw is today → variant `badgeText` removed in favour of `leftImageUrl` → scheduled promo defaults (**LAST CHANCE** / **ENDS TONIGHT**) → `resolveBadgeText` fallbacks (10×, alternating default). *Scheduled text strings are replaced by scheduled `imageUrl` for the left column.*

---

## Right side (countdown)

Driven by `resolveCountdownDisplay` in `countdown-mode.ts`:

- **`hidden`** — `showCountdown` false
- **`draw_tonight`** — draw calendar date is **today**; tiles count down to freeze time
- **`static_urgency`** — label + optional clock icon
- **`scheduled_end`** — countdown to `scheduledEndDate`
- **`midnight`** — 24h-style countdown to next midnight AEST (or related behaviour per mode)

There is **no** `draw_tomorrow` display type; if the draw is tomorrow, resolution continues with scheduled/static/midnight rules like any other non-today day.

---

## Variant config & split tests

- **`leftImageUrl`** — optional Cloudinary (or any HTTPS) URL for the left image for users in this variant.
- **`multiplier`**, **`showCountdown`**, **`countdownMode`**, **`countdownLabel`** — unchanged for right side.
- **`badgeText`** — removed from the TypeScript config shape; old documents may still contain it in Mongo but the admin editor no longer sets it.

---

## Related files

- `src/components/sections/promo/PromoBanner.tsx`
- `src/utils/promo-banner/resolve-promo-banner-left-visual.ts`
- `src/utils/promo-banner/resolve-promo-banner-asset-brand.ts`
- `src/utils/promo-banner/build-static-promo-banner-paths.ts`
- `src/utils/promo-banner/countdown-mode.ts`
- `src/utils/promo-banner/resolve-badge-text.ts`
- `src/utils/promo-banner/default-text-manager.ts`
- `src/constants/promo-banner.ts`
- `src/models/PromoBannerText.ts`
- `src/models/ab-testing/Variant.ts`
