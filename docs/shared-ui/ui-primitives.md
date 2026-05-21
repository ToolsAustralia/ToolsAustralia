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
