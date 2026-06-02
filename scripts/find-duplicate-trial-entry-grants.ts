/**
 * Find (READ-ONLY) duplicate membership entry-grants caused by Stripe's $0 "Trial period" invoice.
 *
 * Whenever `trial_end` is set on an existing subscription (past-due reanchor, the
 * `migrate-anchor-billing-24` migration, join-anchoring 25/26/27→24), Stripe auto-creates a separate
 * $0 invoice with `billing_reason=subscription_update` and marks it paid. The
 * `invoice.payment_succeeded` webhook granted membership entries for it — DOUBLE-counting the real
 * `subscription_cycle` renewal (which granted entries on its own invoice). See
 * `src/utils/billing/trial-invoice.ts` for the now-deployed guard that stops this going forward.
 *
 * This script LISTS the affected users and the duplicate entries to reverse. A "duplicate" is a $0
 * `subscription_update` BenefitsGranted that has a sibling REAL grant (`subscription_cycle` /
 * `subscription_create`) for the same user within ±1 day. Standalone update grants (no sibling) are
 * reported separately and NOT counted for reversal.
 *
 * Usage:
 *   npm run find:duplicate-trial-entry-grants
 *
 * Safety: READ-ONLY. Makes no writes. The actual entry reversal is a separate, reviewed step.
 * Env: .env.local must have MONGODB_URI.
 *
 * @module scripts/find-duplicate-trial-entry-grants
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";

const DAY_MS = 24 * 60 * 60 * 1000;

interface AffectedRow {
  userId: string;
  events: { id: string; entries: number; ts: Date; pkg?: string }[];
  total: number;
}

async function main(): Promise<void> {
  await connectDB();

  const updateGrants = await PaymentEvent.find({
    eventType: "BenefitsGranted",
    packageType: "membership",
    "data.billingReason": "subscription_update",
  })
    .sort({ timestamp: 1 })
    .lean();

  console.log(
    `Found ${updateGrants.length} membership $0-trial-invoice grants (eventType=BenefitsGranted, billingReason=subscription_update).`
  );

  const byUser = new Map<string, AffectedRow>();
  const standalone: { id: string; userId: string; entries: number; ts: Date }[] = [];

  for (const g of updateGrants) {
    const ts = g.timestamp as Date;
    const sibling = await PaymentEvent.findOne({
      userId: g.userId,
      eventType: "BenefitsGranted",
      packageType: "membership",
      "data.billingReason": { $in: ["subscription_cycle", "subscription_create"] },
      timestamp: { $gte: new Date(ts.getTime() - DAY_MS), $lte: new Date(ts.getTime() + DAY_MS) },
    }).lean();

    const entries = Number((g.data as { entries?: number })?.entries ?? 0);
    const uid = String(g.userId);
    if (!sibling) {
      standalone.push({ id: String(g._id), userId: uid, entries, ts });
      continue;
    }
    if (!byUser.has(uid)) byUser.set(uid, { userId: uid, events: [], total: 0 });
    const row = byUser.get(uid)!;
    row.events.push({ id: String(g._id), entries, ts, pkg: g.packageName });
    row.total += entries;
  }

  const ids = [...byUser.keys(), ...standalone.map((s) => s.userId)].map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: ids } }).select({ email: 1 }).lean();
  const emailMap = new Map(users.map((u) => [String(u._id), u.email]));

  console.log(`\n=== CONFIRMED DUPLICATES (have a sibling real grant — these should be reversed) ===`);
  console.log(`${byUser.size} users affected.\n`);
  let grandTotal = 0;
  for (const row of [...byUser.values()].sort((a, b) => b.total - a.total)) {
    grandTotal += row.total;
    console.log(`${emailMap.get(row.userId) ?? "(no email)"}  [user ${row.userId}]  -> reverse ${row.total} duplicate entries`);
    for (const e of row.events) {
      console.log(`     ${e.ts.toISOString()} | ${e.id} | entries=${e.entries}${e.pkg ? " | " + e.pkg : ""}`);
    }
  }
  console.log(`\nTOTAL duplicate entries to reverse: ${grandTotal} across ${byUser.size} users.`);

  if (standalone.length) {
    console.log(`\n=== STANDALONE $0-update grants (NO sibling real grant — review manually, NOT auto-reversed) ===`);
    for (const s of standalone) {
      console.log(`${emailMap.get(s.userId) ?? "(no email)"}  [user ${s.userId}]  ${s.ts.toISOString()} | ${s.id} | entries=${s.entries}`);
    }
  }

  console.log(`\n(READ-ONLY — no changes made. Reversal of the confirmed duplicates is a separate, reviewed step.)`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("find-duplicate-trial-entry-grants error:", err);
  process.exit(1);
});
