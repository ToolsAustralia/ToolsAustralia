# Shared UI — Frontend

## Component categories

See [architecture.md](./architecture.md#categories) for the full inventory.

## Cards

### WinnerCard

[src/components/cards/WinnerCard.tsx](../../src/components/cards/WinnerCard.tsx) renders a winner tile (image, name, prize, draw-type badge) and is consumed by the homepage Latest Winners hero, the `/winners` grid, and winner-testimony surfaces.

- The top badge reads **`<date>` MAJOR DRAW WINNER** or **`<date>` MINI DRAW WINNER** — date prefix from [`getWinnerDisplayDate`](../../src/utils/winners.ts) (en-AU short format, e.g. `27 APR 2026`), draw-type suffix from `winner.drawType`. The whole label is uppercased and tracked via Tailwind classes; do not pre-uppercase in the helper.
- The whole card is wrapped in a `<Link>`. Clicking anywhere navigates to:
  - `/promotions/${DEFAULT_PRIZE_SLUG}` for major-draw winners (the default promotions page from [src/config/prizes.ts](../../src/config/prizes.ts)).
  - `/mini-draws` for mini-draw winners (the mini-draws listing page, **not** a per-draw deep link).
- `showDrawLink` (default `true`) controls whether the bottom CTA strip ("Explore this promotion" / "View mini draws") is rendered. The card stays clickable either way; the strip is purely visual reinforcement on the `/winners` grid. The homepage hero passes `showDrawLink={false}` and relies on the card-level click.
- Uses a named Tailwind group (`group/card`) on the outer Link so the inner image's unnamed `group-hover:scale` only fires on image hover, not on bottom-CTA hover.

## Z-index ordering

[src/constants/z-index.ts](../../src/constants/z-index.ts) defines z-index constants. Always reference these — never use raw numbers.

## Display helpers

- `display-name.ts` — formats user display names consistently across the app
- `brand-utils.ts` — brand display formatting
- `prize-brand-colors.ts` — resolves color tokens for prize / brand contexts

## Image helpers

`utils/images/` — image src resolution, lazy-load helpers, srcSet building.

## Motion

`utils/motion/` — Framer Motion presets and helpers.
