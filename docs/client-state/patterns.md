# Client State — Patterns

> **Two analytics reads on one admin tab need two query keys (2026-08-11).** `queryKeys.admin.partnerDiscountAnalytics(params)` sits beside `promoAnalytics(params)` because both render on the **Page Analytics** tab over the same date range. They are deliberately *not* one key: different collections, different response shapes, so sharing a key would make one refetch serve the other's cached data. The discount section reads the date range from the **URL search params** the promo half already owns rather than taking it as a prop — one source of truth, one date picker, no drift. See [partner/analytics.md](../partner/analytics.md).

> **A view-shape control belongs IN the query key (2026-08-11).** The sibling case to the one
> above. `useTikTokAdsInsights` gained a `level` param (`campaign | adset | ad`) and it is part of
> the key: `["admin", "tiktok-ads", "insights", startDate, endDate, level]`. The rows are a
> *different grouping of the same window*, not a filter over one result set — so sharing a key
> across levels would hand campaign-grouped rows to the ad view and render them under the wrong
> headers until the refetch landed. The consuming table further guards this by rendering against
> `data.level` (what came back) rather than the selected level, so the headers can never describe
> rows that aren't on screen yet. Same rule as any param that changes the SHAPE of the response
> rather than narrowing it. `level` defaults to `"ad"`, matching the endpoint's own default.

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

`useHourlyRevenue({ startDate, endDate, platform })` ([`src/hooks/queries/admin/useHourlyRevenue.ts`](../../src/hooks/queries/admin/useHourlyRevenue.ts)) — `useQuery`, key `["admin", "analytics", "hourly-revenue", platform, startDate, endDate]`, enabled only when both dates are set. `platform` ∈ `meta` | `tiktok` | `snapchat` | `klaviyo` | `ad-channels` | `all`. Fetches the SHARED-1 hour-of-day series from `GET /api/admin/analytics/hourly-revenue` — each bucket is `{ hour, revenue, conversions, spend }` (`spend` null when the group has no spend source, **or** — 2026-07-24, panel F-003 — when any CONFIGURED source's fetch failed: a meta-success + tiktok-failure must render "—", never a Meta-only sum passed off as the group total), plus a range `totalSpend`. **No aggressive polling** (1 min stale, `refetchOnWindowFocus: false`, no interval) — the underlying refund-`$lookup` aggregation is heavy. Consumed by `PlatformHourlyRevenueSection` (TikTok / Snapchat) and `AllPlatformsManagement`.

`useKlaviyoAnalytics(range)` ([`src/hooks/queries/admin/useKlaviyoAnalytics.ts`](../../src/hooks/queries/admin/useKlaviyoAnalytics.ts)) — `useQuery`, key `["admin", "klaviyo", "analytics", range]`. Fetches Klaviyo-attributed campaign/flow revenue + scheduled view from `GET /api/admin/klaviyo/analytics`. **Throttle-aware**: long `staleTime` (10 min), `refetchOnWindowFocus: false`, **no `refetchInterval`** — the Klaviyo reporting API is ~2/min and the route caches. Returns `{ data, stale, cachedAt }`; consumed by `KlaviyoAnalyticsManagement`.

### Per-ad insights breakdown hooks (`src/hooks/queries/admin/`)

`useTikTokAdsInsights({ startDate, endDate, enabled })` ([`src/hooks/queries/admin/useTikTokAdsInsights.ts`](../../src/hooks/queries/admin/useTikTokAdsInsights.ts)) — `useQuery`, key `["admin", "tiktok-ads", "insights", startDate, endDate]`, `enabled` only when `enabled !== false` **and** both `startDate`/`endDate` (`YYYY-MM-DD`) are set. Fetches the per-TikTok-ad breakdown (`adName` + `spend` + TikTok-reported `conversions`/`revenue` + `ROAS`) plus **`syncHealth`** (2026-07-24, panel F-002: `{ configured, lastRun, lastSyncedAt }` — lets `TikTokAdBreakdownTable` and `AdvertisingPlatformCard` render "sync FAILING" vs "no spend yet") from `GET /api/admin/tiktok-ads/insights?startDate=&endDate=`, unwrapping the `{ success, data }` envelope and throwing on `success === false`. Returns `TikTokAdInsightsResult` — now defined **in the hook** as the service's result type intersected with `{ syncHealth?: TikTokSyncHealth }` (the route composes `syncHealth` on top of the service payload); `TikTokAdInsightsRow` + `TikTokSyncHealth` re-exported via **type-only imports** from `@/services/admin/tiktok/{tiktokAdInsightsQuery,tiktokSyncStatus}` so the server services' Mongoose models are never bundled client-side (`no-models-in-client`). Polling profile mirrors `useFacebookAdsInsights` ([`src/hooks/queries/useFacebookAdsInsights.ts`](../../src/hooks/queries/useFacebookAdsInsights.ts)): `staleTime` 1 min, `gcTime` 10 min, `refetchOnWindowFocus: true`, `refetchInterval` 2 min, `retry: 2` with exponential `retryDelay` capped at 30 s.

## P3. Modal priority coordination

`useModalPriorityStore` exposes a `register / unregister / current` API. Modals register on mount with their priority; only the highest-priority active modal renders.

**`"pixel-consent"` removed from `ModalType` (2026-07-24, panel F-019)** — along with its priority entry, its `UnifiedModalManager` case, the `PixelConsentModal` component, and the dev-gallery entry. It was permanently unreachable (the manager rendered it with a hard-coded `isOpen={false}` and a placeholder comment) and its Decline handler gated no pixel. Tools Australia deliberately runs **without a consent banner** — pixels load for every visitor, and `hasPixelConsent()` hard-returns `true`. Do not re-add the type without also building real gating: see [docs/tracking/rules.md R9](../tracking/rules.md) for what that entails.

## P4. Loading-state coordination

`useLoadingStates` lets multiple components contribute to a global "is anything loading?" state without prop-drilling.

## P5. Prefetching on hover

`usePrefetching` triggers React Router / TanStack Query prefetch on link hover, making navigation feel instant.

## P6. Generic hooks small and focused

`useDebounce`, `useMediaQuery`, `useIsLgUp` — each does ONE thing. Don't bundle multiple concerns into one hook.

## P7. Optimistic mutation shape

The optimistic mutations under `src/hooks/queries/` follow one shape. Each clause exists because its
absence caused a shipped bug — see [gotchas.md](./gotchas.md).

**`onMutate` — cancel, snapshot, write; and write to *every* key the UI reads.** `cancelQueries` and
`invalidateQueries` match by **key prefix**; `setQueryData` matches **exactly**. So one
`cancelQueries({ queryKey: queryKeys.users.detail(id) })` covers `users.account` / `users.dashboard` /
`users.profile` too (all `["users", id, …]`), but a `setQueryData` on `users.detail` is invisible to
every consumer reading `users.account`. Predict into each key that actually backs a rendered surface —
`useUpdateAutoRenew` writes both `users.detail` and `users.account` because `/my-account` reads the
latter.

**Predict a field in the mutation that owns it, not in a neighbour that sometimes precedes it.**
`useUpdateSubscriptionPaymentMethod` predicts `subscriptionDefaultPaymentMethodId` (the field the
Payment sheet uses to pick the hero card for subscribers); `useSetDefaultPaymentMethod` deliberately
does not, because `SavedPaymentMethodsModal` calls it *without* the subscription update and the
prediction would visibly snap back there.

**`onError` — restore exactly what `onMutate` wrote, and nothing else.** A snapshot-and-restore pair
around a `onMutate` that only cancelled/snapshotted is not a rollback: it re-writes possibly-stale data
over whatever landed while the request was in flight. Where `onMutate` wrote into a key that may not
have existed, restore the `undefined` snapshot too — skipping it leaves the fabricated entry behind.

**`onSettled` — reconcile on both outcomes.** Failure paths need the refetch as much as success ones (a
409 on a redemption means the server *did* burn the issuance, so the rolled-back cache is the wrong one).
Return the invalidation promise only when a caller's `mutateAsync` resolution must wait for the
reconciled render — `useUpdateAutoRenew` does, because its call site shows the success toast on resolve
and the toast must not beat the card it describes. Otherwise fire-and-forget (`void`): React Query holds
the mutation `pending` until these callbacks settle, so awaiting a heavy refetch (the my-account payload)
keeps the button disabled for exactly the round-trip the optimistic write exists to hide.

**Merge server responses into the cached row, don't replace it.** A mutation response is often a thinner
projection than the GET that populated the cache (the payment-methods `PUT` echoes the `User` row with no
Stripe card metadata). Replacing blanks the fields the member is looking at until the refetch lands.

**Only write optimistically what you actually have.** If the rendered fields only exist server-side
(card brand/last4/expiry), there is nothing to predict — skip `onMutate` and write the row in `onSuccess`
from the response.

## P8. Repeat-purchase analytics hooks

`src/hooks/queries/admin/useRepeatPurchaseAnalytics.ts` exposes `useRepeatPurchaseSummary(filter)` (`useQuery`) and `useRepeatPurchaseUsers(filter, options)` (`useInfiniteQuery`, 50/page) for the admin **Repeat Purchases** tab. Inline query keys `["admin","analytics","repeat-purchases","summary",filter]` / `["admin","analytics","repeat-purchases","users",{...filter,limit}]` (the dominant admin convention — see P1). Both unwrap the `{ success, data }` envelope and throw on `success === false`. The users hook returns a flattened facade `{ rows, totalCount, hasMore, fetchNextPage, isFetchingNextPage, isLoading, isError }` (the `useChargePastDueRuns` shape) for the "Load more" button. Summary `staleTime` 5 min; users list 2 min + `enabled` gating (draw presets need resolved dates). Backed by `/api/admin/analytics/repeat-purchases`, `…/users`, and `…/users/export` (see [admin/api.md](../admin/api.md)).

## P9. Receipts ledger hook

`src/hooks/queries/admin/useReceipts.ts` backs the admin **Receipts** tab. Unlike the P8
sibling it uses a **centralised** query key — `queryKeys.admin.receipts(queryString)` in
`src/lib/queryKeys.ts` — following the `useBlockedCards` precedent rather than the inline-key
convention, and it goes through `apiGet` so 401 sign-out handling is inherited.

The key *is* the serialised query string (date range + category + page), so changing any
filter is a new cache entry rather than a stale table under a new heading. Paging uses
`placeholderData: keepPreviousData` so the table doesn't blank between pages — a plain
`useQuery`, not `useInfiniteQuery`, because the tab shows a total for the current filter and
needs discrete Prev/Next pages rather than an accumulating list.

**Types come from `@/utils/admin/receipts`, never from `@/services/admin/receipts`.** The
service imports Mongoose models; pulling it into a client component would ship the data layer
to the browser. The `no-models-in-client` lint rule only catches *direct* `@/models/**`
imports, so this boundary is maintained by hand — see
[admin/receipts.md](../admin/receipts.md#the-two-file-split).

`enabled` gating matters here: draw presets resolve to `""` until the draw dates load, and
firing before then sends a custom-range request with no bounds and gets a 400 back.

**CSV export is not a query.** `downloadReceiptsCsv(filter)` is a plain async function that
fetches `?format=csv`, turns the response into a blob, and triggers the synthesized
`<a download>` click (the `UserExportModal` / RevenueDetailModal idiom). It is server-rendered
rather than built from the loaded page because the file covers the whole filter, and because
only the server can enforce the separate `receipts.export` permission. It reads
`X-Receipts-Truncated` / `-Row-Count` / `-Total-Count` off the response so a capped export is
announced in the UI instead of silently short.

## P10. The shared admin date filter (`useAdminDateFilter`)

`src/hooks/useAdminDateFilter.ts` is the **only** date-range state for admin analytics tabs, paired with `AdminDateRangeToolbar`. As of 2026-08-19 the Overview uses it too — it previously carried its own copy (four `useState`s, a `searchParams` effect, a duplicated draw-preset resolver and its own `CustomDateRangeModal`), which is how two surfaces on the same product ended up disagreeing about presentation and stickiness.

**Two things it deliberately does not own.**

1. **The AEST maths.** Preset → `yyyy-MM-dd` in `Australia/Sydney` lives in `resolveAestDateWindow` (`src/utils/admin/`), and the hook calls it. The dependency points **util ← hook** and must stay that way: the hook is `"use client"`, so inverting it would drag a client hook into any server-side caller of the util. The util's optional 4th argument carries `drawDates` for the `current-draw` / `last-draw` presets.
2. **The custom-range modal and major-draw list.** Both live in `AdminDateRangeToolbar`, so consumers render one component and get the whole control.

**URL sync is opt-in** — `useAdminDateFilter("today", { syncToUrl: true })`. Only the Overview passes it (it had a deep-linkable `?dateRange=&startDate=&endDate=` before the unification and keeps it); the other tabs stay local-only.

Two loop guards make the sync safe, and both are load-bearing:

- `writeUrl` compares the serialised params against the current ones and returns early if identical — otherwise `router.replace` re-fires the hook's own URL effect and state ping-pongs forever.
- The "adopt external URL change" effect keeps the last-applied query string in a ref and bails when it hasn't changed, so back/forward and deep links are honoured while the hook's own writes are not read back in.

Only presets that **carry** dates (`custom`, `current-draw`, `last-draw`) write `startDate`/`endDate` to the URL; the rest delete them, because for those the preset alone is the complete description and a stale pair would outrank it on the next mount.

**Consumers forwarding dates to query hooks should mirror that same rule.** `DashboardOverview` passes `startDate`/`endDate` to its cards only for those three presets. The hook always resolves a concrete window, but `useAdminDashboardStats` treats the pair as part of its cache key while only forwarding it to the route for custom/draw ranges — so passing a resolved "today" pair would re-key every cached query once per day for no behavioural gain.

## P11. Brand performance + period comparison query keys (2026-08-19)

**`useBrandPerformance`** (`src/hooks/queries/useBrandPerformance.ts`) — inline query key per the dominant admin convention, keyed on `[lane, basis, platform, compare, startDate, endDate]`. **All four control values are in the key** because each produces genuinely different numbers; sharing a cache entry across them would render one toggle's data under another toggle's heading.

⚠️ **Types only from `@/services/analytics/BrandPerformanceService`.** The service imports Mongoose models, so a *value* import would ship the data layer to the browser. `import type` is erased at compile time, which is what makes this safe. The `no-models-in-client` lint rule only catches direct `@/models/**` imports, so this boundary is maintained by hand — same rule as `useReceipts` (P9).

**`useAdminDashboardStats` gained freshness overrides.** Its defaults (2-minute `staleTime`, 5-minute `refetchInterval`) are right for the live dashboard, whose window includes today. `PeriodComparisonCard` queries a **closed** calendar month, so it passes `{ staleTime: 60 * 60 * 1000, refetchInterval: false }` — polling a fairly heavy route every 5 minutes for a finished period that can only change if a late refund lands is pure waste. Defaults are unchanged for every existing caller.

That card's comparison key is also **stable across date-range changes** (last month doesn't move), so flipping presets costs nothing after the first fetch, and the drawer reuses the card's already-loaded data rather than issuing a second request.
