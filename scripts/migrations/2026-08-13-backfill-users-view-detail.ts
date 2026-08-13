/**
 * One-shot: grant `users.viewDetail` to every role that already grants `users.view`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `users.viewDetail` was carved OUT of `users.view` so a role can browse the customer roster
 * without opening a customer's record (email, mobile, address, payment history). Before this
 * split, `users.view` granted both.
 *
 * Adding an action to the catalog does NOT auto-grant it to existing custom roles — only the
 * system Admin role re-syncs to the full catalog (scripts/migrate-seed-staff-roles.ts). So
 * without this backfill, the deploy silently REMOVES modal access from every live staff role,
 * which reads to staff as a bug rather than a policy change.
 *
 * The intended sequence is: run this (everyone keeps what they had) → then remove "View detail"
 * from whichever role should be list-only, in Settings → Roles.
 *
 * WHY IT IS NOT IN THE SEED SCRIPT
 * --------------------------------
 * `migrate-seed-staff-roles.ts` is re-runnable by design. This operation must NOT be: once an
 * operator deliberately removes `users.viewDetail` from a role, that role still holds
 * `users.view`, so a re-run would match it again and silently re-grant the permission they just
 * revoked — turning a routine re-seed into a privacy regression. A one-shot migration is run
 * deliberately, once.
 *
 * Default is DRY-RUN. Pass --apply to write.
 *
 *   npm run migrate:backfill-users-view-detail:dry
 *   npm run migrate:backfill-users-view-detail
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "../../src/lib/mongodb";
import Role from "../../src/models/Role";

const APPLY = process.argv.includes("--apply");

const VIEW = "users.view";
const VIEW_DETAIL = "users.viewDetail";

async function run() {
  console.log(`\nBackfill ${VIEW_DETAIL} (${APPLY ? "APPLY" : "DRY-RUN"})\n`);
  await connectDB();

  const totalRoles = await Role.countDocuments({});
  const targets = await Role.find({
    permissions: { $all: [VIEW], $nin: [VIEW_DETAIL] },
  }).select("name permissions isSystem");

  console.log(`Roles in total          : ${totalRoles}`);
  console.log(`Holding ${VIEW}      : ${await Role.countDocuments({ permissions: VIEW })}`);
  console.log(`Needing the backfill    : ${targets.length}\n`);

  if (targets.length === 0) {
    console.log("Nothing to do — every role with users.view already has users.viewDetail.");
    console.log("(If you expected changes, this migration has already been applied.)\n");
    await mongoose.disconnect();
    return;
  }

  for (const role of targets) {
    console.log(`  ${APPLY ? "+" : "would grant"} ${VIEW_DETAIL} → "${role.name}"${role.isSystem ? " (system)" : ""}`);
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --apply to grant.\n`);
    await mongoose.disconnect();
    return;
  }

  const result = await Role.updateMany(
    { _id: { $in: targets.map((r) => r._id) } },
    { $addToSet: { permissions: VIEW_DETAIL } }
  );

  console.log(`\n✓ Granted ${VIEW_DETAIL} to ${result.modifiedCount} role(s).`);
  console.log("  Staff access is UNCHANGED from before the deploy.");
  console.log("  To create a list-only role, remove 'View detail' from it in Settings → Roles.\n");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
