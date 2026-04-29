import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
import MembershipDailySnapshot, { SNAPSHOT_SOURCE_VERSION } from "@/models/MembershipDailySnapshot";
import { getPackageById } from "@/data/membershipPackages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TZ = "Australia/Sydney";

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

    const now = new Date();
    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayInSydney = formatInTimeZone(yesterdayDate, TZ, "yyyy-MM-dd");

    const live = await new MembershipAnalyticsService().getMembershipByPackageLiveForSnapshot();

    let written = 0;
    for (const pkg of live.packages) {
      const unitPriceCents = Math.round((getPackageById(pkg.packageId)?.price ?? 0) * 100);
      const activeRevenue = Math.round(pkg.activeCount * unitPriceCents) / 100;
      const pastDueRevenue = Math.round(pkg.pastDueCount * unitPriceCents) / 100;

      await MembershipDailySnapshot.findOneAndUpdate(
        { date: yesterdayInSydney, packageId: pkg.packageId },
        {
          $set: {
            tz: TZ,
            activeCount: pkg.activeCount,
            pastDueCount: pkg.pastDueCount,
            scheduledCancelCount: pkg.scheduledCancelCount,
            cancelledCount: pkg.fullyCancelledCount,
            unitPriceCents,
            activeRevenue,
            pastDueRevenue,
            confidence: "live",
            computedAt: now,
            sourceVersion: SNAPSHOT_SOURCE_VERSION,
          },
        },
        { upsert: true }
      );
      written += 1;
    }

    console.log("[cron membership-daily-snapshot] wrote rows", { date: yesterdayInSydney, written });
    return NextResponse.json({ ok: true, date: yesterdayInSydney, written });
  } catch (err) {
    console.error("[cron membership-daily-snapshot] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
