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
| [src/lib/queryKeys.ts](../../src/lib/queryKeys.ts) | Centralized query-key factory |
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
