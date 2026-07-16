import { NextRequest, NextResponse } from "next/server";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { TikTokInsightsSyncService } from "@/services/admin/tiktok/TikTokInsightsSyncService";
import { isTikTokAdInsightsConfigured } from "@/services/admin/tiktok/tiktokAdInsights";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const TZ = "Australia/Sydney";

/**
 * GET /api/cron/sync-tiktok-ads
 *
 * Nightly re-sync of TikTok ad-level insights into TikTokAdInsightsDaily (the TikTok
 * analogue of sync-meta-ads). Re-pulls a trailing 8-day window so TikTok's later
 * revisions to recent days are picked up. No-ops cleanly when the TikTok Marketing-API
 * creds are not set.
 *
 * Auth: matches the other cron routes — when CRON_SECRET is set the request must carry
 * `Authorization: Bearer <CRON_SECRET>` (Vercel cron sends this). Middleware does not
 * run for /api/**, so we gate here.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startTime = Date.now();
  try {
    if (!isTikTokAdInsightsConfigured()) {
      console.error("sync-tiktok-ads: skipping — TikTok Marketing-API env not set");
      return NextResponse.json({ ok: false, skipped: true, reason: "env" }, { status: 200 });
    }

    await connectDB();

    const until = new Date();
    const since = subDays(until, 7);
    const dateRange = {
      since: formatInTimeZone(since, TZ, "yyyy-MM-dd"),
      until: formatInTimeZone(until, TZ, "yyyy-MM-dd"),
    };

    const data = await new TikTokInsightsSyncService().syncDateRange(dateRange);

    const ms = Date.now() - startTime;
    console.error("sync-tiktok-ads: done", {
      dateRange,
      rowsUpserted: data.rowsUpserted,
      adIds: data.adIds.length,
      durationMs: ms,
    });

    return NextResponse.json({ ok: true, ...data, durationMs: ms });
  } catch (e) {
    console.error("sync-tiktok-ads:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}
