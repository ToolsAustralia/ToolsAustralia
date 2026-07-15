# Client State domain

How client-state is organized: TanStack Query for server-state, Zustand for cross-cutting client state, React Context for scoped state.

> **`useDashboardSheetStore` (2026-07-02):** tiny Zustand store holding the open dashboard overlay sheet (`"support" | "payment" | "manage" | null`) with `openSheet`/`closeSheet`. The my-account nav opens sheets via it; the layout mounts the sheet host (`SheetShell`). See [dashboard-account/frontend.md](../dashboard-account/frontend.md).

## Index

- [architecture.md](./architecture.md) — TanStack Query + Zustand + Context split
- [frontend.md](./frontend.md) — hooks/queries/, stores/
- [backend.md](./backend.md) — _N/A_
- [api.md](./api.md) — _N/A_
- [rules.md](./rules.md) — server-state in TanStack, no business logic in stores
- [patterns.md](./patterns.md) — query keys, request dedup, modal priority
- [gotchas.md](./gotchas.md) — context vs store, hydration mismatches
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — _TODO_

## Cancellation-flow query hooks — stakes addition (2026-07-15)

`src/hooks/queries/useCancellationFlow.ts`: `StartCancellationFlowResponse` now carries server-derived `streakMonths` (drives the streak-stakes screen), and the new `useStakesActionCancellationFlow` mutation posts `{ action: "stakes", eventId, stakesAction: "kept"|"continued" }` — fire-and-forget analytics, callers never block UI on it.
