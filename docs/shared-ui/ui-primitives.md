# UI Primitives

Atomic-design layer (`src/components/ui/`). Each primitive is a focused, typed, reusable component composed via [Tailwind tokens](./tailwind-conventions.md) + [class-variance-authority](https://cva.style/) + [cn() helper](../../../src/utils/cn.ts).

Companion to [tailwind-conventions.md](./tailwind-conventions.md), [component-decomposition-criteria.md](./component-decomposition-criteria.md), and [frontend-architecture-principles.md](./frontend-architecture-principles.md).

## What's here

| Primitive | Variant axes | Use for |
|---|---|---|
| `Button` | `variant` (primary/outline/ghost/link) × `size` (sm/md/lg) × `tone` (red/tier-tradie/tier-foreman/tier-boss/neutral) | Any button or button-styled link. Supports `loading` and `asChild`. |
| `Badge` | `tone` (red/gold/tier-*/neutral/success/warning/info) × `size` (sm/md) | Status pills, labels, counters |
| `Card` (compound: Card.Header/Body/Footer) | `padding` (none/sm/md/lg) | Content containers, panels |
| `Modal` | re-export of `ModalContainer` (zIndex prop) | Any modal — adopt this path going forward |

## Adoption policy

**No forced migrations.** New code uses these. Existing components migrate opportunistically — when touched for unrelated reasons or during Plan 5 debt cleanup. Do NOT batch-rewrite working components just to use these primitives.

The Phase 5 audit-decomposition codemod will surface candidates that benefit most from primitive migration.

## Imports

```tsx
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
```

## Examples

### Button

```tsx
// Primary CTA — defaults to red gradient
<Button>Continue</Button>

// Outline + tier theming
<Button variant="outline" tone="tier-foreman">Switch to Foreman</Button>

// Loading state — shows Loader2 spinner, disables interaction, sets aria-busy
<Button loading>Saving…</Button>

// asChild — adopts a Next.js Link with button styling
<Button asChild variant="ghost">
  <Link href="/account">Go to account</Link>
</Button>

// Link variant — text-only, no padding/bg
<Button variant="link" tone="neutral">Cancel</Button>
```

### Badge

```tsx
<Badge tone="success">Active</Badge>
<Badge tone="tier-boss" size="sm">Boss</Badge>
<Badge tone="gold">+100 BONUS</Badge>
```

### Card (compound)

```tsx
<Card padding="md">
  <Card.Header>
    <h3 className="text-lg font-bold">Account</h3>
  </Card.Header>
  <Card.Body>
    Plan: Tradie · Renews 26 Dec
  </Card.Body>
  <Card.Footer>
    <Button variant="outline" size="sm">Manage</Button>
  </Card.Footer>
</Card>
```

### Modal

```tsx
import Modal from "@/components/ui/Modal";

<Modal isOpen={open} onClose={close} presentation="dialog">
  {/* … */}
</Modal>

// For micro-stacks above other modals (rare)
<Modal isOpen={open} onClose={close} zIndex={80}>
  {/* … */}
</Modal>

// Near-fullscreen on mobile + tablet, centered dialog on desktop
<Modal isOpen={open} onClose={close} size="md" mobileFullBleed>
  {/* … */}
</Modal>
```

**`mobileFullBleed`** (opt-in, default `false`): below the `lg` breakpoint the
panel is full viewport width, bottom-flush, with only a ~5% gap at the top
(`h-[95dvh]`); at `lg`+ it falls back to the normal centered dialog at `size`.
The panel className is a raw template literal (not `cn`/`tailwind-merge`), so
this is expressed via `lg:`-prefixed classes that don't conflict with the base
mobile classes — a `className` override could NOT achieve this reliably. Default
`false` leaves every existing `ModalContainer`/`Modal` consumer byte-identical.
Used by `CancellationFlowModal` (with `presentation="sheet"` < lg for the
slide-up animation).

## Design principles

- **Each primitive accepts `className` and resolves with `cn()`** so user classes win via `tailwind-merge`.
- **Variants encoded via `class-variance-authority`** — typed, no string-template gymnastics, invalid combinations fail at compile time.
- **`Button` uses `@radix-ui/react-slot` for `asChild`** — lets a `<Link>` or `<a>` adopt button styling without nesting issues.
- **All tier colors flow from `brand-tier-{tradie,foreman,boss}` tokens** added in Plan 1.
- **Forward refs** — both `Button` and `Badge` and `Card` use `React.forwardRef` for parent ref access.
- **Default props** sensible — `Button` defaults to `primary/md/red`, `Badge` to `neutral/md`, `Card` to `padding=md`.

## Smoke tests

Run `npm run test:ui-primitives` — 87 combo tests across the 3 variant-bearing primitives:
- **Button** — 60 (variant × size × tone) + 3 (loading, disabled, asChild) = 63
- **Badge** — 18 (tone × size) + 1 (className override) = 19
- **Card** — 4 (padding) + 1 (compound) = 5

Tests use `react-dom/server.renderToString` and don't require any providers (primitives are pure presentation).

## When to use vs. existing components

- **`Button` vs. `MetallicButton`** — `MetallicButton` is a domain-specific brand asset (specific metallic gradient + texture). Stays. Use `Button` for everything else.
- **`Button` vs. `modals/ui/Button`** — the modal-internal Button is older and uses string-keyed object lookups. Future modals should use the new `Button`. Old modal Button stays for now.
- **`Badge` vs. `BestValueBadge` / `MembershipBadge` / `PromoBadge`** — domain-specific badges with their own visual flourishes (corner ribbons, hexagonal shapes). Stay. Use `Badge` for new generic status pills.
- **`Modal` vs. direct `ModalContainer` import** — both work; new code prefers `@/components/ui/Modal` for atomic-design discoverability.

## See also

- [tailwind-conventions.md](./tailwind-conventions.md) — tokens, no-arbitrary rule, `cn()`/CVA usage
- [component-decomposition-criteria.md](./component-decomposition-criteria.md) — when to split a single file
- [frontend-architecture-principles.md](./frontend-architecture-principles.md) — atomic design tier system, props discipline, composition patterns

---

## Admin overview UI kit (`src/components/admin/ui/`)

Presentational-only primitives for the admin Overview page redesign. No hooks or API calls — props in, JSX out. Consumed by `src/app/admin/component/overview/sections/`.

| Primitive | Exports | Purpose |
|---|---|---|
| `Card.tsx` | `Card`, `SectionTitle` | Container card (rounded-2xl, border, bg) and the title header block with optional icon, subtitle, and right slot |
| `Badge.tsx` | `Badge`, `TrendPill` | Status badge (5 tones: neutral/success/danger/warning/info) and a trend percentage pill (green/red, `invert` prop for cancellations) |
| `MetricCard.tsx` | `MetricCard`, `TONES`, `Tone` | KPI tile button — icon chip, value, label, sub-text, `TrendPill`, optional `active` ring; 8 colour tones |
| `Popover.tsx` | `Popover` | Portal-to-body anchored popover (re-anchors on scroll/resize, click-outside to close, fade-up animation) |
| `Sparkline.tsx` | `Sparkline` | Inline SVG area sparkline with gradient fill and terminal dot |
| `BarList.tsx` | `BarList`, `BarItem` | Horizontal proportional bar list with optional count column |
| `Donut.tsx` | `Donut`, `DonutSegment` | SVG donut chart with hover-swap center label, segment highlight/dim |
| `RevenueAreaChart.tsx` | `RevenueAreaChart` | Full-width SVG area chart with cubic-spline smoothing, crosshair hover tooltip, Y-axis labels, X-axis tick row |
| `DataTable.tsx` | `DataTable`, `Column` | Sortable table with custom cell renderer; click-to-sort header chevrons |
| `StatusDot.tsx` | `StatusDot` | Coloured dot (success/warning/error/info) with white ring for timeline/feed use |
| `index.ts` | barrel | Re-exports all of the above |

### New Tailwind tokens added for the admin UI kit

- **`font-display`** (`tailwind.config.ts` `theme.extend.fontFamily`) — Poppins alias used for KPI values and chart labels: `font-display font-extrabold`
- **`text-2xs`** (`tailwind.config.ts` `theme.extend.fontSize`) — `0.6875rem / 0.95rem` line-height; used in badge labels, uppercase section headers, and table headers

### New global CSS utilities (`src/app/globals.css`)

- **`.num`** — `font-variant-numeric: tabular-nums`; apply to all numeric strings in the kit
- **`.lift`** / **`.dark .lift`** — subtle bottom-weighted box-shadow for cards on hover/active
- **`.lift-lg`** / **`.dark .lift-lg`** — larger lift variant (used by `Popover`)
- **`@keyframes adminFadeUp`** / **`.fade-up`** — 0.3s translate-Y(6px)→0 entrance animation (used by `Popover`)

### Membership-redesign primitives (2026-06)

- **`Seg`** ([`src/components/ui/Seg.tsx`](../../src/components/ui/Seg.tsx)) — generic light-first segmented toggle, decoupled from the promo theme (extracted from `WinnerFilterToggle`). Props: `value`, `onChange`, `options: SegOption<T>[]`, `accentHex` (selected-pill colour, default `#ee0000`). Used by the `/membership` tier toggle, entries-stack tier picker, and prize chooser.
- **`AccessRing`** ([`src/components/ui/AccessRing.tsx`](../../src/components/ui/AccessRing.tsx)) — single-arc SVG progress ring (one track + one arc via `strokeDasharray`/`strokeDashoffset`, modeled on admin `Donut`), with centered children. Props: `percent`, `size`, `stroke`, `color`, `trackColor`. Used for partner-catalogue access % across the membership tier cards and portal phone.
- **`useTilt`** ([`src/hooks/useTilt.ts`](../../src/hooks/useTilt.ts)) — pointer-move 3D tilt ref; no-op under `prefers-reduced-motion`. Used on tier cards, winner cards, and the portal phone.
- **`Carousel3D<T>`** ([`src/components/ui/Carousel3D.tsx`](../../src/components/ui/Carousel3D.tsx)) — **reusable, content-agnostic 3D "turntable" carousel** (built via a judge-panel pass, 2026-06-30; framer-motion, no new deps). Items ride a rotating elliptical ring in real `perspective`; the focused item sits front-centre and the rest rotate away (`rotateY`), recede in Z, dim, shrink and melt into depth-of-field `blur`, with a grounding contact-shadow floor and gentle whole-stage pointer parallax. **Engine (the perf win):** one shared `rotation` MotionValue (continuous "item units") is the single source of truth; each card binds transform/opacity/filter/zIndex via per-card `useTransform`, so spinning updates only compositor styles — React does **not** re-render per frame. A depth-**bucketed** `useMotionValueEvent` refreshes the live state handed to `renderItem` (so depth-keyed card lighting tracks the ring without a per-frame tick). **Drag:** a hand-rolled pointer drag writes rotation 1:1 with the finger + a 90 ms velocity buffer; on release it projects momentum a short window forward and `animate()`s a velocity-seeded spring **straight to the nearest item in an absolute, unwrapped frame** (`settleTo`), so the throw's direction is preserved at **any** swipe speed. This deliberately bypasses the `[0,n)` index wrap used by discrete nav: for a fast swipe past the half-ring, that wrap re-derives a *shortest path pointing opposite the velocity*, so the spring would lurch forward then **snap back to the previous card** — the classic "fast swipe rewinds a card" bug (slow swipes never tripped it because their projection stays inside the half-ring). Discrete nav (arrows/dots/keyboard, controlled-index jumps) still snaps the **SHORT way** round via `settle(index)`, where "nearest" *is* the intent. Owns keyboard (←/→/Home/End), `aria-live` + `role`/`roledescription`, autoplay (a **self-rescheduling timeout keyed on the active index** — the countdown restarts after *every* settle, auto or manual, so a tap/drag never collides with a pending auto-advance; pauses on hover/focus-within/drag, and the fire callback also hard-guards on the live `dragging` ref so it never advances mid-gesture even in the gap before React processes the pause), a slightly over-damped settle spring (smooth glide, minimal overshoot), and a `prefers-reduced-motion` calm fallback (drag + instant snaps, no spin/blur/parallax/autoplay). Content-agnostic: pass `items` + `renderItem(state)` (`state` = `{ isActive, depth, offset, relIndex, … }` so a card can light itself by its position) + tuning (`radiusX`/`radiusXMobile`/`radiusY`/`depthZ`/`rotate`/`maxBlur`/`intervalMs`/`cardWidth`/`stageHeight`, controlled or uncontrolled, `renderControls`). Works for any item count ≥ 3, any card content.
  - **`layout` prop** — four placement models, all reading the same continuous `rotation` MotionValue (so physics/drag/keyboard/a11y are identical): **`"ring"`** (default) the full 360° turntable above (rear item hides behind the front with few items); **`"coverflow"`** a horizontal filmstrip — focus front-and-centre, others stepping out to the side so **all** items stay visible (`radiusX` = per-step gap, `depthZ` = per-step recession); **`"cylinder"`** cards as flat **facets folding back edge-to-edge** into a faceted 3D "wall" (`rotate` = fold angle/card in deg, `radiusX` = radius); **`"wheel"`** a ring **tilted back toward the viewer** (look down onto a round table of cards) — focus front-near-bottom, the rest curve UP and back so the rear cards show **above** the focus instead of hiding behind it (`radiusX`/`radiusY` = ellipse half-axes, `depthZ` = near↔far). Pick by content: coverflow = "see them all flat"; cylinder = dramatic curved wall; wheel = circular 3D where every item (incl. the back) is visible.
  - **Selection / commit model** (`onCommit` + `commitOnDrag`) — for using the ring as a **selector** (the focused item drives a side effect), not just decoration. `onCommit(index)` fires only when the user **deliberately lands** on a card — a tap, arrow, dot, or keyboard nav (the explicit-nav `settle` path), plus a drag-release **only when `commitOnDrag` is set**. It is distinct from `onActiveIndexChange`, which tracks the live front-most index as the ring spins and also fires mid-autoplay (autoplay auto-advances WITHOUT committing). This single `commitOnDrag` knob expresses the two surface behaviours: **live** (`commitOnDrag` true — a free fling also picks, right when committing is cheap/in-place) vs **deferred** (`commitOnDrag` false, default — drag only browses and selection commits on an explicit tap, right when committing **navigates**). When `onCommit` is set the focused card is tappable too (so a browsed pick can be confirmed by tapping it). **Gotcha — tap-to-select depends on pointer capture being DEFERRED to the first real drag move (not taken on pointer-down):** capturing on pointer-down retargets the `mouseup`/`click` to the stage, so a card's `onClick` never fires and tap-to-select silently breaks on the `deferred` surface (where *only* a tap commits — drag doesn't). A pure click never crosses the `>6px` drag threshold, so it never captures and its `click` lands on the card; a real drag captures the moment it starts moving (so the gesture survives the pointer leaving the stage).
  - **Consumer — `PowerToolsetCarousel`** ([`src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx`](../../src/components/sections/promo/prize-selection/PowerToolsetCarousel.tsx)) rides the `layout="wheel"` tilted ring (the "monthly rhythm" look) as the "Pick your Power Toolset" prize selector (≥2 toolsets; the all-toolsets grid for the deactivated/cash state and the single-toolset hero stay bespoke). Its `selectionMode` prop maps to `commitOnDrag`: **`"live"`** on home / my-account (`onSelect` swaps the prize in place — **no page scroll**; the wheel just rotates the picked brand to the front) and **`"deferred"`** on evergreen `/promotions/*` (`onSelect` **navigates**, so a spin never fires a route change — the promotions layout ([`PromotionsLayoutShell`](../../src/components/promo/PromotionsLayoutShell.tsx)) scrolls to the **top** on every promo pathname change, so the visitor lands on the new prize hero). Every focused brand composite renders in one uniform `aspect-[5/4]` `object-contain object-center` frame (all brands centred, no per-brand nudges), with: a gentle idle **bob** on the focused card; a **bright per-brand glow** (`TOOLSET_GLOW_HEX` — a vivid local override because the shared `getBrandGlowColor` uses each brand's `primaryDark`, too dim for Makita's/HiKOKI's dark greens); and a **focused-only description badge** whose label is split into two balanced lines up front (`splitTwoLines`) and hugged by `w-max`, so it's always exactly two rows, full text, no truncation, no dead space (pure CSS can't hug a *wrapped* block — `w-fit` measures one line, and `w-fit`+`text-balance` collapse to 3 short rows). Side cards are pushed well back (`minScale=0.5`, `minOpacity=0.32`, `maxBlur=2.4`) so the focus stands out. Tuned `autoRotate={false}`, `radiusX=232`, `radiusY=96`, `depthZ=140`, `rotate=20`.

The `/membership` marketing sections live in [`src/components/sections/membership/`](../../src/components/sections/membership/) (**Hero** (the fanned glossy tier-deck cards are interactive `<button>`s — each calls `cta.onSelect(plan)` into the same membership flow as the tier cards, with a hover lift + tier-colour bloom + `hover:z-30` bring-to-front), TrustStrip, BrandShowcase, HowItWorks, TierChooser, **OneTimePacks**, EntriesStack, ClimbChart, PartnerPortalPhone, **DrawCycle** (consumes `Carousel3D` in **`layout="wheel"`** — the 4 stages sit on a ring tilted toward the viewer so all four read (Renewal back-top, focus front-near, sides left/right); `hideControls` (the auto-spin + drag make the dot/arrow bar redundant — the section is just the carousel + heading); the card lights itself by `depth`, "Live draw" glows brand-red dead-front; tuned `radiusX=218`, `radiusY=98`, `depthZ=120`, `intervalMs=4200`), PrizeChooser, WinnersWall, **FinalCta** (bleeds its dark bg down into the `.site-main-content` bottom padding — negative margin + matching padding — so there's no light gray gap between it and the footer/newsletter; scoped to this section, other pages keep the global gap)). **PartnerPortalPhone** shows the active tier's package icon (`getPackageIcon(subscriptionPlanId)`) top-right of the "My Rewards / {tier} member" header. Page composition + the CTA hook are documented under [docs/subscription/frontend.md](../subscription/frontend.md). Glossy card fills come from [`src/utils/membership/tier-visuals.ts`](../../src/utils/membership/tier-visuals.ts) (`glossGrad`/`inkOn`/`shade`, ported from the prototype); the big tier-entry number bounces in via the `entries-bounce` keyframe in `globals.css`. The promo-multiplier badge art (`/images/badge/X{n}.webp`) is resolved by `multiplierBadgeSrc(n)` in the same util (known set 2/3/5/10/12/15/20, else a `{n}×` text-pill fallback).

- **`MembershipOneTimePacks`** ([`src/components/sections/membership/MembershipOneTimePacks.tsx`](../../src/components/sections/membership/MembershipOneTimePacks.tsx)) — the "Not subscribing?" one-time pack grid, **collapsed by default** under the subscription tiers. Smooth reveal is a CSS-only `grid-rows-[0fr→1fr]` + opacity transition; the inner wrapper carries `overflow-hidden` only while collapsing and flips to `overflow-visible` on `onTransitionEnd` once open, so each pack card's hover-lift and glow shadow aren't clipped at rest. Each pack card shows the multiplier badge top-right when its `one-time-packages` promo is active — **absolutely positioned**, so its size is independent of the card layout (same pattern as the tier-card badge). The `PartnerPortalPhone` "Live partner deals" header surfaces a **"View more"** affordance (shown only when more deals exist than the visible three) rather than a raw `+N more` count.
  - **The collapsed toggle is a premium "drawer handle"** (designed via a judge-panel pass, 2026-06-30): a red→gold hairline-topped card whose right side previews the catalogue as a row of overlapping **mini glossy pack-chips** built from the *same* `glossGrad(accentHex)`/`inkOn` recipe (and `/vip/i` black-gold treatment) as the real `PackCard`s, capped at 4 + a gold `+N` chip (`mask-image` fade at the edge), the live `multiplierBadgeSrc` boost (art, or gold `{n}×` text-pill fallback), and the tier-card's near-black glossy chevron disc that rotates on open. Everything surfaced is derived (chip set, `from $` min-price woven into the sub-line, live multiplier) — no hardcoded counts/prices. So the closed handle reads as "the same family of glossy cards, peeking", keeping the page consistent in polish. Named-group hover (`group/handle`) + `focus-visible` ring; sub-line/badge are `sm:`-only so the narrowest phones keep eyebrow + chip peek + chevron without crowding. The chip strip is `overflow-hidden` with the left-fade `mask-image` on the strip wrapper itself (not the inner chip row), so on narrow phones the fixed-width chips clip+fade at the strip's own left edge and can never bleed over the "Not subscribing?" eyebrow — the peek degrades to a faded sliver + `+N` rather than overlapping the text.
