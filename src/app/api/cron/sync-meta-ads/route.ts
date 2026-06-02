import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import connectDB from "@/lib/mongodb";
import { runMetaSpendByUrlSync } from "@/services/meta/runMetaSpendByUrlSync";
import { formatDateForFacebook } from "@/lib/facebook-marketing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const TZ = "Australia/Sydney";

/**
 * Target Sydney-local (AEST/AEDT) wall-clock slots the product owner wants the
 * Meta spend-by-url sync to run at: 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm and 11:59pm.
 */
const SLOT_HOURS = new Set([3, 6, 9, 12, 15, 18, 21]);

/**
 * GET /api/cron/sync-meta-ads
 *
 * Runs the same Meta sync as the manual "Sync from Meta" button on the admin
 * Overview Prize-performance card (`runMetaSpendByUrlSync`).
 *
 * Auth: matches the other cron routes — when `CRON_SECRET` is set the request
 * must carry `Authorization: Bearer <CRON_SECRET>` (Vercel cron sends this).
 *
 * AEST/AEDT gating + Vercel schedule rationale:
 *   Vercel cron fires in UTC and does NOT follow DST, so we over-invoke from
 *   Vercel and gate here against the actual Sydney wall clock (DST-correct via
 *   date-fns-tz). We only do real work when the local time is one of the target
 *   slots — hour ∈ {3,6,9,12,15,18,21} at minute 0, OR exactly 23:59. Every
 *   other invocation returns 200 "skipped" cheaply (before touching Mongo/Meta).
 *
 *   vercel.json schedules:
 *     - "0 * * * *"      hourly on the hour; covers every 3-hourly slot for both
 *                        AEST (UTC+10) and AEDT (UTC+11) since the hour-0 slots
 *                        always land on a UTC hour boundary.
 *     - "59 12,13 * * *" covers the 23:59 slot: 23:59 AEDT = 12:59 UTC and
 *                        23:59 AEST = 13:59 UTC. The handler's 23:59 gate picks
 *                        whichever one is the real local 23:59 today.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Sydney-local gate (DST-correct).
  const now = new Date();
  const localHour = Number(formatInTimeZone(now, TZ, "H"));
  const localMinute = Number(formatInTimeZone(now, TZ, "m"));

  const isSlotHour = SLOT_HOURS.has(localHour) && localMinute === 0;
  const isEndOfDay = localHour === 23 && localMinute === 59;

  if (!isSlotHour && !isEndOfDay) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not-a-target-slot",
      localTime: formatInTimeZone(now, TZ, "yyyy-MM-dd HH:mm"),
    });
  }

  const startTime = Date.now();
  try {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    if (!adAccountId || !accessToken) {
      console.error("sync-meta-ads: skipping — Facebook env not set");
      return NextResponse.json(
        { ok: false, skipped: true, reason: "env" },
        { status: 200 }
      );
    }

    await connectDB();

    // Re-sync a trailing window so Meta's later revisions to recent days are picked up.
    const until = now;
    const since = subDays(until, 7);
    const dateRange = {
      since: formatDateForFacebook(since),
      until: formatDateForFacebook(until),
    };

    const data = await runMetaSpendByUrlSync(adAccountId, accessToken, dateRange);

    const ms = Date.now() - startTime;
    console.error("sync-meta-ads: done", {
      localTime: formatInTimeZone(now, TZ, "yyyy-MM-dd HH:mm"),
      dateRange,
      rowsUpserted: data.insights.rowsUpserted,
      destinations: data.destinations.upserted,
      durationMs: ms,
    });

    return NextResponse.json({ ok: true, dateRange, ...data, durationMs: ms });
  } catch (e) {
    console.error("sync-meta-ads:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
