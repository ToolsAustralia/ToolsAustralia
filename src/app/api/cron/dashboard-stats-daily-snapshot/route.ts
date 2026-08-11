import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { writeSlidingWindow } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TZ = "Australia/Sydney";
const SLIDING_WINDOW_DAYS = 90;

/**
 * WHY THIS CRON RUNS THREE TIMES A DAY — the schedule is load-bearing, not redundancy.
 *
 * `vercel.json` schedules this at **14:00, 15:00 and 03:20 UTC**. The first two write the
 * AEST day that has just closed (an AEST day ends at 14:00 UTC); the third exists to CORRECT
 * it, and removing it silently breaks the Advertising card.
 *
 * The problem it fixes (found 2026-08-11): `sync-tiktok-ads` runs at **02:45 UTC**, ~12¾
 * hours AFTER the 14:00 snapshot for the day it completes. TikTok keeps attributing
 * conversions well past midnight — its ad sets here run 7-day-click / 1-day-view — so the
 * 14:00 snapshot always captures TikTok mid-attribution and freezes a partial figure.
 *
 * Measured on production for AEST 2026-08-10:
 *
 *   snapshot written 15:01 UTC   spend $386.82  revenue $40.00  ROAS 0.103
 *   actual TikTok data           spend $410.93  revenue $90.00  ROAS 0.219
 *
 * Every older day matched exactly — only the freshest one was short, because it was the only
 * one snapshotted before TikTok had settled. That made the overview's "Yesterday" view — the
 * single most-read number on the card — systematically understate TikTok, every day, while
 * the history behind it looked perfectly correct.
 *
 * The 03:20 UTC run lands 35 minutes after `sync-tiktok-ads` starts (`maxDuration` 300s), so
 * the day is re-derived from TikTok's settled figures. This works because the write is a
 * 90-day SLIDING WINDOW and is fully idempotent: `mergeAdChannels` takes a successful fetch
 * over the stored value, and only PRESERVES the prior value when a provider errors — so a
 * re-run corrects a stale day and can never blank a good one.
 *
 * ⚠️ IF YOU MOVE `sync-tiktok-ads`, MOVE THIS TOO — it must stay after it. And do NOT "fix"
 * this by moving the TikTok sync earlier instead: before 14:00 UTC the AEST day has not
 * finished, so an earlier sync would record a genuinely incomplete day rather than a settled
 * one. Later is the only correct direction.
 */

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();

    const todayKey = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
    const results = await writeSlidingWindow({
      todayAESTDateKey: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
    });

    const failed = results.filter((r) => !r.ok);
    console.error("[cron dashboard-stats-daily-snapshot] complete", {
      today: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
      written: results.length - failed.length,
      failed: failed.length,
    });

    return NextResponse.json({
      ok: failed.length === 0,
      today: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
      written: results.length - failed.length,
      failed: failed.map((f) => ({ date: f.date, error: f.error })),
    });
  } catch (err) {
    console.error("[cron dashboard-stats-daily-snapshot] fatal:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
