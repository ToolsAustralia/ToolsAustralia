import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { writeSlidingWindow } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TZ = "Australia/Sydney";
const SLIDING_WINDOW_DAYS = 90;

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
