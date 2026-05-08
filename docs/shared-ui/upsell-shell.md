# Upsell Shell — Modal Building Blocks

Shared organisms for value-reinforcement modals. Extracted in Plan 6 Phase 0 from CancellationUpsellModal sub-components. Used by future modal redesigns (Plan 6 Phases 1-6) and any modal needing the "infographic intensity" pattern.

Companion to:
- [tailwind-conventions.md](./tailwind-conventions.md)
- [ui-primitives.md](./ui-primitives.md) (atomic primitives — Button/Badge/Card/Modal)
- [frontend-architecture-principles.md](./frontend-architecture-principles.md) (atomic design tier system)

## What's here

| Component | What it does |
|---|---|
| `UpsellHero` | Dark gradient hero with eyebrow + Anton headline + subcopy + infographic slot. CVA `tone` for color theme. |
| `InfoGrid` | N-cell info grid (icon + title + desc). CVA `framing` for icon-badge tint (loss/gain/neutral). |
| `UrgencyBanner` | Yellow/info/warning banner with gold-star icon + title + sub. Drives social proof or stake-reinforcement. |
| `TrustBar` | 3-cell trust footer with icon + bold strong + secondary line. |

## Imports

```tsx
import { UpsellHero, InfoGrid, UrgencyBanner, TrustBar } from "@/components/modals/upsell-shell";
import type { InfoGridCell, TrustBarCell } from "@/components/modals/upsell-shell";
```

## Example

```tsx
<UpsellHero
  tone="tier-foreman"
  eyebrow={<><Trophy size={14} /> <span>UPGRADE TO FOREMAN</span></>}
  title={<>Lock in <span style={{ color: "var(--upsell-accent)" }}>40 entries/cycle</span>.</>}
  sub="You'll be charged the upgrade amount today. Billing cycle restarts."
  infographic={<EntriesGrowthChart from={15} to={55} />}
/>

<InfoGrid
  framing="gain"
  title="What you'll get"
  cells={[
    { icon: <Sparkles size={20} />, title: "55 entries/cycle", desc: "Up from 15" },
    { icon: <Percent size={20} />, title: "70% partner offers", desc: "Up from 50%" },
    { icon: <Calendar size={20} />, title: "30 days access", desc: "Up from 14" },
  ]}
/>

<UrgencyBanner
  tone="gold"
  title="Lock in your bonus entries today."
  sub="<X> users upgraded this week."
/>

<TrustBar
  cells={[
    { icon: <ShieldCheck size={12} />, strong: "SSL secure", secondary: "Charged once today" },
    { icon: <Award size={12} />, strong: "Cancel anytime", secondary: "No lock-in" },
    { icon: <Lock size={12} />, strong: "Stripe-secured", secondary: "PCI compliant" },
  ]}
/>
```

## UpsellHero tones

| Tone | Use case | Accent color |
|---|---|---|
| `neutral` | Generic / cancellation (red+gold radial hero) | `#d4af37` (premium-gold) |
| `danger` | Loss-framing | `#ff6b6b` |
| `success` | Gain/upgrade framing | `#4ade80` |
| `tier-tradie` | Tradie tier upgrade | `#5ce0ff` |
| `tier-foreman` | Foreman tier upgrade | `#ffe066` |
| `tier-boss` | Boss tier upgrade | `#ff6b6b` |

The CSS custom property `--upsell-accent` is set automatically on the wrapper. Use `color: var(--upsell-accent)` inside inline title/eyebrow spans for tone-matched text accents.

The cancellation-specific hero (CancellationUpsellModal/Hero.tsx) passes the CSS module gradient classes via `className` to preserve its 3-layer composite gradient. Generic UpsellHero provides simpler Tailwind gradient backgrounds.

## InfoGrid framing

| Framing | Icon badge | Use case |
|---|---|---|
| `loss` | Red tint (`from-[#fff5f5]`) | Cancel flow — "walk away from" |
| `gain` | Green tint (`from-[#f0fdf4]`) | Upgrade flow — "you'll get" |
| `neutral` | Gray tint | Generic info |

## Adoption

CancellationUpsellModal is the FIRST consumer (Plan 6 Phase 0 refactored its sub-components):
- `CancellationUpsellModal/Hero.tsx` → wraps `UpsellHero` with cancellation eyebrow/title/infographic
- `CancellationUpsellModal/Banner.tsx` → thin wrapper over `UrgencyBanner` (tone=gold)
- `CancellationUpsellModal/TrustBar.tsx` → thin wrapper over `TrustBar` (3 fixed cells)
- `CancellationUpsellModal/LoseGrid.tsx` → builds cells array, passes to `InfoGrid` (framing=loss)

Future modals (Plan 6 Phases 1-6) compose these primitives + custom infographics.

`DowngradeCard` and `ActionRow` from CancellationUpsellModal were NOT extracted — they remain cancellation-specific. Future modals can extract their own variants if a generalization opportunity emerges.

## Smoke tests

Run `npm run test:upsell-shell`. 15 combo tests across the 4 primitives (6 UpsellHero tones, 3 InfoGrid framings, 3 UrgencyBanner tones, TrustBar).
