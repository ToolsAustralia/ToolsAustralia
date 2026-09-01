import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import {
  writeSlidingWindow,
  resolveAdChannelRestatementWindowDays,
} from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TZ = "Australia/Sydney";
const SLIDING_WINDOW_DAYS = 90;

/**
 * WHY THIS CRON RUNS THREE TIMES A DAY — the schedule is load-bearing, not redundancy.
 *
 * The window it writes is the last 90 **COMPLETE** AEST days — the in-progress day is never a
 * member (`resolveSlidingWindowKeys`). It used to include today, which is what made the 03:20 UTC
 * fire (13:20 AEST) freeze a half-finished day; the reader then served that partial as soon as
 * the day rolled over. See the guard docblock on `writeSnapshotForDate`. A consequence worth
 * knowing: between 14:00 UTC (the AEST day closing) and the 17:30 UTC fire, the day that just
 * closed has NO snapshot, and the reader computes it live — correct, just slower.
 *
 * `vercel.json` schedules this at **17:30, 20:30 and 03:20 UTC** (moved off 14:00/15:00 UTC on
 * 2026-08-24 — see docs/infrastructure/gotchas.md — via a same-day, later-reverted 18:00/19:00
 * attempt that collided with the ad-sync crons' DST-gated schedule; see below). The first two
 * write the AEST day that has just closed (an AEST day ends at 14:00 UTC); the third exists to
 * CORRECT it, and removing it silently breaks the Advertising card.
 *
 * The problem it fixes (found 2026-08-11): `sync-tiktok-ads` settles a day well after this
 * snapshot's first two fires (it runs 3-hourly, gated to Sydney wall-clock slots
 * {3,6,9,12,15,18,21}:00 + 23:59, as of 2026-08-11 — see its own docblock). TikTok keeps
 * attributing conversions well past midnight — its ad sets here run 7-day-click / 1-day-view —
 * so an early snapshot always captures TikTok mid-attribution and freezes a partial figure.
 *
 * Measured on production for AEST 2026-08-10 (schedule at the time was 14:00/15:00 UTC):
 *
 *   snapshot written 15:01 UTC   spend $386.82  revenue $40.00  ROAS 0.103
 *   actual TikTok data           spend $410.93  revenue $90.00  ROAS 0.219
 *
 * Every older day matched exactly — only the freshest one was short, because it was the only
 * one snapshotted before TikTok had settled. That made the overview's "Yesterday" view — the
 * single most-read number on the card — systematically understate TikTok, every day, while
 * the history behind it looked perfectly correct.
 *
 * The 03:20 UTC run lands after `sync-tiktok-ads`'s slot runs have had time to settle
 * (`maxDuration` 300s), so the day is re-derived from TikTok's settled figures. This works
 * because the write is a 90-day SLIDING WINDOW and is fully idempotent: `mergeAdChannels` takes
 * a successful fetch over the stored value, and only PRESERVES the prior value when a provider
 * errors — so a re-run corrects a stale day and can never blank a good one.
 *
 * ⚠️ ONLY THE NEWEST ~10 DAYS ARE RE-FETCHED FROM THE AD PROVIDERS. All 90 days are still
 * written (revenue and user counts are local Mongo aggregates and cost no quota), but a day
 * outside `AD_CHANNEL_RESTATEMENT_WINDOW_DAYS` that already has stored `adChannels` reuses that
 * stored value instead of calling Meta. 90 days × 3 runs was ~270 Meta calls/day to rewrite
 * numbers that closed months ago, and it exhausted Meta's per-app hourly quota
 * ("Application request limit reached") 9–13×/day. A settled day with NO stored value is still
 * fetched — see `resolveAdChannelsForDate`. The correction described above is unaffected: the
 * day being corrected is yesterday, comfortably inside the window.
 *
 * ⚠️ IF YOU MOVE `sync-tiktok-ads`, MOVE THIS TOO — it must stay after it. And do NOT "fix"
 * this by moving the TikTok sync earlier instead: before 14:00 UTC the AEST day has not
 * finished, so an earlier sync would record a genuinely incomplete day rather than a settled
 * one. Later is the only correct direction.
 *
 * ⚠️ IF YOU MOVE THIS CRON'S FIRST TWO FIRES, avoid `sync-meta-ads`/`sync-tiktok-ads`'s
 * in-handler Sydney-slot gate in BOTH DST regimes (a `0 18`/`0 19` attempt shipped and reverted
 * the same day this note was written — `19:00 UTC` is the Sydney-06:00 AEDT slot). A `:30`
 * minute offset is structurally safe: that gate only fires at `localMinute === 0` or local
 * 23:59, so it can never match a `:30` UTC time regardless of DST regime.
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
    // adFetched / adReused are the ONLY visible proof the restatement window is working. If
    // adFetched creeps back toward `written`, every run is hammering Meta for days that closed
    // months ago — the shape that exhausted the Marketing API quota ~9–13×/day. `console.log`
    // is stripped from production builds, so this rides the existing console.error line.
    const adFetched = results.filter((r) => r.adChannelSource === "fetched").length;
    const adReused = results.filter((r) => r.adChannelSource === "reused").length;
    console.error("[cron dashboard-stats-daily-snapshot] complete", {
      today: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
      adRestatementWindowDays: resolveAdChannelRestatementWindowDays(),
      written: results.length - failed.length,
      adFetched,
      adReused,
      failed: failed.length,
    });

    return NextResponse.json({
      ok: failed.length === 0,
      today: todayKey,
      windowDays: SLIDING_WINDOW_DAYS,
      adRestatementWindowDays: resolveAdChannelRestatementWindowDays(),
      written: results.length - failed.length,
      adFetched,
      adReused,
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
