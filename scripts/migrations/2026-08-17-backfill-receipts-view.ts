/**
 * One-shot: grant `receipts.view` to every role that already grants `settings.view`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Receipts tab sits in the admin sidebar's Billing group. Every other tab in that group
 * (Blocked Transactions, Past-Due Charges, Webhook Queue) is gated on `settings.view`, so
 * "can see the Billing group" has meant `settings.view` up to now.
 *
 * Receipts does NOT reuse it. That surface is the complete revenue picture joined to
 * customer identity — names, emails, every payment — and this repo's precedent is to carve
 * those out into their own grant (`users.viewDetail`, `miniDraws.viewParticipants` both
 * exist for exactly this reason). So `receipts.view` / `receipts.export` are new actions.
 *
 * Adding an action to the catalog does NOT auto-grant it to existing custom roles — only the
 * system Admin role re-syncs to the full catalog (scripts/migrate-seed-staff-roles.ts).
 * Without this backfill the deploy would read to staff as a Billing tab that silently
 * vanished, rather than as a deliberate policy change.
 *
 * `receipts.export` is deliberately NOT backfilled. The CSV is a bulk dump of revenue joined
 * to full names and emails — the same class of grant as `users.export` — so it starts off and
 * gets handed out on purpose, in Settings → Roles.
 *
 * The intended sequence is: run this (everyone who could see the Billing group keeps a view
 * of Receipts) → then remove "View" from any role that shouldn't read revenue, and add
 * "Export" to whichever role genuinely needs the file.
 *
 * WHY IT IS NOT IN THE SEED SCRIPT
 * --------------------------------
 * `migrate-seed-staff-roles.ts` is re-runnable by design. This operation must NOT be: once an
 * operator deliberately removes `receipts.view` from a role, that role still holds
 * `settings.view`, so a re-run would match it again and silently re-grant the permission they
 * just revoked — turning a routine re-seed into a privacy regression. A one-shot migration is
 * run deliberately, once.
 *
 * Mirrors 2026-08-13-backfill-mini-draws-view-participants.ts and
 * 2026-08-13-backfill-users-view-detail.ts, which split their permissions for the same reason.
 *
 * Default is DRY-RUN. Pass --apply to write.
 *
 *   npm run migrate:backfill-receipts-view:dry        # local, dry
 *   npm run migrate:backfill-receipts-view            # local, apply
 *   npm run migrate:backfill-receipts-view:prod:dry   # production, dry
 *   npm run migrate:backfill-receipts-view:prod       # production, apply
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

const SETTINGS_VIEW = "settings.view";
const RECEIPTS_VIEW = "receipts.view";

async function run() {
  console.log(
    `\nBackfill ${RECEIPTS_VIEW} — target=${IS_PRODUCTION ? "PRODUCTION" : "local"} (${APPLY ? "APPLY" : "DRY-RUN"})\n`
  );
  await connectDB();

  const totalRoles = await Role.countDocuments({});
  const targets = await Role.find({
    permissions: { $all: [SETTINGS_VIEW], $nin: [RECEIPTS_VIEW] },
  }).select("name permissions isSystem");

  console.log(`Roles in total          : ${totalRoles}`);
  console.log(`Holding ${SETTINGS_VIEW}   : ${await Role.countDocuments({ permissions: SETTINGS_VIEW })}`);
  console.log(`Needing the backfill    : ${targets.length}\n`);

  if (targets.length === 0) {
    console.log(`Nothing to do — every role with ${SETTINGS_VIEW} already has ${RECEIPTS_VIEW}.`);
    console.log("(If you expected changes, this migration has already been applied.)\n");
    await mongoose.disconnect();
    return;
  }

  for (const role of targets) {
    console.log(
      `  ${APPLY ? "+" : "would grant"} ${RECEIPTS_VIEW} → "${role.name}"${role.isSystem ? " (system)" : ""}`
    );
  }

  if (!APPLY) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --apply to grant.\n`);
    await mongoose.disconnect();
    return;
  }

  const result = await Role.updateMany(
    { _id: { $in: targets.map((r) => r._id) } },
    { $addToSet: { permissions: RECEIPTS_VIEW } }
  );

  console.log(`\n✓ Granted ${RECEIPTS_VIEW} to ${result.modifiedCount} role(s).`);
  console.log("  Anyone who could already see the Billing group keeps a view of Receipts.");
  console.log("  'Export' was NOT granted — hand it out deliberately in Settings → Roles.\n");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
