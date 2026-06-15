/**
 * A/B Testing Engagement Rollup Cron
 *
 * Rolls page_view / click VOLUME (and a revenue snapshot) into the durable
 * `ExperimentDailyMetrics` so engagement history survives the raw-event TTL.
 *
 * NOTE (2026-06 redesign): conversion + revenue are no longer reconstructed from
 * these rolled-up counts — they are computed live, per-user, from the durable
 * assignment + PaymentEvent tables (see `ExperimentMetricsService`). This rollup
 * now exists only for engagement diagnostics (page views, clicks, CTR).
 *
 * Durability guarantees (fixes finding H4 — cron single-day-window + no auth + TTL loss):
 * 1. AUTH: gated by `CRON_SECRET` (Vercel cron sends `Authorization: Bearer …`).
 * 2. SELF-HEALING: re-aggregates the last `CATCHUP_DAYS` days every run with an
 *    idempotent `$set` upsert, so a missed/failed day is repaired on the next run.
 * 3. RETENTION HEADROOM: raw events live 30 days (the model TTL), far longer than
 *    the 7-day catch-up window, so a day can never be TTL-deleted before the
 *    catch-up has had many runs to roll it up. (Matched here, not lengthened, so
 *    no prod `collMod` TTL migration is required.)
 * 4. PREVIEW EXCLUSION: admin preview page_views (`metadata.isPreview`) are
 *    excluded from the rolled-up counts (finding M1).
 *
 * Cron Schedule: daily (see vercel.json).
 */

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ExperimentEvent from "@/models/ab-testing/ExperimentEvent";
import ExperimentDailyMetricsRepository from "@/repositories/ab-testing/ExperimentDailyMetricsRepository";
import { aggregateNetRevenueSumWithMatch } from "@/utils/payment/payment-event-net-queries";
import mongoose from "mongoose";
import { waitForPoolCapacity } from "@/utils/database/connection-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Re-roll this many trailing days each run, so a missed day self-heals. */
const CATCHUP_DAYS = 7;
/** Matches the ExperimentEvent model TTL (30d). Far exceeds the catch-up window,
 *  so a day is always rolled up long before it is eligible for deletion. */
const EVENT_RETENTION_DAYS = 30;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // local dev / unset → allow (matches sibling crons)
  return authHeader === `Bearer ${cronSecret}`;
}

/** Exclude admin preview events from every rolled-up count. */
const NOT_PREVIEW = { "metadata.isPreview": { $ne: true } };

function utcDayBounds(daysAgo: number): { start: Date; end: Date } {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysAgo);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** Aggregate + upsert one (experiment, variant, day). Idempotent. Returns events rolled. */
async function rollupCombo(
  experimentId: string,
  variantId: string,
  start: Date,
  end: Date
): Promise<number> {
  const aggregated = await ExperimentEvent.aggregate([
    {
      $match: {
        experimentId: new mongoose.Types.ObjectId(experimentId),
        variantId: new mongoose.Types.ObjectId(variantId),
        timestamp: { $gte: start, $lte: end },
        ...NOT_PREVIEW,
      },
    },
    {
      $group: {
        _id: null,
        pageViews: { $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] } },
        clicks: { $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] } },
        conversions: { $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] } },
        leads: { $sum: { $cond: [{ $eq: ["$eventType", "lead"] }, 1, 0] } },
        purchases: { $sum: { $cond: [{ $eq: ["$eventType", "purchase"] }, 1, 0] } },
        uniqueVisitorsSet: {
          $addToSet: {
            $cond: [{ $ifNull: ["$userId", false] }, { $toString: "$userId" }, "$anonymousId"],
          },
        },
        eventCount: { $sum: 1 },
      },
    },
    {
      $project: {
        pageViews: 1,
        clicks: 1,
        conversions: 1,
        leads: 1,
        purchases: 1,
        uniqueVisitors: { $size: "$uniqueVisitorsSet" },
        eventCount: 1,
      },
    },
  ]).exec();

  const metrics = aggregated[0];
  if (!metrics || metrics.eventCount === 0) return 0;

  const revenue = await aggregateNetRevenueSumWithMatch({
    experimentId,
    variantId,
    timestamp: { $gte: start, $lte: end },
  });

  await ExperimentDailyMetricsRepository.upsertDailyMetrics({
    experimentId,
    variantId,
    date: start,
    pageViews: metrics.pageViews,
    clicks: metrics.clicks,
    conversions: metrics.conversions,
    leads: metrics.leads,
    purchases: metrics.purchases,
    uniqueVisitors: metrics.uniqueVisitors,
    revenue,
  });

  return metrics.eventCount as number;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const logs: string[] = [];
  const results = { daysProcessed: 0, combosRolled: 0, eventsAggregated: 0, eventsDeleted: 0, errors: 0 };

  try {
    console.log("🕐 A/B engagement rollup cron started", new Date().toISOString());
    await connectDB();
    const hasCapacity = await waitForPoolCapacity(80, 10000);
    if (!hasCapacity) console.warn("⚠️ Connection pool near capacity; proceeding");

    // Self-healing: re-roll the last CATCHUP_DAYS days (idempotent upserts).
    for (let daysAgo = 1; daysAgo <= CATCHUP_DAYS; daysAgo++) {
      const { start, end } = utcDayBounds(daysAgo);
      const combos = await ExperimentEvent.aggregate([
        { $match: { timestamp: { $gte: start, $lte: end }, ...NOT_PREVIEW } },
        { $group: { _id: { experimentId: "$experimentId", variantId: "$variantId" } } },
      ]).exec();

      for (const combo of combos) {
        try {
          const rolled = await rollupCombo(
            combo._id.experimentId.toString(),
            combo._id.variantId.toString(),
            start,
            end
          );
          if (rolled > 0) {
            results.combosRolled++;
            results.eventsAggregated += rolled;
          }
        } catch (error) {
          results.errors++;
          console.error("❌ rollup combo failed:", error);
        }
      }
      results.daysProcessed++;
    }

    // Delete raw events older than retention (strictly > catch-up window, so a day
    // is always rolled up before it can be deleted). TTL also enforces this.
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - EVENT_RETENTION_DAYS);
    cutoff.setUTCHours(0, 0, 0, 0);
    const deleteResult = await ExperimentEvent.deleteMany({ timestamp: { $lt: cutoff } }).exec();
    results.eventsDeleted = deleteResult.deletedCount || 0;

    const duration = Date.now() - startTime;
    console.log(`✅ A/B rollup done in ${duration}ms`, results);
    return NextResponse.json({ success: true, duration: `${duration}ms`, results, logs }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ A/B rollup cron failed:", error);
    return NextResponse.json(
      { success: false, error: errorMessage, results, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

// Manual trigger (also gated).
export async function POST(request: NextRequest) {
  return GET(request);
}
