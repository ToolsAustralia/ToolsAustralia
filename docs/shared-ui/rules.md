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
