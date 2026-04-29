# Dashboard-Account — Gotchas

## Landing-trigger storage

`dashboard-landing-session.ts` and `dashboard-entry-hold.ts` use sessionStorage. If user opens multiple tabs, each has its own session — landing experiences may re-fire.

## Mobile date toolbar slot

[useAdminMobileDateToolbarSlot](../admin/frontend.md) is admin-only despite the "dashboard" sounding name — admin's date filtering UI for mobile. Don't confuse with member dashboard.

## Cross-domain data freshness

The dashboard reads from many sources. After a mutation in one source domain, that source must invalidate its query keys; the dashboard re-renders. If you add a new mutation, ensure key invalidation is wired up.

## Landing race conditions

If the user reaches `/my-account` before the landing-page metric write completes, the landing trigger may decide based on stale data. _TODO: verify timing._
