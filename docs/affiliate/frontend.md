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

### `affiliate_ui` marker cookie — gates the `useAffiliateAuth` network check (perf Tier-2, 2026-07-20)

The real session cookie (`__Host-affiliate_token`) is **httpOnly**, so client JS can't read it — which is
why `useAffiliateAuth` used to call `/api/affiliate/check-auth` on **every** page load (mounted in the
`Header`), including for the vast majority of visitors who are not affiliates.

To skip that call for non-affiliates, [`POST /api/affiliate/login`](../../src/app/api/affiliate/login/route.ts)
now also sets a **non-httpOnly** `affiliate_ui=1` marker cookie (same 30-day lifetime as the token), and
[`useAffiliateAuth`](../../src/hooks/useAffiliateAuth.ts) only runs the `check-auth` fetch when
`document.cookie.includes("affiliate_ui=")`. Guests/regular users have no marker → the hook resolves to
"not authenticated" with **no** network call. [`POST /api/affiliate/logout`](../../src/app/api/affiliate/logout/route.ts)
clears the marker alongside the token (auth-boundary storage clear). The marker is a **UX signal only** —
authorization is always the httpOnly token, server-side.

**Transitional note:** affiliates who were already logged in *before* this shipped have the token but not
the marker, so the `Header` treats them as logged-out until they log in again (which sets the marker). No
security impact — the `/affiliate` dashboard is still server-gated by middleware; only the header account
menu is affected, and it self-heals on next login.

> **2026-07-19 route-class note:** this domain's public page(s) under `src/app/(site)/` are **nonce-CSP route class** — they must render per-request. The blanket layout `force-dynamic` was removed site-wide, so the page now carries its own explicit dynamic declaration (directly, or via the `page.tsx` server shim + `page-client.tsx` pattern when the page is a client component — segment config is ignored in "use client" files). Do not remove it; see docs/security-csp/architecture.md "Route classes".

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.
