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

### Activity-log infinite feed (`useActivityLogInfinite`, `src/hooks/queries/useAdminQueries.ts`)

`useActivityLogInfinite(limit = 25, typeFilter?, searchTerm?)` backs the admin Overview "Recent activity" feed. Unlike the charge-past-due infinite hooks (which use `offset` paging), this one uses **keyset (cursor) pagination**: `initialPageParam` is `null`, `pageParam` is an opaque cursor string sent as the `cursor` query param (omitted on the first page), and `getNextPageParam` returns `lastPage.pagination.nextCursor ?? undefined`. Page shape is `{ activities, pagination: { limit, total, nextCursor: string | null, hasMore: boolean } }`.

**Why keyset, not offset:** the activity log is a live, top-growing feed. Offset paging over it caused page N+1 to re-include rows already shown on page N (new top-insertions shifted the window), so the infinite scroll rendered duplicate rows. A cursor anchors each page to a stable row, keeping the window stable against new top-insertions. Prefer keyset over offset for any live, top-inserting infinite feed.

### Cancellation-flow analytics hooks (`src/hooks/queries/admin/`)

| Hook | TanStack primitive | Query key | DTO(s) |
|---|---|---|---|
| `useCancellationFlowAnalytics(filter)` | `useQuery` | `["admin", "cancellation-flow-analytics", filter]` (inline key) | `CancellationFlowAnalyticsFilter`, `CancellationFlowSummary` |
| `useCancellationFlowUsersByReason(filter, options?)` | `useQuery` (enabled when `filter !== null` and `options.enabled !== false`) | `["admin", "cancellation-flow-analytics", "users-by-reason", filter]` | `CancellationFlowUsersByReasonFilter`, `ReasonUsersResult` |

Read-only admin cancellation-flow analytics. Both hooks live in [`src/hooks/queries/admin/useCancellationFlowAnalytics.ts`](../../src/hooks/queries/admin/useCancellationFlowAnalytics.ts) and re-export `CancellationFlowSummary` and `ReasonUsersResult` from `@/services/admin/cancellationFlowAnalytics`.

- `useCancellationFlowAnalytics`: `buildQueryString(filter)` skips absent `startDate`/`endDate`; both map 1:1 to query params on `/api/admin/cancellation-flow-analytics`. The whole `filter` is part of the query key, so changing the range refetches.
- `useCancellationFlowUsersByReason`: drill-down hook for the "Reason × outcome" table rows (consumed by `CancellationReasonUsersModal`). Filter is `{ reason: CancellationReason, outcome?: "in_progress"|"saved"|"cancelled", startDate?, endDate?, page?, limit? }`; all fields except `reason` are skipped from the URL when absent. Pass `filter = null` (or `options.enabled = false`) to keep the query idle until a row is selected. Returns the same `{ data, isLoading, isError }` shape as the parent hook. Backed by `/api/admin/cancellation-flow-analytics/users-by-reason`.

### Chatbot cost & settings hooks (`src/hooks/queries/admin/`)

| Hook | TanStack primitive | Query key / target | DTO(s) |
|---|---|---|---|
| `useChatbotCostAnalytics(days)` | `useQuery` | key `["admin", "chatbot-cost", days]` → `GET /api/admin/chatbot-cost?days=` | `ChatbotCostData` (from `@/services/admin/chatbotCostAnalytics`) |
| `useSetChatProvider()` | `useMutation` | `PATCH /api/admin/chatbot-settings` | `ChatProvider` (`"anthropic" \| "google"`) |

Both back the **Chatbot Cost & Usage** admin panel ([`ChatbotCostManagement.tsx`](../../src/components/admin/ChatbotCostManagement.tsx) — see [admin/frontend.md](../admin/frontend.md)).

- `useChatbotCostAnalytics`: read-only; `days` is in the key so switching the 7/30/90 range refetches. Returns `{ data, isLoading, isError }`.
- `useSetChatProvider` ([`useChatbotSettings.ts`](../../src/hooks/queries/admin/useChatbotSettings.ts)): switches Cobber's live LLM provider. On success it `invalidateQueries({ queryKey: ["admin", "chatbot-cost"] })` — a **partial-prefix** match that reconciles every cached range at once, so the panel's model name / active provider refresh with no reload. Consumers use `mutation.variables` (the target provider) for an optimistic toggle while `isPending`; on error `isPending` clears and the UI falls back to the server's `config.activeProvider` (auto-revert). DB-backed via the `ChatSettings` singleton — see [ai-chatbot/](../ai-chatbot/).

### Hourly revenue hook (`src/hooks/queries/admin/`)

`useHourlyRevenue({ startDate, endDate, platform })` ([`src/hooks/queries/admin/useHourlyRevenue.ts`](../../src/hooks/queries/admin/useHourlyRevenue.ts)) — `useQuery`, key `["admin", "analytics", "hourly-revenue", platform, startDate, endDate]`, enabled only when both dates are set. `platform` ∈ `meta` | `tiktok` | `snapchat` | `klaviyo` | `ad-channels` | `all`. Fetches the SHARED-1 hour-of-day series from `GET /api/admin/analytics/hourly-revenue` — each bucket is `{ hour, revenue, conversions, spend }` (`spend` null when the group has no spend source), plus a range `totalSpend`. **No aggressive polling** (1 min stale, `refetchOnWindowFocus: false`, no interval) — the underlying refund-`$lookup` aggregation is heavy. Consumed by `PlatformHourlyRevenueSection` (TikTok / Snapchat) and `AllPlatformsManagement`.

`useKlaviyoAnalytics(range)` ([`src/hooks/queries/admin/useKlaviyoAnalytics.ts`](../../src/hooks/queries/admin/useKlaviyoAnalytics.ts)) — `useQuery`, key `["admin", "klaviyo", "analytics", range]`. Fetches Klaviyo-attributed campaign/flow revenue + scheduled view from `GET /api/admin/klaviyo/analytics`. **Throttle-aware**: long `staleTime` (10 min), `refetchOnWindowFocus: false`, **no `refetchInterval`** — the Klaviyo reporting API is ~2/min and the route caches. Returns `{ data, stale, cachedAt }`; consumed by `KlaviyoAnalyticsManagement`.

## P3. Modal priority coordination

`useModalPriorityStore` exposes a `register / unregister / current` API. Modals register on mount with their priority; only the highest-priority active modal renders.

## P4. Loading-state coordination

`useLoadingStates` lets multiple components contribute to a global "is anything loading?" state without prop-drilling.

## P5. Prefetching on hover

`usePrefetching` triggers React Router / TanStack Query prefetch on link hover, making navigation feel instant.

## P6. Generic hooks small and focused

`useDebounce`, `useMediaQuery`, `useIsLgUp` — each does ONE thing. Don't bundle multiple concerns into one hook.
