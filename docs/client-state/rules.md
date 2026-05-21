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
