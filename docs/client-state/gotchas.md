# Client State — Gotchas

## `useOrder` must read `{ order }`, not `{ success, data }` (fixed 2026-07-08)

`useOrder` ([useOrderQueries.ts](../../src/hooks/queries/useOrderQueries.ts)) previously typed the `GET /api/orders/[id]` response as `{ success, data }` while the route returns `{ order }` — so `data` was always `undefined`, `/checkout/success` rendered its error state, and the shop Purchase pixel (shop's only Meta signal) could never fire. Dormant while shop is "Coming Soon", but it would have shipped broken at launch. **The sibling order hooks are still aspirational**: `useOrders`/`useInfiniteOrders` expect a pagination shape `/api/orders` doesn't return (`{ orders }`), and `useRecentOrders`/`useOrderAnalytics` call endpoints that don't exist — none currently has a live consumer. Align them against the real routes as part of shop-launch work; don't trust the hook's declared response type without reading the route.

## `useChatbotSettings` — Cobber pause query + mutation (2026-07-08)

[`src/hooks/queries/admin/useChatbotSettings.ts`](../../src/hooks/queries/admin/useChatbotSettings.ts) now exports, besides `useSetChatProvider`: a `useChatbotSettings()` **query** (key `["admin","chatbot-settings"]`, 30s stale) returning `{ activeProvider, killSwitch, killSwitchEnvForced }`, and a `useSetChatKillSwitch()` **mutation** (`PATCH { killSwitch }`) that pauses/resumes Cobber. Both mutations invalidate **both** `["admin","chatbot-settings"]` and `["admin","chatbot-cost"]` so the availability toggle and the cost tab's config strip stay in lockstep. Consumed only by `ChatbotCostManagement`.

## Forced sign-out in `apiRequest` clears user-scoped client storage (2026-06-24, updated 2026-07-09)

`lib/queries.ts` `shouldForceLogout` path (now decided by `shouldInvalidateSession()` — 401 or 404+`USER_NOT_FOUND` only, **not** 403) calls `clearUserScopedClientStorage()` ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)) immediately before its in-place `signOut()` per the org rule: per-user localStorage must be wiped at auth-error sign-out to prevent leakage to the next user on a shared device. That helper clears auth breadcrumbs + per-user flags **and** support-chat history / `conversationId` (delegated to `clearSupportChatStorage()`), all SSR-safe (each guards `typeof window === "undefined"` internally). It keeps its bare `signOut()` (not `totalSignOut()`) because the clear + sign-out are deliberately separate here.

## `apiRequest` no longer sends an `Authorization` header (2026-06-19)

[lib/queries.ts](../../src/lib/queries.ts) (the shared React Query fetch wrapper) used to attach `Authorization: Bearer ${session.user.id}` to every authenticated request. That raw user id is **not a credential** — it was only ever "accepted" by the old cart/orders bearer routes, which have been migrated to NextAuth `getServerSession`. The header was removed: authentication is now carried solely by the NextAuth session cookie (auto-attached on same-origin requests). `apiDelete` also gained an optional `data` body argument (for `DELETE /api/cart`). Do not reintroduce a bearer header here.

## `trialing` subscription status maps to "Active", not "Trial"

`getSubscriptionStatusText` (`useSubscriptionQueries.ts`) maps `trialing` → **"Active"**. We never sell a real free trial — Stripe `trialing` only ever means a paid, active member whose billing date was anchored/reanchored via `trial_end` (the join-25-27→24 rule and the past-due reanchor). Do not surface "Trial" to members; a `trialing` member is fully active. See `docs/PAST_DUE_REANCHOR.md`.

## Context vs Zustand confusion

Pattern: scoped to a tree → Context. Cross-cutting → Zustand. Mistake: putting cross-cutting state in Context (forces Provider at root) or scoped state in Zustand (global state for one feature).

## Hydration mismatches

If server-render produces "light theme" but client first-paint sees "dark theme" (cookie says dark), React warns about mismatch. Bootstrap script in [theme](../theme/) handles this; verify when adding similar concerns.

## Query key drift

If you inline `["user", userId]` in one place and `["user", userId, "detail"]` in another, invalidation breaks. Always go through the key factory.

## Modal stacking

If modal A is open and modal B fires, the priority store decides. If both have the same priority, the order is undefined. Always set explicit priorities.

## Stale closures in Zustand

```ts
// Wrong — captures old state
const { items } = useStore.getState();
setTimeout(() => doSomething(items), 1000);

// Right — read fresh state
setTimeout(() => doSomething(useStore.getState().items), 1000);
```

## 403 no longer force-signs-out — only 401 / 404+USER_NOT_FOUND do (fixed 2026-07-09)

`apiRequest` in [src/lib/queries.ts](../../src/lib/queries.ts) used to treat **any 401/403** as an invalid session and call `signOut()`. The 403 half was a bug: 403 means *authenticated but not allowed*, which is routine once staff roles hold partial permission sets — a staff member whose role lacked `miniDraws.view` was force-logged-out seconds after login because the admin Overview's `TopDrawsCard` auto-fired `/api/admin/mini-draw/list` through `apiGet`. The decision now lives in the exported pure predicate `shouldInvalidateSession(status, errorCode)` (regression test: `npm run test:session-invalidation`): only **401** and **404 + `USER_NOT_FOUND`** invalidate the session. Do not re-add 403 to it. The earlier per-call-site workaround (routing feature-gate-403 hooks like [`usePartnerDiscountSso`](../../src/hooks/queries/usePartnerDiscountSso.ts) through raw `fetch` instead of `apiPost`) is no longer *required*, though existing raw-fetch call sites are fine as-is. Still prefer not firing a guaranteed-403 request at all — gate the query with `usePermissions().has(...)` (see `TopDrawsCard`).
