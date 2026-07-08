# Client State — Gotchas

## `useChatbotSettings` — Cobber pause query + mutation (2026-07-08)

[`src/hooks/queries/admin/useChatbotSettings.ts`](../../src/hooks/queries/admin/useChatbotSettings.ts) now exports, besides `useSetChatProvider`: a `useChatbotSettings()` **query** (key `["admin","chatbot-settings"]`, 30s stale) returning `{ activeProvider, killSwitch, killSwitchEnvForced }`, and a `useSetChatKillSwitch()` **mutation** (`PATCH { killSwitch }`) that pauses/resumes Cobber. Both mutations invalidate **both** `["admin","chatbot-settings"]` and `["admin","chatbot-cost"]` so the availability toggle and the cost tab's config strip stay in lockstep. Consumed only by `ChatbotCostManagement`.

## Forced sign-out in `apiRequest` clears user-scoped client storage (2026-06-24, updated 2026-07-07)

`lib/queries.ts` `shouldForceLogout` path calls `clearUserScopedClientStorage()` ([src/utils/auth/total-sign-out.ts](../../src/utils/auth/total-sign-out.ts)) immediately before its in-place `signOut()` per the org rule: per-user localStorage must be wiped at auth-error sign-out to prevent leakage to the next user on a shared device. That helper clears auth breadcrumbs + per-user flags **and** support-chat history / `conversationId` (delegated to `clearSupportChatStorage()`), all SSR-safe (each guards `typeof window === "undefined"` internally). It keeps its bare `signOut()` (not `totalSignOut()`) because the clear + sign-out are deliberately separate here.

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

## A feature-gate 403 must NOT use `apiPost` (it force-signs-out) (2026-06-24)

`apiRequest`/`apiPost` in [src/lib/queries.ts](../../src/lib/queries.ts) treat **any 401/403** as an invalid session and call `signOut()`. That's correct for auth failures, but **wrong for a feature-gating 403** — a logged-in member who simply lacks a feature should see an error, not be logged out of the whole site. [`usePartnerDiscountSso`](../../src/hooks/queries/usePartnerDiscountSso.ts) deliberately uses a **raw `fetch`** for exactly this reason: its route returns `403` for "no active partner-discount access". If you add a hook whose route 403s as a feature gate (not an auth check), do the same — don't route it through `apiPost`.
