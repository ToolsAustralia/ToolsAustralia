# Client State — Gotchas

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
