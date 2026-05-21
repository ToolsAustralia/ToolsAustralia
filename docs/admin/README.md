# Admin domain

The admin panel — user management, payments, draws, promo, error reports, partner applications, etc.

## Index

- [architecture.md](./architecture.md) — admin pages, routes, auth
- [frontend.md](./frontend.md) — admin pages, components/admin
- [backend.md](./backend.md) — `/api/admin/**` route family, `services/admin`, `server/admin`
- [api.md](./api.md) — admin route inventory
- [rules.md](./rules.md) — admin auth at handler level, audit trails
- [patterns.md](./patterns.md) — UserDetailModal, dashboard tabs
- [gotchas.md](./gotchas.md) — middleware vs handler gating
- [models.md](./models.md) — `DashboardStatsDailySnapshot`, `ChargeJobRun` (admin-owned collections)
- [testing.md](./testing.md) — unit tests for admin services; dashboard stats snapshot tests
- [staff-permissions-mapping.md](./staff-permissions-mapping.md) — route → required permission map
- [roles-api.md](./roles-api.md) — `/api/admin/roles/**` CRUD
- [staff-api.md](./staff-api.md) — `/api/admin/staff/**` list, invite, change role, deactivate
- [staff-activity-log.md](./staff-activity-log.md) — audit trail of staff mutations (design + held-back items + future-work checklist)
