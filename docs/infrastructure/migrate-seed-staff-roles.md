# migrate-seed-staff-roles

`scripts/migrate-seed-staff-roles.ts` is idempotent and safe to re-run.

It does three things:
1. Creates or updates the **Admin** role with the current full permission catalog (`PERMISSIONS`).
2. Creates the **Ads Manager** role (starter template) if missing.
3. Links existing `role: "admin"` users to the Admin role + sets `userType: "admin"`. Sets `userType: "customer"` on everyone else who has no `userType` yet.

## Targeting an environment

| Command | Env file | Writes? |
| --- | --- | --- |
| `npm run migrate:seed-staff-roles:dry` | `.env.local` | no |
| `npm run migrate:seed-staff-roles` | `.env.local` | **yes** |
| `npm run migrate:seed-staff-roles:prod:dry` | `.env.production` | no |
| `npm run migrate:seed-staff-roles:prod` | `.env.production` | **yes** |

**Note the asymmetry with the sibling migrations.** They gate writes behind `--apply` and
default to a dry run; this script has no `--apply` and **defaults to writing**. `--dry-run` is
the safe mode here, so `--production` on its own WILL write to production. The banner names the
target and mode on every run — read it before walking away.

`--production` was added on 2026-08-27. Until then the script always loaded `.env.local`, so
step 2 below ("run the dry-run against prod") was **impossible as written** — the doc described
an intent the code did not implement.

## This is the step that makes a shipped permission real

`PERMISSIONS` is the catalog in code. A role's stored `permissions` array is a **snapshot** of
that catalog from whenever it was last seeded. Adding a permission to the catalog and deploying
it does **not** grant it to anyone — the seeded Admin role only regains it on the next run of
this script, and custom roles never gain it at all without a dedicated backfill migration.

So a feature gated on a new permission is invisible on a fully-deployed build until this runs.
That has now happened twice:

- `shop.view` / `shop.edit` / `shop.delete` shipped with the merchandise shop, and the admin
  Shop sidebar group (gated on `shop.view` — see `docs/admin/frontend.md`) stayed hidden in
  production because the catalog grew and nothing re-seeded.
- `receipts.export` shipped alongside `receipts.view`, which *did* get a backfill migration
  (`scripts/migrations/2026-08-17-backfill-receipts-view.ts`). The backfill covered only
  `view`, so `export` was left behind.

When you add a permission, decide explicitly which applies:
- **Seeded Admin role only** → this script is enough.
- **Existing custom roles too** → write a backfill migration as well, following
  `scripts/migrations/2026-08-13-backfill-users-view-detail.ts`. Without one, the deploy reads
  to staff as a silent access removal.

## Run order during deploy

1. Deploy code (additive schema; old paths still work via the legacy admin bridge in
   `src/lib/api-auth-permissions.ts`).
2. `npm run migrate:seed-staff-roles:prod:dry` — inspect the output. The dry run names the
   missing permissions (`missing -> …`) and reports how many users would actually be
   backfilled, which is scoped to those with no `userType` and is usually **0** on a re-run.
3. `npm run migrate:seed-staff-roles:prod`.
4. Verify in Atlas that the `Role` collection exists and your account has `roleId` set.

Re-running after later phases is safe — it only adds new permissions to Admin and only
backfills users that haven't been touched yet.
