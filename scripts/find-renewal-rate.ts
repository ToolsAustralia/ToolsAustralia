/**
 * find-renewal-rate.ts
 *
 * READ-ONLY audit. Computes the true subscription RENEWAL RATE for a date range
 * using the "renewal due in range" cohort, so we can validate the metric against
 * production data before building a dashboard card.
 *
 * Definition (agreed in design):
 *   Renewal Rate = renewed / (renewed + churned_involuntary + churned_voluntary)
 *   - renewed              = renewal cycle due in range that SUCCEEDED (or later recovered)
 *   - churned_involuntary  = renewal cycle due in range that FAILED and did not recover
 *   - churned_voluntary    = member whose period ended in range with NO renewal invoice
 *                            (autoRenew off -> Stripe issued no invoice), found via
 *                            MembershipStatusHistory {scheduled_cancel|canceled} endDate in range
 *   - pending              = renewal cycle due in range that FAILED and is still in dunning
 *                            (excluded from the rate, reported separately)
 *
 * Cohort grain: per distinct user, one classification per range (monthly billing => ~1
 * renewal opportunity per member in a 30-day window). Buckets are disjoint.
 *
 * Usage:
 *   npx tsx scripts/find-renewal-rate.ts                 # auto-resolves the last completed draw window (AEST)
 *   npx tsx scripts/find-renewal-rate.ts --start=2026-04-28 --end=2026-05-27
 *   npm run find:renewal-rate
 *
 * Options:
 *   --start=YYYY-MM-DD   AEST inclusive start (overrides auto-resolve)
 *   --end=YYYY-MM-DD     AEST inclusive end   (overrides auto-resolve)
 *
 * Safety:
 *   READ-ONLY. Performs only .find/.aggregate/.countDocuments — no writes, no migrations.
 *   Safe to run against production.
 *
 * Env:
 *   Reads .env.local then .env (MONGODB_URI). Connects via src/lib/mongodb.ts.
 */

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";
import { aestDayBounds } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";

const AEST = "Australia/Sydney";

function argStr(flag: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`${flag}=`));
  return a ? a.split("=")[1] : null;
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return `${((n / d) * 100).toFixed(2)}%`;
}

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || "(none)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

async function resolveRange(): Promise<{ startKey: string; endKey: string; label: string }> {
  const start = argStr("--start");
  const end = argStr("--end");
  if (start && end) {
    return { startKey: start, endKey: end, label: "custom (--start/--end)" };
  }
  // Mirror /api/admin/major-draw/current-and-last: last completed draw activationDate -> drawDate, AEST.
  const lastDraw = await MajorDraw.findOne({ status: "completed" })
    .sort({ drawDate: -1 })
    .select("activationDate drawDate name")
    .lean<{ activationDate?: Date; drawDate?: Date; name?: string }>();
  if (!lastDraw?.activationDate || !lastDraw?.drawDate) {
    throw new Error("Could not resolve last completed draw. Pass --start/--end explicitly.");
  }
  return {
    startKey: formatInTimeZone(lastDraw.activationDate, AEST, "yyyy-MM-dd"),
    endKey: formatInTimeZone(lastDraw.drawDate, AEST, "yyyy-MM-dd"),
    label: `Last Draw: ${lastDraw.name ?? "?"}`,
  };
}

async function coverageReport() {
  console.log("=".repeat(72));
  console.log("DATA COVERAGE — how far back is the renewal-rate metric trustworthy?");
  console.log("=".repeat(72));

  const cycleCount = await MembershipRenewalCycle.countDocuments({ billingReason: "subscription_cycle" });
  const oldestCycle = await MembershipRenewalCycle.findOne({ billingReason: "subscription_cycle" })
    .sort({ dueAt: 1 })
    .select("dueAt")
    .lean<{ dueAt?: Date }>();
  const newestCycle = await MembershipRenewalCycle.findOne({ billingReason: "subscription_cycle" })
    .sort({ dueAt: -1 })
    .select("dueAt")
    .lean<{ dueAt?: Date }>();

  console.log(`\nMembershipRenewalCycle (subscription_cycle): ${cycleCount} rows`);
  console.log(`  earliest dueAt : ${oldestCycle?.dueAt ? formatInTimeZone(oldestCycle.dueAt, AEST, "yyyy-MM-dd") : "?"}`);
  console.log(`  latest   dueAt : ${newestCycle?.dueAt ? formatInTimeZone(newestCycle.dueAt, AEST, "yyyy-MM-dd") : "?"}`);

  // per AEST-month histogram of dueAt (reveals when the collection started filling, and gaps)
  const byMonth = await MembershipRenewalCycle.aggregate<{ _id: string; n: number; succeeded: number; failed: number }>([
    { $match: { billingReason: "subscription_cycle" } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$dueAt", timezone: AEST } },
        n: { $sum: 1 },
        succeeded: { $sum: { $cond: [{ $eq: ["$status", "succeeded"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  console.log("\n  dueAt by AEST month (cycles / succeeded / failed):");
  for (const m of byMonth) {
    console.log(`    ${m._id}: ${String(m.n).padStart(5)}  (ok ${m.succeeded}, fail ${m.failed})`);
  }

  const hist = await MembershipStatusHistory.estimatedDocumentCount();
  const oldestHist = await MembershipStatusHistory.findOne().sort({ effectiveAt: 1 }).select("effectiveAt").lean<{ effectiveAt?: Date }>();
  const newestHist = await MembershipStatusHistory.findOne().sort({ effectiveAt: -1 }).select("effectiveAt").lean<{ effectiveAt?: Date }>();
  console.log(`\nMembershipStatusHistory: ~${hist} rows`);
  console.log(`  earliest effectiveAt : ${oldestHist?.effectiveAt ? formatInTimeZone(oldestHist.effectiveAt, AEST, "yyyy-MM-dd") : "?"}`);
  console.log(`  latest   effectiveAt : ${newestHist?.effectiveAt ? formatInTimeZone(newestHist.effectiveAt, AEST, "yyyy-MM-dd") : "?"}`);

  const snap = await MembershipDailySnapshot.findOne().sort({ date: 1 }).select("date").lean<{ date?: string }>();
  const snapLatest = await MembershipDailySnapshot.findOne().sort({ date: -1 }).select("date").lean<{ date?: string }>();
  console.log(`\nMembershipDailySnapshot (the 'Statuses as-of' card — NOT used by renewal rate):`);
  console.log(`  earliest date : ${snap?.date ?? "?"}`);
  console.log(`  latest   date : ${snapLatest?.date ?? "?"}`);
  console.log("\n  => Renewal rate is reliable from the earliest dueAt month with a full cycle count,");
  console.log("     NOT from the snapshot start date.\n");
}

/**
 * Per-draw renewal progress. Base cohort = active members at the close of the
 * PREVIOUS draw (snapshot count). Numerator = base members who renewed during the
 * current draw window so far. Remainder = expected-to-renew + pending + churned.
 */
async function drawProgressReport() {
  const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"];

  // Current draw = active/queued; its base = the LAST completed draw's close (drawDate).
  const lastDraw = await MajorDraw.findOne({ status: "completed" })
    .sort({ drawDate: -1 })
    .select("drawDate name")
    .lean<{ drawDate?: Date; name?: string }>();
  if (!lastDraw?.drawDate) throw new Error("No completed draw to anchor the base cohort.");

  const baseDateKey = formatInTimeZone(lastDraw.drawDate, AEST, "yyyy-MM-dd"); // e.g. 2026-05-27
  // Current draw starts the day after the last draw closed.
  const drawStartUTC = aestDayBounds(baseDateKey).dayEndUTC; // midnight AEST of (baseDate + 1) = current-draw start
  const nowUTC = new Date();

  // Base = sum of snapshot activeCount across subscription packages, as of the previous draw close.
  const baseSnaps = await MembershipDailySnapshot.find({
    date: baseDateKey,
    packageId: { $in: SUBSCRIPTION_PACKAGE_IDS },
  })
    .select("packageId activeCount pastDueCount")
    .lean<Array<{ packageId: string; activeCount: number; pastDueCount: number }>>();
  const baseActive = baseSnaps.reduce((s, r) => s + (r.activeCount ?? 0), 0);
  const basePastDue = baseSnaps.reduce((s, r) => s + (r.pastDueCount ?? 0), 0);

  console.log("=".repeat(72));
  console.log(`PER-DRAW RENEWAL PROGRESS — Current Draw (base = close of "${lastDraw.name}")`);
  console.log("=".repeat(72));
  console.log(`Base cohort (active as of ${baseDateKey}) : ${baseActive}  (+${basePastDue} past-due)`);
  if (baseSnaps.length === 0) console.log("  !! no snapshot rows for that date — base unavailable");
  console.log(`Current draw window : ${baseDateKey} +1d  ->  now (${formatInTimeZone(nowUTC, AEST, "yyyy-MM-dd")})`);

  const cycles = await MembershipRenewalCycle.find({
    billingReason: "subscription_cycle",
    dueAt: { $gte: drawStartUTC, $lt: nowUTC },
  })
    .select("userId status")
    .lean<Array<{ userId: mongoose.Types.ObjectId; status: string }>>();

  const renewedUsers = new Set<string>();
  const failedUsers = new Set<string>();
  for (const c of cycles) {
    const uid = c.userId.toString();
    if (c.status === "succeeded" || c.status === "recovered") renewedUsers.add(uid);
    else if (c.status === "failed") failedUsers.add(uid);
  }
  for (const u of renewedUsers) failedUsers.delete(u);

  const renewed = renewedUsers.size;
  const failedInDunning = failedUsers.size; // simplified: treat all unresolved failed as pending for in-progress draw
  const expectedRemaining = Math.max(0, baseActive - renewed - failedInDunning);

  console.log("\n  Renewed so far        :", renewed, `(${pct(renewed, baseActive)} of base)`);
  console.log("  Pending (failed/dunning):", failedInDunning);
  console.log("  Expected to renew     :", expectedRemaining, `(${pct(expectedRemaining, baseActive)} of base)`);
  console.log("\n  => Current Draw card: \"" + pct(renewed, baseActive) + " renewed, " + expectedRemaining + " expected\"");
  console.log("=".repeat(72));
}

/**
 * Last-draw renewal rate with base = active + past-due at the draw's first day, and
 * numerator = renewal PAYMENTS landing inside the draw (by succeededAt) — matching the
 * revenue card's renewal count and crediting sleeper recoveries. Rate cannot exceed 100%.
 */
async function lastDrawReport() {
  const SUBSCRIPTION_PACKAGE_IDS = ["tradie-subscription", "foreman-subscription", "boss-subscription"];

  const draws = await MajorDraw.find({ status: "completed" }).sort({ drawDate: -1 }).limit(2).select("activationDate drawDate name").lean<Array<{ activationDate?: Date; drawDate?: Date; name?: string }>>();
  const lastDraw = draws[0];
  if (!lastDraw?.activationDate || !lastDraw?.drawDate) throw new Error("No completed draw.");

  const firstDayKey = formatInTimeZone(lastDraw.activationDate, AEST, "yyyy-MM-dd"); // Apr 28
  const endKey = formatInTimeZone(lastDraw.drawDate, AEST, "yyyy-MM-dd"); // May 27
  const startUTC = aestDayBounds(firstDayKey).dayStartUTC;
  const endExclusiveUTC = aestDayBounds(endKey).dayEndUTC;

  // Base snapshot: try first day, else nearest available day forward.
  let baseSnaps = await MembershipDailySnapshot.find({ date: firstDayKey, packageId: { $in: SUBSCRIPTION_PACKAGE_IDS } }).select("activeCount pastDueCount").lean<Array<{ activeCount: number; pastDueCount: number }>>();
  let baseDateUsed = firstDayKey;
  if (baseSnaps.length === 0) {
    const nearest = await MembershipDailySnapshot.findOne({ date: { $gte: firstDayKey }, packageId: { $in: SUBSCRIPTION_PACKAGE_IDS } }).sort({ date: 1 }).select("date").lean<{ date?: string }>();
    if (nearest?.date) {
      baseDateUsed = nearest.date;
      baseSnaps = await MembershipDailySnapshot.find({ date: nearest.date, packageId: { $in: SUBSCRIPTION_PACKAGE_IDS } }).select("activeCount pastDueCount").lean<Array<{ activeCount: number; pastDueCount: number }>>();
    }
  }
  const active = baseSnaps.reduce((s, r) => s + (r.activeCount ?? 0), 0);
  const pastDue = baseSnaps.reduce((s, r) => s + (r.pastDueCount ?? 0), 0);
  const baseAll = active + pastDue;

  // Numerator: distinct users who renewed (succeeded) with payment landing in the draw.
  const paid = await MembershipRenewalCycle.find({ billingReason: "subscription_cycle", status: { $in: ["succeeded", "recovered"] }, succeededAt: { $gte: startUTC, $lt: endExclusiveUTC } }).select("userId").lean<Array<{ userId: mongoose.Types.ObjectId }>>();
  const renewedByPayment = new Set(paid.map((c) => c.userId.toString())).size;

  // For comparison: numerator by dueAt-in-draw (the "due cohort" view).
  const due = await MembershipRenewalCycle.find({ billingReason: "subscription_cycle", status: { $in: ["succeeded", "recovered"] }, dueAt: { $gte: startUTC, $lt: endExclusiveUTC } }).select("userId").lean<Array<{ userId: mongoose.Types.ObjectId }>>();
  const renewedByDue = new Set(due.map((c) => c.userId.toString())).size;

  console.log("=".repeat(72));
  console.log(`LAST DRAW RENEWAL RATE — "${lastDraw.name}" (${firstDayKey} -> ${endKey})`);
  console.log("=".repeat(72));
  console.log(`Base snapshot day used : ${baseDateUsed}  (requested first day ${firstDayKey})`);
  console.log(`Base = active + past-due: ${baseAll}   (${active} active + ${pastDue} past-due)`);
  console.log("");
  console.log(`Renewed (payment in draw): ${renewedByPayment}`);
  console.log(`Renewed (due in draw)    : ${renewedByDue}   (for comparison)`);
  console.log("");
  console.log(`RATE vs active-only base (${active})        : ${pct(renewedByPayment, active)}   <- can exceed 100% via sleepers`);
  console.log(`RATE vs active+past-due base (${baseAll})   : ${pct(renewedByPayment, baseAll)}   <- recommended, capped <=100%`);
  console.log("=".repeat(72));
}

async function main() {
  await connectDB();

  if (process.argv.includes("--coverage")) {
    await coverageReport();
    await mongoose.disconnect();
    return;
  }

  if (process.argv.includes("--draw")) {
    await drawProgressReport();
    await mongoose.disconnect();
    return;
  }

  if (process.argv.includes("--last-draw")) {
    await lastDrawReport();
    await mongoose.disconnect();
    return;
  }

  const { startKey, endKey, label } = await resolveRange();
  const startUTC = aestDayBounds(startKey).dayStartUTC;
  const endExclusiveUTC = aestDayBounds(endKey).dayEndUTC; // midnight AEST of day AFTER end => exclusive upper bound

  console.log("=".repeat(72));
  console.log(`RENEWAL RATE AUDIT  (${label})`);
  console.log(`AEST range : ${startKey} 00:00  ->  ${endKey} 23:59  (inclusive)`);
  console.log(`UTC window : ${startUTC.toISOString()}  ->  ${endExclusiveUTC.toISOString()} (exclusive)`);
  console.log("=".repeat(72));

  // ---- 1. Renewal cycles DUE in range -------------------------------------
  const cycles = await MembershipRenewalCycle.find({
    dueAt: { $gte: startUTC, $lt: endExclusiveUTC },
  })
    .select("userId status dueAt failedAt succeededAt billingReason amountDueCents amountPaidCents")
    .lean<
      Array<{
        userId: mongoose.Types.ObjectId;
        status: string;
        dueAt: Date;
        failedAt?: Date;
        succeededAt?: Date;
        billingReason?: string;
        amountDueCents: number;
        amountPaidCents?: number;
      }>
    >();

  console.log(`\n[1] MembershipRenewalCycle rows with dueAt in range: ${cycles.length}`);
  console.log("    status distribution :", countBy(cycles, (c) => c.status));
  console.log("    billingReason dist. :", countBy(cycles, (c) => c.billingReason ?? "(none)"));

  // Per-user classification from cycles. Priority within a user: succeeded > failed.
  const userCycleStatus = new Map<string, "succeeded" | "failed">();
  for (const c of cycles) {
    const uid = c.userId.toString();
    if (c.status === "succeeded" || c.status === "recovered") {
      userCycleStatus.set(uid, "succeeded");
    } else if (c.status === "failed" && userCycleStatus.get(uid) !== "succeeded") {
      userCycleStatus.set(uid, "failed");
    }
  }
  const succeededUserIds = [...userCycleStatus].filter(([, s]) => s === "succeeded").map(([u]) => u);
  const failedUserIds = [...userCycleStatus].filter(([, s]) => s === "failed").map(([u]) => u);

  // ---- 2. Derive outcome of FAILED cycles ---------------------------------
  // (a) recovered: user has any succeeded cycle AFTER the failed one
  // (b) otherwise inspect latest status-history: past_due/unpaid => pending,
  //     active/trialing => recovered, else => involuntary churn
  const failedObjIds = failedUserIds.map((u) => new mongoose.Types.ObjectId(u));

  const laterSucceeded = await MembershipRenewalCycle.find({
    userId: { $in: failedObjIds },
    status: { $in: ["succeeded", "recovered"] },
  })
    .select("userId succeededAt")
    .lean<Array<{ userId: mongoose.Types.ObjectId; succeededAt?: Date }>>();
  const recoveredViaCycle = new Set(laterSucceeded.map((c) => c.userId.toString()));

  // latest status-history per still-failed user
  const stillFailed = failedUserIds.filter((u) => !recoveredViaCycle.has(u));
  const stillFailedObjIds = stillFailed.map((u) => new mongoose.Types.ObjectId(u));
  const latestStatusRows = await MembershipStatusHistory.aggregate<{
    _id: mongoose.Types.ObjectId;
    membershipStatus: string;
  }>([
    { $match: { userId: { $in: stillFailedObjIds } } },
    { $sort: { effectiveAt: -1 } },
    { $group: { _id: "$userId", membershipStatus: { $first: "$membershipStatus" } } },
  ]);
  const latestStatus = new Map(latestStatusRows.map((r) => [r._id.toString(), r.membershipStatus]));

  let recoveredViaStatus = 0;
  let pending = 0;
  let involuntary = 0;
  for (const u of stillFailed) {
    const s = latestStatus.get(u);
    if (s === "active" || s === "trialing") recoveredViaStatus += 1;
    else if (s === "past_due" || s === "unpaid") pending += 1;
    else involuntary += 1; // canceled / scheduled_cancel / none / unknown
  }

  const renewedFromCycles = succeededUserIds.length + recoveredViaCycle.size + recoveredViaStatus;

  // ---- 3. Voluntary churn: period ended in range, no renewal invoice ------
  const cycleUserIds = new Set([...userCycleStatus.keys()]);
  const voluntaryRows = await MembershipStatusHistory.find({
    membershipStatus: { $in: ["scheduled_cancel", "canceled"] },
    endDate: { $gte: startUTC, $lt: endExclusiveUTC },
  })
    .select("userId membershipStatus endDate")
    .lean<Array<{ userId: mongoose.Types.ObjectId; membershipStatus: string; endDate?: Date }>>();
  const voluntaryUserIds = new Set<string>();
  for (const r of voluntaryRows) {
    const uid = r.userId.toString();
    if (!cycleUserIds.has(uid)) voluntaryUserIds.add(uid); // exclude anyone who had a cycle (already classified)
  }
  const voluntary = voluntaryUserIds.size;

  // ---- 4. Roll up ----------------------------------------------------------
  const renewed = renewedFromCycles;
  const churned = involuntary + voluntary;
  const due = renewed + churned; // pending excluded from headline rate
  const dueIncludingPending = due + pending;

  console.log(`\n[2] Failed-cycle resolution (${failedUserIds.length} users with a failed cycle, no later success):`);
  console.log(`    recovered via later succeeded cycle : ${recoveredViaCycle.size}`);
  console.log(`    recovered via return-to-active      : ${recoveredViaStatus}`);
  console.log(`    pending (still past_due/unpaid)     : ${pending}`);
  console.log(`    involuntary churn (failed + gone)   : ${involuntary}`);

  console.log(`\n[3] Voluntary churn (period ended in range, no renewal invoice): ${voluntary}`);
  console.log(`    raw {scheduled_cancel|canceled} endDate-in-range rows: ${voluntaryRows.length}`);

  console.log("\n" + "-".repeat(72));
  console.log("RENEWAL COHORT (distinct users, disjoint buckets)");
  console.log("-".repeat(72));
  console.log(`  Renewed              : ${renewed}`);
  console.log(`    - succeeded cycle  : ${succeededUserIds.length}`);
  console.log(`    - recovered (cycle): ${recoveredViaCycle.size}`);
  console.log(`    - recovered (stat) : ${recoveredViaStatus}`);
  console.log(`  Churned (involuntary): ${involuntary}`);
  console.log(`  Churned (voluntary)  : ${voluntary}`);
  console.log(`  --------------------------------------`);
  console.log(`  Due (resolved)       : ${due}`);
  console.log(`  Pending (in dunning) : ${pending}   <- excluded from headline rate`);
  console.log("\n" + "=".repeat(72));
  console.log(`  RENEWAL RATE (resolved cohort)        : ${pct(renewed, due)}   [${renewed}/${due}]`);
  console.log(`  RENEWAL RATE (pending counted as lost): ${pct(renewed, dueIncludingPending)}   [${renewed}/${dueIncludingPending}]`);
  console.log("=".repeat(72));

  // ---- 5. Data-quality gap report -----------------------------------------
  const recoveredStatusCount = cycles.filter((c) => c.status === "recovered").length;
  const expectedStatusCount = cycles.filter((c) => c.status === "expected").length;
  console.log(`\n[data-quality] cycles with status="recovered" stored: ${recoveredStatusCount}`);
  console.log(`[data-quality] cycles with status="expected" stored : ${expectedStatusCount}`);
  console.log(`[data-quality] recoveries we had to DERIVE           : ${recoveredViaCycle.size + recoveredViaStatus}`);
  console.log("               (if derived >> stored, the 'recovered' status is not being written)");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("find-renewal-rate failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
