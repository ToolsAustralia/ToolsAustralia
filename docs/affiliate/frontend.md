# Affiliate — Frontend

> **Loader (2026-07-03):** the affiliate dashboard (`affiliate/page.tsx`) and login Suspense fallback
> (`affiliate/login/page.tsx`) now render the shared [`DashboardLoader`](../../src/components/loading/DashboardLoader.tsx)
> — the Claude Design "Dashboard Loader" medallion — instead of a bare red-arc spinner. The **dashboard**
> passes `light` (the affiliate dashboard is light-only `bg-gray-50`, so the loader is light-locked to
> avoid a dark→light flash for dark-theme visitors); the login stays theme-adaptive. See
> [shared-ui/frontend.md § DashboardLoader](../shared-ui/frontend.md#dashboardloader-ported-from-claude-design-2026-07-03).

## Pages

`src/app/(site)/affiliate/` — affiliate portal (login, dashboard, links, commissions, payouts).

## Hooks

| Hook | Purpose |
|---|---|
| `useAffiliateAuth()` | Session for affiliate portal (separate from main NextAuth) |
| `useAffiliateLink()` | Generate / track affiliate share links |

## State conventions

- Affiliate session is separate from member session — uses [src/lib/affiliate-auth.ts](../../src/lib/affiliate-auth.ts).
- Affiliate dashboard reads via TanStack Query; no Zustand for affiliate state.
