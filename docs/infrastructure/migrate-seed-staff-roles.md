# migrate-seed-staff-roles

`scripts/migrate-seed-staff-roles.ts` is idempotent and safe to re-run.

It does three things:
1. Creates or updates the **Admin** role with the current full permission catalog.
2. Creates the **Ads Manager** role (starter template) if missing.
3. Links existing `role: "admin"` users to the Admin role + sets `userType: "staff"`. Sets `userType: "customer"` on everyone else.

Run order during deploy of Phase 1:
1. Deploy code (additive schema; old paths still work via the legacy admin bridge in `src/lib/api-auth-permissions.ts`).
2. Run `npm run migrate:seed-staff-roles:dry` against prod and inspect the counts.
3. Run `npm run migrate:seed-staff-roles`.
4. Verify in Atlas that the `Role` collection exists and your account has `roleId` set.

The script can be re-run safely after Phase 2/3/4 are deployed — it only adds new permissions to Admin and only backfills users that haven't been touched yet.
