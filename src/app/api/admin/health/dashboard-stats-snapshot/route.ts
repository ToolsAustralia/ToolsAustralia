import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import { expandDateKeyRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const TZ = "Australia/Sydney";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // request param is unused — Next 15 App Router still requires the signature.
  void request;

  await connectDB();

  const launchKey = formatInTimeZone(getWebsiteLaunchDateUTC(), TZ, "yyyy-MM-dd");
  const todayKey = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  // Expected keys exclude today (cron hasn't run yet for "today" until midnight AEST passes)
  const expectedKeys = expandDateKeyRange(launchKey, todayKey).slice(0, -1);

  const present = await DashboardStatsDailySnapshot.find({ date: { $in: expectedKeys } })
    .select("date")
    .lean();
  const presentSet = new Set(present.map((p) => p.date));
  const missing = expectedKeys.filter((k) => !presentSet.has(k));

  return NextResponse.json({
    expectedCount: expectedKeys.length,
    presentCount: presentSet.size,
    missingCount: missing.length,
    missingDates: missing,
    latestPresent: present.map((p) => p.date).sort().slice(-3),
  });
}
