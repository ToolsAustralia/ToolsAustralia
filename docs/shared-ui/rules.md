# Shared UI — Rules

## R1. No business logic in shared-ui

Components in `src/components/{ui,cards,cta,layout,...}/` MUST NOT contain feature logic. Take data via props; don't fetch; don't compute domain-specific things. If you find yourself adding feature logic, the component belongs in the feature domain instead.

## R2. No API calls

No `fetch()` or TanStack Query inside shared-ui components. Receive data via props or hooks-passed-in.

## R3. Use z-index constants

Reference `src/constants/z-index.ts` for stacking order. Never hardcode `z-50` etc.

## R4. Honour theme

All components respect the current theme via `dark:` Tailwind classes. Test both light and dark.

## R5. Accessibility

ARIA labels, keyboard navigation, focus rings. Use the primitives in `components/ui/` which already handle this rather than rolling raw `<button>` etc.

## R6. No raw colours

Use Tailwind theme tokens or the brand-color helpers. Don't write `#FF5733` — use `text-brand-red` or similar.

## R7. Never reach for `useSearchParams()` in a section that renders on a prerendered page (2026-07-27)

On `revalidate`-backed marketing routes (`/`, `/promotions/*` — see
[security-csp/rules.md R8](../security-csp/rules.md)), `useSearchParams()` de-opts the client subtree
up to the nearest Suspense boundary to **client-only rendering**, so Next puts the *fallback* in the
static HTML. That silently removes the section from first paint and from the crawled HTML.

- Read the query with `window.location.search` inside an effect (or a client-guarded helper) —
  `PromoBanner`, `MembershipSection`, `PrizeShowcase` and `useMembershipModalDeepLink` all do this.
  The server then renders the default state and the param applies post-mount.
- This applies **transitively** — a custom hook that calls `useSearchParams()` de-opts its caller.
- Never "fix" the resulting build error with `<Suspense fallback={null}>`. If a boundary really is
  unavoidable, its fallback must reserve the section's real height.
- Anything that appears only after hydration must occupy the same box beforehand. Reserve it
  (`min-h-*`, `aspect-*`) — see `ComboHero`'s drawn-date chip and `PromoHero`'s CTA spacer.

See [gotchas.md](./gotchas.md) for the measured CLS case this came from (1.1689 → 0.7970 on a throttled phone profile; the residual is a separate footer/streaming shift documented there).

## R-MODAL: background interaction — modal blocks, popover does not (2026-08-06)

Raised by a real report: the `/discount` filter sheet let the catalogue scroll behind it. An
audit found the same gap across five customer surfaces, and — tellingly — the **admin** copy of
the same mobile filter drawer DID lock while the customer one did not. The misses were
accidental, so the rule needs writing down.

**The test is the surface's own ARIA, not how it looks.**

| | Asserts | Must block scroll | Must trap focus | Examples |
|---|---|---|---|---|
| **Modal** | `aria-modal="true"` and/or a full-viewport scrim | **yes** | **yes** | filter sheet, offer modal, access modal, MembershipModal, every confirm modal, mobile filter drawers |
| **Popover** | `aria-expanded` / `aria-haspopup`, anchored to a trigger | **no** | no (dismiss on outside-click + Escape) | the `/discount` sort dropdown, toasts, tooltips, announcement bar, SupportChatWidget, RewardsFloatingWidget |

A blanket "every overlay locks" rule is wrong — it would freeze the page behind a five-item
dropdown. A blanket "never lock" is the bug we started with.

**`aria-modal="true"` is a promise, not decoration.** It tells assistive tech the rest of the
page is inert. If nothing enforces it, the AT user's virtual cursor is confined to the panel
while their Tab focus is not — they land on controls the screen reader will not describe,
behind an opaque scrim. Declaring it without enforcing it is worse than not declaring it. So:
**set `aria-modal` and `useModalA11y` together, or set neither.**

**Use `src/hooks/useModalBlocking.ts`** — `useScrollLock(active)` + `useModalA11y(active, ref,
onClose)`. Do not hand-roll `document.body.style.overflow`. Two reasons it cannot be done
per-component:
- **Reference counting.** Every hand-rolled copy restores unconditionally, so with two
  overlays open the first to close unlocks the page while the second is still up. Only a
  module-level count knows it is the last one out.
- **iOS.** `overflow: hidden` on `<body>` does not stop touch-scrolling in iOS Safari. The
  hook uses the `position: fixed; top: -scrollY` recipe `ModalContainer` already proved.

Two traps found while fixing this, both worth checking on any new overlay:

1. **Stacking context.** The sheet's `z-index: 10000` was meaningless because it rendered
   inside the sticky filter bar (`sticky z-20`) — the `fixed; z-index: 40` site header painted
   over the scrim and stayed clickable. **Portal modal surfaces to `document.body`** so their
   z-index is measured against the page, not a local context.
2. **Portalling escapes CSS-variable scope.** `/discount`'s entire skin is custom properties
   on `.ta-discount`; portalling made every `--dc-*` undefined and the panel background
   resolved to `rgba(0,0,0,0)` — a transparent sheet. **Re-apply the scope class on the portal
   root.** Theme classes on `<html>` (`.dark`) still apply; page-level wrapper classes do not.

Still outstanding (audited, not yet fixed): `SheetShell` (five dashboard sheets) locks with the
weak body-only mechanism, `ShopContent` and `MiniDrawsContent` mobile filter drawers do not
lock at all, `PastDueTierSwitchModal` declares `aria-modal` without locking, and
`ModalContainer` itself has no focus trap and no ownership token on release.
