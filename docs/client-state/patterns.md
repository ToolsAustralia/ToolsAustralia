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

### Past-due charge history hooks (`src/hooks/queries/admin/`)

Three hooks back the admin "Charge Past-Due" history UI. All query keys begin with `["admin", "charge-past-due", ...]` so a single prefix invalidation refreshes the whole surface.

| Hook | TanStack primitive | Query key | DTO(s) |
|---|---|---|---|
| `useChargePastDueRuns(filter)` | `useInfiniteQuery` | `["admin", "charge-past-due", "runs", filter]` | `RunsFilter`, `ListedRunDTO`, `RunsResponse` |
| `useChargePastDueRunDetail(runId)` | `useQuery` (enabled when `runId` truthy) | `["admin", "charge-past-due", "run", runId]` | `RunDetailRowDTO`, `RunDetailResponse` |
| `useChargePastDueManualRetries(filter)` | `useInfiniteQuery` | `["admin", "charge-past-due", "manual-retries", filter]` | `ManualRetriesFilter`, `ManualRetryRowDTO`, `ManualRetriesResponse` |

`RunDetailRowDTO` mirrors the server-side `RunDetailRow` row (one per invoice attempt):

```ts
interface RunDetailRowDTO {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  status: IInvoiceChargeLog["status"];
  amount: number;
  attemptedAt: string;
  errorCode?: string;
  declineCode?: string;     // Stripe decline_code, surfaced in the drawer's attempts table
  errorMessage?: string;
}
```

`ManualRetryRowDTO extends RunDetailRowDTO` (adds `adminId`, `adminName`), so it inherits `declineCode` automatically — no separate field on the manual-retries shape.

`ManualRetriesFilter` is the filter object passed to the hook:

```ts
interface ManualRetriesFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: IInvoiceChargeLog["status"];
  userSearch?: string;      // free-text email/id search; debounced 300ms by the UI before being passed in
}
```

Both infinite hooks share a `buildQueryString(filter, offset)` helper that skips entries where the value is `undefined`, `null`, or empty string — so an empty `userSearch` does **not** appear in the URL. Each filter field maps 1:1 to a query param of the same name on the corresponding `/api/admin/charge-past-due/...` endpoint. Because the whole `filter` object is part of the query key, changing any field (including `userSearch`) invalidates the cache and refetches from `offset=0`.

Page size is `50` for both infinite hooks; `getNextPageParam` returns `loaded < total ? loaded : undefined`.

## P3. Modal priority coordination

`useModalPriorityStore` exposes a `register / unregister / current` API. Modals register on mount with their priority; only the highest-priority active modal renders.

## P4. Loading-state coordination

`useLoadingStates` lets multiple components contribute to a global "is anything loading?" state without prop-drilling.

## P5. Prefetching on hover

`usePrefetching` triggers React Router / TanStack Query prefetch on link hover, making navigation feel instant.

## P6. Generic hooks small and focused

`useDebounce`, `useMediaQuery`, `useIsLgUp` — each does ONE thing. Don't bundle multiple concerns into one hook.
