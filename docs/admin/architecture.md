# Admin — Architecture

## Layout

| Path | Role |
|---|---|
| [src/app/admin/](../../src/app/admin/) | Admin panel pages (tab-based, `/admin/[tab]`) |
| [src/components/admin/](../../src/components/admin/) | Admin-specific components (UserDetailModal, ChargePastDueModal, etc.) |
| [src/app/api/admin/](../../src/app/api/admin/) | Admin API routes — catch-all for routes not owned by another domain |
| [src/features/admin/](../../src/features/admin/) | Admin feature modules |
| [src/server/admin/](../../src/server/admin/) | Server-only admin code (e.g. `chargePastDueShared.ts`) |
| [src/hooks/useAdminMobileDateToolbarSlot.ts](../../src/hooks/useAdminMobileDateToolbarSlot.ts) | Admin-specific UX hook |

## Auth

Per [auth rules R1-R2](../auth/rules.md): middleware gates `/admin/**` PAGES; per-handler `requireAdmin(session)` gates `/api/admin/**` ROUTES. Both layers required.

## Tabbed admin panel

`/admin/[tab]/` — single dynamic route hosts the tabbed interface. Each tab renders a different feature surface (users, payments, draws, promo, errors, etc.).

## Key admin features

- User detail modal (with subscription tab → cancel subscription)
- Charge past-due modal (bulk retry failed renewals)
- Error reports triage
- Promo / campaign management
- Affiliate management
- Draw management
