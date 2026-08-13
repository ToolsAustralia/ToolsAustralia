# Permissions Catalog

The permission catalog (`src/lib/permissions.ts`) is the **single source of truth** for what permissions exist in the system. Every permission corresponds to a real code gate; the admin UI can only *bundle* existing permissions into roles — it cannot invent new ones.

## Shape

Permissions are strings of the form `<area>.<action>`. Each area declares its own list of actions in `AREA_ACTIONS`. Most areas only need `view` and `edit`, but areas with destructive, financial, or otherwise irreversible operations get extra sub-actions so roles can grant write access without granting the dangerous ones.

```ts
export const AREA_ACTIONS = {
  users: ["view", "edit", "charge", "cancelSubscription", "refund", "delete"],
  promos: ["view", "edit", "end"],
  majorDraw: ["view", "edit", "selectWinner"],
  affiliates: ["view", "edit", "processPayout", "delete"],
  errorReports: ["view", "edit", "delete"],
  abTesting: ["view", "edit", "selectWinner", "delete"],
  // ...view-only areas: pageAnalytics, submissions, miniDraws, drawResults, upcomingDraws
  // ...view + edit areas: overview, facebookAds, settings
} as const;
```

`PERMISSIONS` is derived from this map. `Permission` is the union of every `<area>.<action>` string and is fully type-safe — passing an action foreign to an area is a TypeScript error.

## Descriptions

Every area and every permission has a human-readable label + Discord-style explanation in `src/lib/permission-descriptions.ts`. The Settings → Roles UI renders the description next to each toggle so the owner knows what they're granting before they flip it.

The label + description files are **enforced** by `npm run test:permissions`:
- every area in `AREAS` must have an `AREA_META` entry,
- every permission in `PERMISSIONS` must have a `PERMISSION_META` entry,
- dangerous sub-actions (`charge`, `cancelSubscription`, `refund`, `delete`, `selectWinner`, `processPayout`, `end`) must have `danger: true` so the UI tints them red.

When adding a new permission, add the description in the same commit — the test will fail otherwise.

## Adding a permission

1. Add the action to the relevant area's tuple in `AREA_ACTIONS`. Use `view` for read-only routes and a descriptive verb (`charge`, `selectWinner`, `processPayout`, `refund`, `end`, `delete`) for write actions whose impact justifies a separate gate. Treat any **irreversible**, **money-moving**, or **destructive** action as a candidate for its own sub-action.
2. Gate the matching route handler with `requirePermission("<area>.<action>")`.
3. Update [docs/admin/staff-permissions-mapping.md](../admin/staff-permissions-mapping.md) so the route → permission map stays current.
4. Re-run `npm run migrate:seed-staff-roles`. The seeded **Admin** role picks up every catalog permission automatically; existing custom roles do **not** auto-gain new permissions (this is intentional — the UI surfaces the new toggle so the owner can opt in).

## Sub-action conventions

When deciding whether to add a sub-action instead of reusing `edit`, ask: *would I trust this person to flip a normal toggle but not to do this thing?* If yes, split it.

| Sub-action | Used for | Examples |
|---|---|---|
| `charge` | Anything that moves money **from** a customer | `users.charge`, force-charge, manual past-due retry |
| `cancelSubscription` | Ending a billing relationship | `users.cancelSubscription` |
| `refund` | Replays of refund / reversal processing | `users.refund` |
| `delete` | Hard removes / soft archives with no undo button | `users.delete`, `affiliates.delete`, `errorReports.delete`, `abTesting.delete` |
| `selectWinner` | Irreversible prize/winner declaration | `majorDraw.selectWinner`, `abTesting.selectWinner` |
| `processPayout` | Money **out** to a third party | `affiliates.processPayout` |
| `end` | Permanently closing a live entity | `promos.end` |
| `viewDetail` | A **deeper read** of the same entity — personal data behind a list | `users.viewDetail` |

### `viewDetail` — splitting PII depth out of `view` (2026-08-13)

The sub-action test above ("would I trust them to flip a toggle but not do this thing?") has a
read-side twin: **would I trust this person to see the list but not the record behind it?**

`users.view` used to gate both the customer roster *and* the detail modal, so any role that could
browse customers could also read every customer's email, mobile, address and payment history —
the catalog simply could not express a triage role. `users.viewDetail` now gates the modal:

| Permission | Grants |
|---|---|
| `users.view` | The customer list + search: name, membership, status, entries |
| `users.viewDetail` | `GET /api/admin/users/[id]` and the modal-only reads — `payment-events`, `deletion-summary`, `charge-past-due` preview |

Two things that make this different from adding a normal permission:

1. **It is a REMOVAL for existing roles, not an addition.** New catalog actions are deliberately
   not auto-granted to custom roles (step 4 above), which is right when a permission unlocks
   something new — and wrong when one is carved OUT of an existing grant, because the deploy then
   silently revokes access staff already had. `npm run migrate:backfill-users-view-detail` grants
   it to every role that already held `users.view`, so the split ships as a no-op and is narrowed
   per role afterwards. **Any future `viewDetail`-style split needs the same backfill.**
2. **The backfill must NOT live in `migrate-seed-staff-roles.ts`.** That script is re-runnable;
   this operation is not. Once an operator deliberately removes `users.viewDetail` from a role,
   that role still holds `users.view`, so a re-seed would match it again and silently re-grant the
   permission they just revoked. It is a dated one-shot under `scripts/migrations/` for that reason.

UI gating alone is not the boundary: both modal entry points (the users table row and
`ClickableUserDisplay`, which appears on overview / promo analytics / affiliates / draws) check
`users.viewDetail`, but the endpoints enforce it independently, so a crafted request still 403s.
The Norm registry entries that mirror those routes (`users.get`, `users.deletion-summary`,
`users.payment-events.list`, `users.charge-past-due.preview`) moved in lockstep (CLAUDE.md rule 10).

## Areas

| Area | Actions | Notes |
|---|---|---|
| `overview` | view, edit | Admin dashboard landing. `edit` covers upsell multipliers and Klaviyo draw-reset execute. |
| `users` | view, edit, charge, cancelSubscription, refund, delete | Customer user management. `edit` = profile + status actions only; financial/destructive actions are their own permission. |
| `promos` | view, edit, end | Promo CRUD lives under `edit`. Ending a live promo is irreversible. |
| `facebookAds` | view, edit | Insights + sync. |
| `pageAnalytics` | view | Read-only dashboards: the **Page Analytics** (`promo-analytics`) tab and its three API routes, plus the **Repeat Purchases** tab and its routes. |
| `submissions` | view | Contact form submissions (no admin writes today). |
| `miniDraws` | view | Currently unused area; mini-draw write routes are gated under `majorDraw.*`. |
| `majorDraw` | view, edit, selectWinner | Covers mini-draws too. `selectWinner` is irreversible. |
| `drawResults` | view | Past draw results admin view. |
| `upcomingDraws` | view | Upcoming draws calendar. |
| `affiliates` | view, edit, processPayout, delete | `processPayout` moves money to an affiliate; gate separately. |
| `errorReports` | view, edit, delete | `edit` = status changes / individual PATCH; `delete` = bulk archive. |
| `abTesting` | view, edit, selectWinner, delete | `selectWinner` declares an experiment winner. |
| `rewards` | view, edit, delete | Milestone rewards + monthly coupon campaigns. `edit` covers create/update/toggle and target-user previews; `delete` removes a milestone reward or soft-deactivates a campaign with existing issuances. |
| `settings` | view, edit | Admin Settings tab (Roles & Staff sub-screens). |
| `audit` | view | Staff activity log (audit trail of staff mutations). |

## `promoAnalytics.view` was retired (2026-07-31)

The area no longer exists. It is gone from `AREA_ACTIONS`, from `PERMISSION_META`, and from the
`Ads Manager` seed bundle in `scripts/migrate-seed-staff-roles.ts`.

It had been checked by **zero** routes and gated **zero** tabs while reading as though it guarded
the Page Analytics tab. That tab is gated by `pageAnalytics.view` in `adminTabs.ts`, and on
2026-07-31 the three routes behind it (`/api/admin/promo-analytics{,/channel-detail,/page-detail}`)
plus their three Norm registry entries moved from `promos.view` → `pageAnalytics.view` to match —
following the `repeat-purchases` precedent. So `promos.view` no longer over-grants the tab's data
either. Leaving an inert permission in the catalog is a trap: an owner could revoke it believing it
locks down promo analytics, and nothing would change.

**The divergence it masked was latent, not breaking.** Production held Admin, Manager and Customer
Support — there was **no "Ads Manager" role in production** despite the seeded template — and both
Admin and Manager held `promos.view`, so nobody lost or gained access. (The dev cluster *did* have
an Ads Manager role, so the mismatch was live there.)

### The ordering constraint, for the next time an area is retired

`Role.permissions` validates against `PERMISSIONS` and **rejects unknown strings**, so removing a
catalog entry while stored roles still list it makes those role documents fail validation on their
next save. Retirement is therefore two steps and the order is not optional:

1. `npm run migrate:promo-analytics-cleanup[:dry]` /
   `npm run migrate:promo-analytics-cleanup:prod[:dry]`
   ([scripts/migrations/2026-07-31-promo-analytics-cleanup.ts](../../scripts/migrations/2026-07-31-promo-analytics-cleanup.ts),
   dry-run by default) — `$pull`s the string from every `Role`. Reversible by re-granting.
2. **Then** remove the entry from `AREA_ACTIONS` and its `PERMISSION_META` row, and bump the
   `AREAS.length` assertion in `src/lib/__tests__/permissions.test.ts`.

Both steps ran on 2026-07-31 — dev and production — and both are verified: zero roles hold the
string in either cluster. The migration is idempotent, so a re-run is a no-op.
