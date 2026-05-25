#!/usr/bin/env npx tsx

/**
 * Fix (backfill) membership renewals that failed to credit the active major draw.
 *
 * Root cause (see docs/draws/gotchas.md): during synchronized renewal billing
 * spikes, the MajorDraw write inside `addToMajorDraw` transiently failed and was
 * SILENTLY swallowed (catch block with commented-out logging,
 * payment-processing.ts:2202). The renewal's PaymentEvent was created with
 * `data.grants.drawGrants: []`, the user's accumulator updated, but the draw was
 * never credited — invisible (0 ErrorReports; webhook queue shows "succeeded").
 *
 * AUTHORITATIVE BASIS (verified): a member's correct draw membership =
 * `data.entries` of their LATEST in-window membership BenefitsGranted event (the
 * renewal that should have targeted this draw). NOT
 * `subscription.lastMonthAccumulatedEntries` (that field drifts ahead of the
 * actual grant and produces false positives).
 *
 * A member is a confirmed victim when ALL hold:
 *   - latest in-window membership grant has EMPTY drawGrants
 *   - subscription is active
 *   - that renewal's paymentIntent was NOT refunded/reversed
 *   - live draw membership < the grant's entries
 * Backfill amount = grantEntries - currentDrawMembership.
 *
 * SAFETY: DRY-RUN BY DEFAULT. No writes occur unless you pass --apply.
 * Idempotent: re-reads live state per member and skips anyone already correct.
 *
 * Usage:
 *   npm run fix:major-draw-renewal-entries:dry          # plan only (default)
 *   npx tsx scripts/fix-major-draw-renewal-entries.ts   # plan only (default)
 *   npx tsx scripts/fix-major-draw-renewal-entries.ts --apply   # LIVE writes
 *
 *   Options:
 *     --apply           Perform writes. Without it, nothing is written.
 *     --drawId=<id>     Target a specific draw (default: status:"active").
 *     --email=<addr>    Limit to one member (spot-fix / testing).
 *     --out-dir=<path>  CSV output dir (default: temp/readonly/).
 *
 * Env: MONGODB_URI (.env.local).
 */

import { config } from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { formatInTimeZone } from "date-fns-tz";

config({ path: path.resolve(process.cwd(), ".env.local") });
const SYDNEY_TZ = "Australia/Sydney";

function parseArg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : undefined;
}
const APPLY = process.argv.includes("--apply");
const ARG_DRAW_ID = parseArg("drawId");
const ARG_EMAIL = parseArg("email");
const OUT_DIR = parseArg("out-dir") ?? path.resolve(process.cwd(), "temp", "readonly");

type DrawEntryRow = { userId: { toString(): string }; totalEntries: number; entriesBySource: Record<string, number> };
type EventRow = {
  _id: string;
  userId: mongoose.Types.ObjectId;
  paymentIntentId: string;
  timestamp: Date;
  data?: { entries?: number; grants?: { drawGrants?: Array<{ kind: string; drawId: string; sourceKey: string; entries: number }> } };
};

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }
  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    console.error("Mongo connection not ready");
    process.exit(1);
  }
  const usersColl = db.collection("users");
  const drawsColl = db.collection("majordraws");
  const eventsColl = db.collection<EventRow>("paymentevents");

  const draw = ARG_DRAW_ID
    ? await drawsColl.findOne({ _id: new mongoose.Types.ObjectId(ARG_DRAW_ID) })
    : await drawsColl.findOne({ status: "active" }, { sort: { activationDate: -1 } });
  if (!draw) {
    console.error("No target draw found.");
    process.exit(1);
  }
  const drawId = (draw._id as mongoose.Types.ObjectId).toString();
  const activation = new Date(draw.activationDate as Date);
  const fmt = (d: unknown) => (d ? formatInTimeZone(new Date(d as Date), SYDNEY_TZ, "yyyy-MM-dd HH:mm zzz") : "—");
  console.error("══════════════════════════════════════════════════════════════");
  console.error(`MODE: ${APPLY ? "🔴 APPLY (LIVE WRITES)" : "🟢 DRY-RUN (no writes)"}`);
  console.error(`Target draw: ${String(draw.name)} (${drawId})`);
  console.error(`  activation=${fmt(draw.activationDate)}  freeze=${fmt(draw.freezeEntriesAt)}  draw=${fmt(draw.drawDate)}`);
  console.error("══════════════════════════════════════════════════════════════");

  // live membership per user + whether a row exists
  const liveMem = new Map<string, number>();
  const hasRow = new Set<string>();
  for (const r of (draw.entries as DrawEntryRow[]) ?? []) {
    liveMem.set(r.userId.toString(), r.entriesBySource?.membership ?? 0);
    hasRow.add(r.userId.toString());
  }

  // latest in-window membership grant per user
  const evQuery: Record<string, unknown> = {
    eventType: "BenefitsGranted",
    packageType: "membership",
    timestamp: { $gte: activation },
  };
  if (ARG_EMAIL) {
    const u = await usersColl.findOne({ email: { $regex: `^${ARG_EMAIL}$`, $options: "i" } }, { projection: { _id: 1 } });
    if (!u) {
      console.error(`No user with email ${ARG_EMAIL}`);
      process.exit(1);
    }
    evQuery.userId = u._id;
  }
  const evs = (await eventsColl.find(evQuery).sort({ timestamp: 1 }).toArray()) as EventRow[];
  const latestByUser = new Map<string, EventRow>();
  for (const e of evs) latestByUser.set(e.userId.toString(), e);

  const rows: string[] = ["email,userId,grantEntries,currentDrawMembership,creditDelta,action,renewalPI,renewalDateUTC"];
  let victims = 0;
  let totalCredit = 0;
  let skippedRefunded = 0;
  let skippedInactive = 0;
  let now = new Date();

  for (const [uid, ev] of latestByUser) {
    const dg = ev.data?.grants?.drawGrants ?? [];
    if (dg.length > 0) continue; // latest renewal credited fine
    const grantEntries = ev.data?.entries ?? 0;
    const current = liveMem.get(uid) ?? 0;
    if (current >= grantEntries) continue; // already correct (e.g. healed by a retry)

    // guards: active sub + renewal not refunded
    const u = await usersColl.findOne(
      { _id: new mongoose.Types.ObjectId(uid) },
      { projection: { email: 1, "subscription.isActive": 1 } }
    );
    if (u?.subscription?.isActive !== true) {
      skippedInactive++;
      continue;
    }
    const refunded = await eventsColl.countDocuments({
      userId: new mongoose.Types.ObjectId(uid),
      eventType: { $in: ["RefundProcessed", "RefundPartial", "BenefitsReversed"] },
      paymentIntentId: ev.paymentIntentId,
    });
    if (refunded > 0) {
      skippedRefunded++;
      continue;
    }

    const delta = grantEntries - current;
    const action = hasRow.has(uid) ? "INC_EXISTING" : "PUSH_NEW_ROW";
    victims++;
    totalCredit += delta;
    rows.push(
      [u?.email, uid, grantEntries, current, delta, action, ev.paymentIntentId, new Date(ev.timestamp).toISOString().slice(0, 16)].join(",")
    );

    if (APPLY) {
      now = new Date();
      // Re-read live membership for idempotency safety just before writing.
      const fresh = await drawsColl.findOne(
        { _id: draw._id, "entries.userId": new mongoose.Types.ObjectId(uid) },
        { projection: { "entries.$": 1 } }
      );
      const freshMem = (fresh?.entries as DrawEntryRow[] | undefined)?.[0]?.entriesBySource?.membership ?? null;
      if (freshMem !== null && freshMem >= grantEntries) continue; // someone/something already fixed it
      const applyDelta = grantEntries - (freshMem ?? 0);
      if (freshMem !== null) {
        await drawsColl.updateOne(
          { _id: draw._id, "entries.userId": new mongoose.Types.ObjectId(uid) },
          {
            $inc: { "entries.$.totalEntries": applyDelta, "entries.$.entriesBySource.membership": applyDelta },
            $set: { "entries.$.lastUpdatedDate": now },
          }
        );
      } else {
        await drawsColl.updateOne(
          { _id: draw._id },
          {
            $push: {
              entries: {
                userId: new mongoose.Types.ObjectId(uid),
                totalEntries: grantEntries,
                entriesBySource: { membership: grantEntries },
                firstAddedDate: now,
                lastUpdatedDate: now,
              },
            },
          }
        );
      }
      // Back-fill the ledger so refund-reversal can attribute it later.
      await eventsColl.updateOne(
        { _id: ev._id, "data.grants.drawGrants": { $size: 0 } },
        { $push: { "data.grants.drawGrants": { kind: "major", drawId, sourceKey: "membership", entries: grantEntries } } }
      );
    }
  }

  if (APPLY && victims > 0) {
    const refreshed = await drawsColl.findOne({ _id: draw._id });
    const total = ((refreshed?.entries as DrawEntryRow[]) ?? []).reduce((s, e) => s + (e.totalEntries || 0), 0);
    await drawsColl.updateOne({ _id: draw._id }, { $set: { totalEntries: total } });
    console.error(`Applied. Recomputed draw.totalEntries = ${total}`);
  }

  console.error("──────────────────────────────────────────────────────────────");
  console.error(`Members with empty-drawGrants latest renewal: candidates scanned`);
  console.error(`Confirmed victims to credit:   ${victims}`);
  console.error(`Total entries to credit:       ${totalCredit}`);
  console.error(`Skipped (inactive sub):        ${skippedInactive}`);
  console.error(`Skipped (renewal refunded):    ${skippedRefunded}`);
  console.error(`Mode: ${APPLY ? "WRITES DONE" : "DRY-RUN — nothing written. Re-run with --apply after review."}`);
  console.error("──────────────────────────────────────────────────────────────");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = formatInTimeZone(new Date(), SYDNEY_TZ, "yyyyMMdd-HHmm");
  const outPath = path.join(OUT_DIR, `cleanup-renewal-entries-plan-${stamp}.csv`);
  fs.writeFileSync(outPath, rows.join("\n"), "utf8");
  console.error(`Plan written → ${outPath} (${rows.length - 1} members)`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
