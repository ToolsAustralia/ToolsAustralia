# Client State — Rules

## R1. Server-state in TanStack Query, not Zustand

Never mirror API data into Zustand. TanStack Query handles staleness, revalidation, and refetching — Zustand doesn't.

## R2. Query keys via factory

All TanStack Query keys come from `src/lib/queryKeys.ts`. Don't inline strings — keeps invalidation predictable.

## R3. No business logic in stores

Zustand stores hold state and basic mutations. No fetch calls, no domain calculations. Use a service / hook for that.

## R4. Modal priority via the store

Multiple modals shouldn't fight. `useModalPriorityStore` coordinates — modals declare priority on mount, the store picks which one to show.

## R5. Request dedup at the boundary

Use `requestDeduplication.ts` helpers when multiple components might request the same resource simultaneously.

## R6. Hydration safety

Server-rendered components must produce identical markup to client first-paint. State that differs (theme, locale, time-based) must be bootstrapped pre-React.

## R7. Global providers must not poll — polling is page-scoped via options

A hook mounted in a root provider (`UserProvider`, `CartProvider`, anything in `providers.tsx`) runs on
**every page**, so an unconditional `refetchInterval` there polls the whole site. Polling must be
**opt-in per call site**: expose it as an option (`useMyAccountData(userId, { poll })`) defaulting to
off, and let the provider gate it on `usePathname()` (UserProvider polls the my-account payload only on
`/my-account*`). Other callers sharing the query key still receive the polled data without their own
interval. See [gotchas.md](./gotchas.md) for the incident that motivated this.
