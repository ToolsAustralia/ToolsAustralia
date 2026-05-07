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
| [src/lib/queries.ts](../../src/lib/queries.ts) | Query client config |
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
