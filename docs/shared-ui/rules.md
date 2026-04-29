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
