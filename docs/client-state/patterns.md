# Client State — Patterns

## P1. Query key factory

```ts
// queryKeys.ts
export const userKeys = {
  all: ["user"] as const,
  detail: (id) => [...userKeys.all, "detail", id] as const,
};

// invalidate one
queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) });

// invalidate all user queries
queryClient.invalidateQueries({ queryKey: userKeys.all });
```

## P2. Per-domain query hooks

`src/hooks/queries/` has hooks like `useAdminQueries.ts`. Each domain has its set of query/mutation hooks; components consume them.

`useAdminQueries.ts` exports `MembershipByPackageData`, `MembershipByPackageSummary`, etc. — the response shape for `/api/admin/dashboard/membership-by-package`. The summary object carries optional `snapshotMissing?: boolean` (set when an admin selects a past date with no snapshot row, so the route returned live counts) and the response's `meta` carries `{ membershipAsOfMode, asOf }` so the UI can flip the card title and badge between live and snapshot modes.

## P3. Modal priority coordination

`useModalPriorityStore` exposes a `register / unregister / current` API. Modals register on mount with their priority; only the highest-priority active modal renders.

## P4. Loading-state coordination

`useLoadingStates` lets multiple components contribute to a global "is anything loading?" state without prop-drilling.

## P5. Prefetching on hover

`usePrefetching` triggers React Router / TanStack Query prefetch on link hover, making navigation feel instant.

## P6. Generic hooks small and focused

`useDebounce`, `useMediaQuery`, `useIsLgUp` — each does ONE thing. Don't bundle multiple concerns into one hook.
