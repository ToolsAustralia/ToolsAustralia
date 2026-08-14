/**
 * One-shot: grant `miniDraws.viewParticipants` to every role that already grants `miniDraws.view`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `miniDraws.viewParticipants` was carved OUT of `miniDraws.view` so a role can manage the
 * mini-draw lineup (create, reorder, edit, pick winners) without reading entrant personal
 * data. Before this split, `miniDraws.view` alone unlocked the CSV / Excel export — a full
 * dump of every entrant's name, email, mobile and state.
 *
 * The new permission gates BOTH the in-app participants roster and that export, because they
 * return byte-for-byte the same personal data. Gating one and not the other would be a lock on
 * the front door with the back one open.
 *
 * Adding an action to the catalog does NOT auto-grant it to existing custom roles — only the
 * system Admin role re-syncs to the full catalog (scripts/migrate-seed-staff-roles.ts). So
 * without this backfill, the deploy silently REMOVES export access from every live staff role,
 * which reads to staff as a bug rather than a policy change.
 *
 * The intended sequence is: run this (everyone keeps what they had) → then remove
 * "View participants" from whichever role should manage draws without reading entrants, in
 * Settings → Roles.
 *
 * WHY IT IS NOT IN THE SEED SCRIPT
 * --------------------------------
 * `migrate-seed-staff-roles.ts` is re-runnable by design. This operation must NOT be: once an
 * operator deliberately removes `miniDraws.viewParticipants` from a role, that role still holds
 * `miniDraws.view`, so a re-run would match it again and silently re-grant the permission they
 * just revoked — turning a routine re-seed into a privacy regression. A one-shot migration is
 * run deliberately, once.
 *
 * Mirrors 2026-08-13-backfill-users-view-detail.ts, which split `users.viewDetail` for the
 * same reason.
 *
 * Default is DRY-RUN. Pass --apply to write.
 *
 *   npm run migrate:backfill-mini-draws-participants:dry        # local, dry
 *   npm run migrate:backfill-mini-draws-participants            # local, apply
 *   npm run migrate:backfill-mini-draws-participants:prod:dry   # production, dry
 *   npm run migrate:backfill-mini-draws-participants:prod       # production, apply
 */
import dotenv from "dotenv";
import path from "node:path";

/**
 * Which env file to load. Defaults to `.env.local`; `--production` targets `.env.production`.
 *
 * MUST be resolved and loaded before importing anything that reads MONGODB_URI —
 * `src/lib/mongodb.ts` resolves the URI from `process.env` at import time and throws if unset.
 * Matches the sibling migrations.
 */
const ENV_FILE = process.argv.includes("--production") ? ".env.production" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE) });

import mongoose from "mongoose";
import connectDB from "../../src/lib/mongodb";
import Role from "../../src/models/Role";

const APPLY = process.argv.includes("--apply");
const IS_PRODUCTION = process.argv.includes("--production");

const VIEW = "miniDraws.view";
const VIEW_PARTICIPANTS = "miniDraws.viewParticipants";

async function run() {
  console.log(
    `\nBackfill ${VIEW_PARTICIPANTS} — target=${IS_PRODUCTION ? "PRODUCTION" : "local"} (${APPLY ? "APPLY" : "DRY-RUN"})\n`
  );
  await connectDB();

  const totalRoles = await Role.countDocuments({});
  const targets = await Role.find({
    permissions: { $all: [VIEW], $nin: [VIEW_PARTICIPANTS] },
  }).select("name permissions isSystem");

  console.log(`Roles in total          : ${totalRoles}`);
  console.log(`Holding ${VIEW}   : ${await Role.countDocuments({ permissions: VIEW })}`);
  console.log(`Needing the backfill    : ${targets.length}\n`);

  if (targets.length === 0) {
    console.log("Nothing to do — every role with miniDraws.view already has miniDraws.viewParticipants.");
    console.log("(If you expected changes, this migration has already been applied.)\n");
    await mongoose.disconnect();
    return;
  }

  for (const role of targets) {
    console.log(
      `  ${APPLY ? "+" : "would grant"} ${VIEW_PARTICIPANTS} → "${role.name}"${role.isSystem ? " (system)" : ""}`
    );
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --apply to grant.\n`);
    await mongoose.disconnect();
    return;
  }

  const result = await Role.updateMany(
    { _id: { $in: targets.map((r) => r._id) } },
    { $addToSet: { permissions: VIEW_PARTICIPANTS } }
  );

  console.log(`\n✓ Granted ${VIEW_PARTICIPANTS} to ${result.modifiedCount} role(s).`);
  console.log("  Staff access is UNCHANGED from before the deploy.");
  console.log("  To create a draws-only role, remove 'View participants' from it in Settings → Roles.\n");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
