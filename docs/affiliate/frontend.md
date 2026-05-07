# Affiliate — Frontend

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

## E2E test IDs

Playwright specs in `e2e/affiliate/` consume the following `data-testid` attributes (registered in `e2e/utils/selectors.ts`):

| Component | testid | Notes |
|---|---|---|
| `src/app/(site)/affiliate/login/page.tsx` | `affiliate-login-username` | Username input (form uses username, not email) |
| `src/app/(site)/affiliate/login/page.tsx` | `affiliate-login-password` | Password input |
| `src/app/(site)/affiliate/login/page.tsx` | `affiliate-login-submit` | Submit button |
| `src/app/(site)/affiliate/page.tsx` | `affiliate-dashboard-link` | Read-only input containing the affiliate share link (with embedded `?ref=CODE`) |
| `src/app/(site)/affiliate/page.tsx` | `affiliate-dashboard-copy-link` | Copy-link button (single copy control on the dashboard) |
| `src/app/(site)/affiliate/page.tsx` | `affiliate-dashboard-signups` | Signups stat card in the hero stats panel |
| `src/app/(site)/affiliate/page.tsx` | `affiliate-dashboard-commissions` | Recent unpaid commissions section wrapper |

Specs: `login.spec.ts` (chromium-guest), `dashboard.spec.ts`, `link-generation.spec.ts`, `commission-track.spec.ts` (all chromium-affiliate). Per-worker auth state is built by `e2e/fixtures/affiliate-auth.setup.ts`.
