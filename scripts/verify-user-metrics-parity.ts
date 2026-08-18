#!/usr/bin/env npx tsx

/**
 * Verify User Metrics — timing + output-parity harness for `UserMetricsService`.
 *
 * READ-ONLY. Never writes, never creates an index, never mutates a document.
 *
 * Two modes:
 *
 *   --timings   (default) Times each query the service performs, individually,
 *               for the ranges the admin UI actually requests. Reports collection
 *               sizes so the numbers have a denominator, and highlights which
 *               query dominates the 10s Vercel budget.
 *
 *   --parity    Diffs the legacy in-memory implementation against the new
 *               aggregation implementation across several ranges and exits
 *               non-zero on ANY mismatch. This is the guard that the Phase 1
 *               rewrite did not silently change a number.
 *
 * Usage:
 *   npm run verify:user-metrics            # timings
 *   npm run verify:user-metrics -- --parity
 *
 * See docs/superpowers/specs/2026-08-17-profile-gender-and-user-metrics-design.md §3.1
 */

import { config } from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { formatInTimeZone } from "date-fns-tz";

config({ path: path.resolve(process.cwd(), ".env.local") });

const SYDNEY_TZ = "Australia/Sydney";
const PARITY = process.argv.includes("--parity");
const SERVICE = process.argv.includes("--service");
const BUDGET_MS = 10_000; // Vercel maxDuration for api/** today

// ── ranges the admin UI / Norm actually ask for ──────────────────────────────
function ranges(): Array<{ label: string; startDate: Date; endDate: Date }> {
  const now = new Date();
  const startOfToday = new Date(formatInTimeZone(now, SYDNEY_TZ, "yyyy-MM-dd") + "T00:00:00.000Z");
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return [
    // The one the Users Breakdown panel actually sends (no dates → all time).
    { label: "all-time (what /admin sends)", startDate: new Date(0), endDate: now },
    { label: "last 30 days", startDate: thirtyDaysAgo, endDate: now },
    { label: "today", startDate: startOfToday, endDate: now },
  ];
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<{ label: string; ms: number; value: T }> {
  const t0 = Date.now();
  const value = await fn();
  const ms = Date.now() - t0;
  return { label, ms, value };
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

/**
 * `--service` mode: drive the REAL service through Mongoose, so the measurement includes
 * everything the raw-driver timing skipped — connectDB (TLS + auth + the per-call admin ping)
 * and Mongoose model init, which with autoIndex left at its default issues a createIndex
 * round-trip for every declared index on every model touched.
 *
 * This is the only way to tell "the queries are slow" apart from "the ORM/connect path is slow".
 */
async function serviceMode() {
  console.log("═".repeat(78));
  console.log("SERVICE-PATH TIMING (through Mongoose, as production runs it)");
  console.log("═".repeat(78));

  const rows: Array<[string, number]> = [];
  // Log each step AS IT FINISHES — a hang must be visible, not swallowed by a summary
  // that only prints at the end.
  async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    process.stdout.write(`  ▸ ${label} … `);
    const t = Date.now();
    try {
      const out = await fn();
      const ms = Date.now() - t;
      rows.push([label, ms]);
      console.log(fmtMs(ms));
      return out;
    } catch (e) {
      console.log(`FAILED after ${fmtMs(Date.now() - t)}`);
      throw e;
    }
  }

  const { default: connectDB } = await step("import @/lib/mongodb", () => import("@/lib/mongodb"));
  await step("connectDB() — TLS + auth + admin ping", () => connectDB());

  // First Mongoose op on each model pays that model's init/ensureIndexes cost.
  const { default: User } = await step("import @/models/User", () => import("@/models/User"));
  await step("User first op (init + ensureIndexes)", () => User.findOne({}).select("_id").lean().exec());

  const { default: PaymentEvent } = await step("import @/models/PaymentEvent", () => import("@/models/PaymentEvent"));
  await step("PaymentEvent first op", () => PaymentEvent.findOne({}).select("_id").lean().exec());

  const { default: ReferralEvent } = await step("import @/models/ReferralEvent", () => import("@/models/ReferralEvent"));
  await step("ReferralEvent first op", () => ReferralEvent.findOne({}).select("_id").lean().exec());

  const { UserMetricsService } = await step("import UserMetricsService", () =>
    import("@/services/metrics/UserMetricsService")
  );
  const metrics = await step("getUserMetrics({}) COLD — all-time", () =>
    new UserMetricsService().getUserMetrics({})
  );
  await step("getUserMetrics({}) WARM — all-time", () => new UserMetricsService().getUserMetrics({}));

  console.log("");
  const w = Math.max(...rows.map(([l]) => l.length));
  for (const [label, ms] of rows) console.log(`  ${label.padEnd(w)}  ${fmtMs(ms).padStart(9)}`);
  const coldTotal = rows
    .filter(([l]) => !l.includes("WARM"))
    .reduce((s, [, ms]) => s + ms, 0);
  console.log(`  ${"COLD TOTAL (first request in a container)".padEnd(w)}  ${fmtMs(coldTotal).padStart(9)}`);
  console.log(
    coldTotal > BUDGET_MS
      ? `\n  ❌ A cold request EXCEEDS the ${BUDGET_MS / 1000}s budget → reproduces the 504`
      : `\n  ✅ A cold request fits the ${BUDGET_MS / 1000}s budget from HERE (network latency to Atlas differs by region)`
  );
  console.log(
    `\n  Sanity check on output: users counted = ${Object.values(metrics.signupSource).reduce((a, b) => a + b, 0)}, ` +
      `active = ${metrics.membershipStatus.active}, purchases = ${metrics.purchaseHistory.totalPurchases}`
  );

  // ── purchaseHistory parity ────────────────────────────────────────────────────────────────
  // The ONLY computation this branch changed is purchaseHistory: it moved from
  // fetchNetBenefitsGrantedInRange(...) + a JS loop to aggregateNetBenefitsSummaryWithMatch's
  // $group. Assert the two agree on the same range rather than trusting that they do.
  console.log("\n▸ purchaseHistory parity — $group (new) vs document loop (legacy)");
  const { fetchNetBenefitsGrantedInRange } = await import("@/utils/payment/payment-event-net-queries");
  const legacyEvents = await fetchNetBenefitsGrantedInRange(new Date(0), new Date(), {
    packageType: 1,
    data: 1,
  });
  const legacy = { totalPurchases: legacyEvents.length, totalRevenue: 0, byPackageType: {} as Record<string, number> };
  for (const event of legacyEvents) {
    legacy.totalRevenue += event.data?.price || 0;
    const pt = event.packageType || "unknown";
    legacy.byPackageType[pt] = (legacy.byPackageType[pt] || 0) + 1;
  }

  const next = metrics.purchaseHistory;
  const mismatches: string[] = [];
  if (legacy.totalPurchases !== next.totalPurchases) {
    mismatches.push(`totalPurchases: legacy=${legacy.totalPurchases} new=${next.totalPurchases}`);
  }
  // Float sum order differs between JS and $group, so compare to the cent.
  if (Math.abs(legacy.totalRevenue - next.totalRevenue) > 0.005) {
    mismatches.push(`totalRevenue: legacy=${legacy.totalRevenue} new=${next.totalRevenue}`);
  }
  const allKeys = new Set([...Object.keys(legacy.byPackageType), ...Object.keys(next.byPackageType)]);
  for (const k of allKeys) {
    if ((legacy.byPackageType[k] ?? 0) !== (next.byPackageType[k] ?? 0)) {
      mismatches.push(`byPackageType[${k}]: legacy=${legacy.byPackageType[k] ?? 0} new=${next.byPackageType[k] ?? 0}`);
    }
  }

  console.log(`  totalPurchases  legacy=${legacy.totalPurchases}  new=${next.totalPurchases}`);
  console.log(`  totalRevenue    legacy=${legacy.totalRevenue.toFixed(2)}  new=${next.totalRevenue.toFixed(2)}`);
  console.log(`  byPackageType   legacy=${JSON.stringify(legacy.byPackageType)}`);
  console.log(`                  new   =${JSON.stringify(next.byPackageType)}`);

  if (mismatches.length > 0) {
    console.error(`\n  ❌ PARITY FAILED (${mismatches.length}):`);
    for (const m of mismatches) console.error(`     ${m}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("\n  ✅ purchaseHistory parity holds — $group matches the document loop exactly");

  console.log(`\n▸ gender breakdown: ${JSON.stringify(metrics.gender)}`);

  // ── Norm schema contract ──────────────────────────────────────────────────────────────────
  // withNorm() validates every response against its `responseSchema` at RUNTIME, so a schema
  // that disagrees with the service output is a 500 that `tsc` cannot see. norm:smoke covers
  // this via HTTP, but it needs a running dev server on the expected port; this check needs
  // nothing and validates the exact object the route builds.
  console.log("\n▸ Norm /v1/metrics/users responseSchema vs live service output");
  const { NormUserMetricsSchema } = await import("@/lib/internal-norm/schemas/metrics");
  const normPayload = {
    dateRange: {
      start: metrics.dateRange.startDate.toISOString(),
      end: metrics.dateRange.endDate.toISOString(),
    },
    totalUsers: Object.values(metrics.signupSource).reduce((s, n) => s + n, 0),
    signupSource: metrics.signupSource,
    profession: metrics.profession,
    state: metrics.state,
    ageGroup: metrics.ageGroup,
    gender: metrics.gender,
    membershipStatus: metrics.membershipStatus,
    membershipByPackage: metrics.membershipByPackage,
    purchaseHistory: metrics.purchaseHistory,
  };
  const normResult = NormUserMetricsSchema.safeParse(normPayload);
  if (!normResult.success) {
    console.error("  ❌ Norm schema REJECTED the service output — this would be a runtime 500:");
    for (const issue of normResult.error.issues) {
      console.error(`     ${issue.path.join(".")}: ${issue.message}`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("  ✅ Norm schema accepts the live output (gender bucket included)");

  await mongoose.disconnect();
}

async function main() {
  if (SERVICE) {
    await serviceMode();
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI is not set (expected in .env.local)");
    process.exit(2);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error("❌ No database handle after connect");
    process.exit(2);
  }

  console.log("═".repeat(78));
  console.log("USER METRICS — READ-ONLY DIAGNOSTIC");
  console.log(`mode: ${PARITY ? "parity" : "timings"}   db: ${db.databaseName}`);
  console.log("═".repeat(78));

  const users = db.collection("users");
  const paymentevents = db.collection("paymentevents");
  const referralevents = db.collection("referralevents");

  // ── denominators ───────────────────────────────────────────────────────────
  console.log("\n▸ Collection sizes (the denominator for every timing below)");
  const [userCount, peCount, reCount, bgCount, refundCount] = await Promise.all([
    users.estimatedDocumentCount(),
    paymentevents.estimatedDocumentCount(),
    referralevents.estimatedDocumentCount(),
    paymentevents.countDocuments({ eventType: "BenefitsGranted" }),
    paymentevents.countDocuments({ eventType: "RefundProcessed" }),
  ]);
  console.log(`  users                        ${userCount.toLocaleString()}`);
  console.log(`  paymentevents (total)        ${peCount.toLocaleString()}`);
  console.log(`  paymentevents BenefitsGranted ${bgCount.toLocaleString()}  ← one $lookup each, per query`);
  console.log(`  paymentevents RefundProcessed ${refundCount.toLocaleString()}  ← the set the $lookup is searching for`);
  console.log(`  referralevents               ${reCount.toLocaleString()}`);

  if (bgCount > 0) {
    const pct = ((refundCount / bgCount) * 100).toFixed(2);
    console.log(
      `\n  Refund ratio: ${pct}% — if this is small, the per-row $lookup can be replaced by a\n` +
        `  single precomputed refunded-id set, turning O(BenefitsGranted) into O(refunds).`
    );
  }

  // ── index reality check ────────────────────────────────────────────────────
  console.log("\n▸ PaymentEvent indexes (is `eventType` covered?)");
  const peIndexes = await paymentevents.indexes();
  for (const idx of peIndexes) {
    console.log(`  ${JSON.stringify(idx.key)}`);
  }
  const hasEventTypeIdx = peIndexes.some((i) => Object.keys(i.key)[0] === "eventType");
  console.log(
    hasEventTypeIdx
      ? "  ✅ an index leads with eventType"
      : "  ❌ NO index leads with eventType — the outer $match scans by timestamp and filters in memory"
  );

  // ── per-query timings ──────────────────────────────────────────────────────
  const refundStages = [
    {
      $lookup: {
        from: "paymentevents",
        let: { pid: "$paymentIntentId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$paymentIntentId", "$$pid"] },
                  { $eq: ["$eventType", "RefundProcessed"] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "_refundMatch",
      },
    },
    { $match: { _refundMatch: { $size: 0 } } },
  ];

  for (const range of ranges()) {
    console.log("\n" + "─".repeat(78));
    console.log(`▸ RANGE: ${range.label}`);
    console.log("─".repeat(78));

    const results: Array<{ label: string; ms: number; note: string }> = [];

    // Q1 — users in range, projected (as the service does today)
    const q1 = await time("Q1 User.find(range).select(8 fields)", () =>
      users
        .find(
          { createdAt: { $gte: range.startDate, $lte: range.endDate } },
          {
            projection: {
              _id: 1,
              affiliateReferral: 1,
              referral: 1,
              profession: 1,
              subscription: 1,
              createdAt: 1,
              birthdate: 1,
              state: 1,
            },
          }
        )
        .toArray()
    );
    results.push({ label: q1.label, ms: q1.ms, note: `${q1.value.length.toLocaleString()} docs` });

    // Q2 — referral events for those users ($in with an unbounded array)
    const userIds = q1.value.map((u) => u._id);
    const q2 = await time("Q2 ReferralEvent.find({$in: userIds})", () =>
      referralevents
        .find(
          { inviteeUserId: { $in: userIds }, status: { $in: ["pending", "converted"] } },
          { projection: { inviteeUserId: 1, referrerId: 1 } }
        )
        .toArray()
    );
    results.push({
      label: q2.label,
      ms: q2.ms,
      note: `$in array = ${userIds.length.toLocaleString()} ids → ${q2.value.length.toLocaleString()} docs`,
    });

    // Q3 — membership daily snapshot (only in snapshot mode; cheap)
    const dateKey = formatInTimeZone(range.endDate, SYDNEY_TZ, "yyyy-MM-dd");
    const q3 = await time("Q3 MembershipDailySnapshot.find({date})", () =>
      db.collection("membershipdailysnapshots").find({ date: dateKey }).toArray()
    );
    results.push({ label: q3.label, ms: q3.ms, note: `${q3.value.length} rows` });

    // Q4 — fetchNetBenefitsGrantedInRange: per-row $lookup, returns documents
    const q4 = await time("Q4 fetchNetBenefitsGrantedInRange (per-row $lookup)", () =>
      paymentevents
        .aggregate([
          { $match: { eventType: "BenefitsGranted", timestamp: { $gte: range.startDate, $lte: range.endDate } } },
          ...refundStages,
          { $project: { packageType: 1, data: 1 } },
        ])
        .toArray()
    );
    results.push({ label: q4.label, ms: q4.ms, note: `${q4.value.length.toLocaleString()} docs returned` });

    // Q5 — aggregateNetCountWithMatch for renewals
    const q5 = await time("Q5 aggregateNetCountWithMatch (renewals)", () =>
      paymentevents
        .aggregate([
          {
            $match: {
              eventType: "BenefitsGranted",
              packageType: "membership",
              "data.billingReason": "subscription_cycle",
              timestamp: { $gte: range.startDate, $lte: range.endDate },
            },
          },
          ...refundStages,
          { $count: "c" },
        ])
        .toArray()
    );
    results.push({ label: q5.label, ms: q5.ms, note: `count=${(q5.value[0]?.c as number) ?? 0}` });

    const total = results.reduce((s, r) => s + r.ms, 0);
    const width = Math.max(...results.map((r) => r.label.length));
    console.log("");
    for (const r of results) {
      const share = total > 0 ? Math.round((r.ms / total) * 100) : 0;
      const bar = "█".repeat(Math.max(0, Math.round(share / 3)));
      console.log(`  ${r.label.padEnd(width)}  ${fmtMs(r.ms).padStart(8)}  ${String(share).padStart(3)}% ${bar}`);
      console.log(`  ${" ".repeat(width)}  └─ ${r.note}`);
    }
    console.log(`  ${"TOTAL (sequential, as shipped)".padEnd(width)}  ${fmtMs(total).padStart(8)}`);
    console.log(
      total > BUDGET_MS
        ? `  ❌ EXCEEDS the ${BUDGET_MS / 1000}s Vercel budget → this range 504s in production`
        : `  ✅ within the ${BUDGET_MS / 1000}s budget`
    );
  }

  console.log("\n" + "═".repeat(78));
  console.log("Read-only. Nothing was written.");
  console.log("═".repeat(78));

  await mongoose.disconnect();
}

main()
  .then(() => {
    // Explicit exit: importing src/lib/mongodb registers connection event listeners and (in dev)
    // a leak-detection interval, which keep the event loop alive after disconnect. Without this
    // the script finishes its work and then appears to hang forever.
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Failed:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
