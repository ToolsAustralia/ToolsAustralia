# Client State — Architecture

## Three layers

| Layer | Purpose | Examples |
|---|---|---|
| **TanStack Query** | Server-state (anything from API) | user, subscription, draws, products, orders |
| **Zustand stores** | Cross-cutting client state | theme, modal priority, promo theme |
| **React Context** | Scoped client state | UserContext, CartContext, LoadingContext, SidebarContext, AdminUserModalContext, ThemeContext |

## TanStack Query setup

| File | Role |
|---|---|
| [src/lib/queries.ts](../../src/lib/queries.ts) | Shared `apiRequest` fetch wrapper + the default option objects (`defaultQueryOptions`, `defaultMutationOptions`, `retryConfig`). Mutations use the same "never retry a 4xx" predicate as queries, then allow one retry — see [rules.md](./rules.md) R11. |
| [src/app/providers.tsx](../../src/app/providers.tsx) | Where the `QueryClient` is actually constructed: the defaults above plus the `queryCache` / `mutationCache` error handlers ([rules.md](./rules.md) R10) and the `QueryCacheAuthBoundary` cache clear. |
| [src/lib/queryKeys.ts](../../src/lib/queryKeys.ts) | Centralized query-key factory. Admin allowlist namespace exposes `blockedCards(filterKey)`, `actions(action, limit)`, and `stats()` — the latter (added 2026-05-07) drives the all-time "Total on allowlist" metric on `/admin/blocked-transactions`. Apply/reverse mutations invalidate the broad `["admin", "allowlist"]` prefix, which covers all three keys. |
| [src/lib/requestDeduplication.ts](../../src/lib/requestDeduplication.ts) | Request dedup helpers |
| [src/hooks/queries/](../../src/hooks/queries/) | Domain-specific query hooks |

## Zustand stores

| Store | Purpose |
|---|---|
| [src/stores/index.ts](../../src/stores/index.ts) | Re-exports |
| [src/stores/useModalPriorityStore.ts](../../src/stores/useModalPriorityStore.ts) | Coordinate which modal shows when multiple are eligible |

(Theme stores live in [theme](../theme/) per manifest.)

## Contexts

[src/contexts/](../../src/contexts/):
- `LoadingContext.tsx` — global loading state
- `SidebarContext.tsx` — sidebar open/closed
- `AdminUserModalContext.tsx` — admin user modal state
- (UserContext, CartContext, ThemeContext, AdminThemeContext live in their owning domains)

## Generic hooks

| Hook | Purpose |
|---|---|
| `useDebounce()` | Generic debounce |
| `useMediaQuery()` | Match media query |
| `useIsLgUp()` | Specifically lg+ breakpoint |
| `useScrollAnimation()` | Scroll-based animation triggers |
| `useLoadingStates()` | Coordinate multiple loading states |
| `usePrefetching()` | Hover-prefetch for navigation |
| `useConfetti()` | Confetti effect (with QUICKSTART/README/example .md files alongside) |

## Polling intervals

Hooks under [`src/hooks/queries/`](../../src/hooks/queries/) that opt into `refetchInterval` use `refetchIntervalInBackground: false` so polling pauses for hidden tabs and resumes when the tab is focused (the next interval tick fires after focus, and `refetchOnWindowFocus: true` provides immediate catch-up where set). This applies to: `usePromoQueries` (`useActivePromos`, `useAdminActivePromos`, `useEffectiveForBanner`), `usePromoBannerTextQueries`, `useAlternatingMultiplierQueries`, `useMajorDrawQueries` (`useCurrentMajorDraw`, `useUserMajorDrawStats`), `useUserQueries` (`useMyAccountData`). Background polling on hidden tabs would inflate Edge Requests + Function Invocations without user-visible benefit.

NextAuth `<SessionProvider>` in [`src/app/providers.tsx`](../../src/app/providers.tsx) uses `refetchInterval={15 * 60}` (15 min, raised from 5 min). Refresh-on-focus is intentionally disabled (`refetchOnWindowFocus={false}`); the 15-min server poll bounds the worst-case stale-session UI window without flooding `/api/auth/session` invocations on every tab.

## Admin dashboard stats shape

`AdminDashboardStats` (in `src/hooks/queries/useAdminQueries.ts`) includes a `users.renewalProgress?: RenewalProgress` field. This field is only populated when the active date filter is `current-draw` or `last-draw`; it is `undefined` for all other ranges. Components must guard on its presence before rendering. See [admin/backend.md](../admin/backend.md#renewal-rate-kpi-2026-05-29) for the full field definition.

`AdminDashboardStats` also includes an `attributedRevenue?: Record<string, AttributedRevenueEntry>` field (2026-06-01). This is optional — it is absent when the backend has not computed attribution for the requested date range. Each key is a platform slug (`meta`, `tiktok`, `snapchat`, `klaviyo_email`, `klaviyo_sms`, `google`, `direct`, `other`). Each entry carries: `revenue` (acquisition revenue only — initial subs + one-time + upsell + mini-draw, `isRenewal=false`; this is the ROAS numerator), `renewalRevenue` (recurring subscription renewals, excluded from ROAS), `conversions`, `byConfidence: { click, utm_only, inferred_backfill }` (dollars, partitioning `revenue`), and optionally `adSpend`, `trueRoas` (= `revenue / adSpend`), `revenueTrend`, `trueRoasTrend` (all using the shared `TrendData` type from `@/types/admin/trend-types`). The `trueRoas` / `adSpend` fields are only present for platforms with measurable ad spend (`meta`; and `tiktok` since 2026-07-24 once its nightly sync has rows — `tiktokAdChannelProvider`, panel F-001).

**Added 2026-07-24:** `signups?` (accounts created attributed to this platform — click-verified via `signupAttribution.clickPlatform`, else UTM-derived, else counted under `direct`), and the **platform-reported** pair `platformRevenue?` / `platformRoas?` (the ad platform's OWN conversion value and ROAS, alongside the server-side `trueRoas`). The two ROAS fields intentionally differ — different attribution models/windows — so never reconcile or merge them; `platformRoas` is absent when a channel has spend but reported no value. An entry can now exist with `signups > 0` and zero revenue/conversions, so guard on the individual fields rather than assuming an entry implies revenue. The same field is mirrored on the local `DashboardStats` interface in `KPIMetricsGrid.tsx`. Always guard on the field and on individual entries before rendering.

## 2026-07-31 — `usePartnerDiscountSso` no longer navigates

[usePartnerDiscountSso.ts](../../src/hooks/queries/usePartnerDiscountSso.ts) used to call `window.location.assign` inside `onSuccess`. It now resolves to `{ kind: "redirect" }` or `{ kind: "consent" }` and leaves navigation to the caller (`usePortalHandoff`), because the transit takeover has to render its success state before the browser leaves.

Note the pattern for the 409: **consent is a resolved value, not a thrown error.** It is a normal branch of the flow, so throwing it would light up every inline `error` renderer on four call sites with a message the member should never read. Same file also exports `usePartnerDiscountConsent`. The raw-`fetch`-not-`apiPost` reason (feature-gate 403 must not force a logout) is unchanged — see [gotchas.md](gotchas.md).

## `UserData.gender` (2026-08-17)

`UserData` in [useUserQueries.ts](../../src/hooks/queries/useUserQueries.ts) carries the optional `gender?: string`, sourced from the `MY_ACCOUNT_USER_FIELDS` projection. `UserContext` re-exports it, which is what lets `ConversionPixelsAdvancedMatching` pass gender to `buildAdvancedMatching` with no extra request.
