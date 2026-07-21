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

## R8. Prefer CDN `s-maxage` + focus/navigation refetch over a guest `refetchInterval`

A `refetchInterval` on a **guest-facing** query re-hits origin on a fixed cadence for as long as the tab
is focused — even for a visitor sitting idle on the page. For data that a public CDN can cache, drop the
interval and instead: set the route's `Cache-Control` to `public, s-maxage=<n>, stale-while-revalidate=…`,
give the query `staleTime ≈ n` with `refetchOnWindowFocus: true` + `refetchOnMount: true`, and **do not**
pass `cache: "no-store"` on the `fetch` (it defeats the CDN entry you just configured). An **active** guest
then sees a change within ≈`2n` on their next focus/navigation (served fresh-within-`n` from the CDN); an
**idle** guest who never refocuses is the accepted trade — nothing time-critical may depend on the poll.

Applied (perf Tier-2, 2026-07-20) to the public promo surfaces — `useActivePromos` (was 30 s),
`useEffectiveForBanner`, `useCurrentAlternatingMultipliers`, `useActivePromoBannerText` (all were 60 s) →
`staleTime: 60 s`, no interval. This is safe because the **banner countdown ticks client-side from
`endDate`** (`useLeafTimer` leaf tickers in `PromoBanner`/`FloatingCountdownBanner`), so no on-screen clock
depends on the network; only the multiplier/banner-text *values* refresh on focus/navigation. **Keep** a
poll only where the polled state is business-critical AND server-driven, e.g. `useCurrentMajorDraw`
(draw STATUS active → frozen → completed gates entry). User-private data that changes only via the user's
own mutations does not need a background poll either — `useUserMajorDrawStats` dropped its 1-minute
interval (its optimistic-write ecosystem keeps it current; see draws/gotchas).

## R9. Session lookups are de-duped by an in-flight promise, not just a TTL cache

`getCachedSession()` in [queries.ts](../../src/lib/queries.ts) caches the resolved session for a 30 s TTL
**and** coalesces concurrent cold-load callers onto one in-flight `getSession()` promise
(`cachedSessionPromise ??= …`). On first paint many hooks fire `apiRequest` at once; without the shared
promise each would hit `/api/auth/session` in parallel. The promise clears on resolve; the value then
serves from the TTL cache. `invalidateSessionCache()` clears both.
