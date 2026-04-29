# Admin — Patterns

## P1. Tab-based panel

`/admin/[tab]/` dynamic route hosts the entire panel. Each tab is a feature view. Sidebar links navigate between tabs.

## P2. UserDetailModal as the canonical user view

[src/components/admin/UserDetailModal.tsx](../../src/components/admin/UserDetailModal.tsx) is the place to view/edit a user. Sub-tabs within the modal: Profile, Subscription, Payment, Activity, etc. Don't build parallel user-detail UIs — extend the modal.

## P3. Confirmation gates for destructive bulk actions

`ChargePastDueModal` requires typing `CHARGE`. Apply this pattern when building new bulk-impactful admin tools (e.g. mass refunds, bulk cancellations).

## P4. Shared service for user + admin paths

(See [subscription P8](../subscription/patterns.md#p8-single-shared-service-for-user--admin-paths) and [billing-stripe P9](../billing-stripe/patterns.md#p9-single-shared-service-for-user--admin-paths).) Cancel, charge, refund — same service for both auth contexts; pass an `analytics.actor` option.

## P5. Audit row written by service

Audit rows are written inside the service, not the route handler. Ensures both user + admin paths produce consistent audit data.
