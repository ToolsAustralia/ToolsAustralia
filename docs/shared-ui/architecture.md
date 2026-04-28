# Shared UI — Architecture

## Categories

| Folder | Purpose |
|---|---|
| [src/components/ui/](../../src/components/ui/) | Primitives (button, input, etc.) |
| [src/components/cards/](../../src/components/cards/) | Card layouts |
| [src/components/cta/](../../src/components/cta/) | Call-to-action buttons |
| [src/components/layout/](../../src/components/layout/) | Page layout (header, footer, container) |
| [src/components/loading/](../../src/components/loading/) | Loaders, skeletons |
| [src/components/modals/](../../src/components/modals/) | Modal primitives |
| [src/components/sections/](../../src/components/sections/) | Page section primitives |
| [src/components/seo/](../../src/components/seo/) | SEO meta tags, JSON-LD |
| [src/components/system/](../../src/components/system/) | System messages, banners |
| [src/components/filters/](../../src/components/filters/) | Filter primitives |
| [src/components/banners/](../../src/components/banners/) | Site-wide banners (also used by [promo](../promo/)) |

## Utilities

| Folder | Purpose |
|---|---|
| [src/utils/dom/](../../src/utils/dom/) | DOM utilities |
| [src/utils/motion/](../../src/utils/motion/) | Animation helpers |
| [src/utils/url/](../../src/utils/url/) | URL parsing/building |
| [src/utils/common/](../../src/utils/common/) | Generic helpers |
| [src/utils/images/](../../src/utils/images/) | Image-related helpers |
| [src/utils/package-colors/](../../src/utils/package-colors/) | Per-package color config |
| [src/utils/display-name.ts](../../src/utils/display-name.ts) | Generic display-name helper |
| [src/utils/brand-utils.ts](../../src/utils/brand-utils.ts) | Brand-related display helpers |
| [src/utils/prize-brand-colors.ts](../../src/utils/prize-brand-colors.ts) | Prize/brand color resolution |

## Index

[src/components/index.ts](../../src/components/index.ts) — re-exports common primitives for clean imports.

## Principles

- No business logic in shared-ui components
- No API calls — components are presentational
- Take data via props; don't fetch
- Use Tailwind classes for styling
- Honour theme context (light/dark)
