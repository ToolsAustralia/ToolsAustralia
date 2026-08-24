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

export interface MembershipSnapshotRowInput {
  date: string;
  packageId: string;
  activeCount: number;
  pastDueCount: number;
  scheduledCancelCount: number;
  cancelledCount: number;
  unitPriceCents: number;
  activeRevenue: number;
  pastDueRevenue: number;
  computedAt: Date;
}

/**
 * WRITE-ONCE GUARD (2026-08-24). This cron is scheduled twice a day (see vercel.json) so a
 * missed/failed first run still gets a snapshot written by the second — but both runs resolve to
 * the SAME date key (yesterday-in-Sydney, computed in GET below), and on a renewal-burst night
 * the second run's live counts are POST-burst while the first run's are PRE-burst. An
 * unconditional `$set` upsert let the second run silently clobber the first, so "yesterday"'s
 * row ended up reflecting an extra hour of next-day renewal processing instead of the day that
 * actually closed. Guarding on the row not already existing makes the first run to reach a given
 * (date, packageId) authoritative; the second becomes a true no-op for that row instead of a
 * blind overwrite. The two DB round trips are not atomic, but the two cron fires are scheduled an
 * hour apart (never concurrent), and the unique `{date, packageId}` index is a hard backstop.
 */
export async function upsertMembershipSnapshotRow(
  row: MembershipSnapshotRowInput
): Promise<{ written: boolean }> {
  const existing = await MembershipDailySnapshot.findOne({ date: row.date, packageId: row.packageId }, { _id: 1 }).lean();

  if (existing) {
    return { written: false };
  }

  await MembershipDailySnapshot.findOneAndUpdate(
    { date: row.date, packageId: row.packageId },
    {
      $set: {
        tz: TZ,
        activeCount: row.activeCount,
        pastDueCount: row.pastDueCount,
        scheduledCancelCount: row.scheduledCancelCount,
        cancelledCount: row.cancelledCount,
        unitPriceCents: row.unitPriceCents,
        activeRevenue: row.activeRevenue,
        pastDueRevenue: row.pastDueRevenue,
        confidence: "live",
        computedAt: row.computedAt,
        sourceVersion: SNAPSHOT_SOURCE_VERSION,
      },
    },
    { upsert: true }
  );
  return { written: true };
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
    let skipped = 0;
    for (const pkg of live.packages) {
      const unitPriceCents = Math.round((getPackageById(pkg.packageId)?.price ?? 0) * 100);
      const activeRevenue = Math.round(pkg.activeCount * unitPriceCents) / 100;
      const pastDueRevenue = Math.round(pkg.pastDueCount * unitPriceCents) / 100;

      const { written: didWrite } = await upsertMembershipSnapshotRow({
        date: yesterdayInSydney,
        packageId: pkg.packageId,
        activeCount: pkg.activeCount,
        pastDueCount: pkg.pastDueCount,
        scheduledCancelCount: pkg.scheduledCancelCount,
        cancelledCount: pkg.fullyCancelledCount,
        unitPriceCents,
        activeRevenue,
        pastDueRevenue,
        computedAt: now,
      });
      if (didWrite) {
        written += 1;
      } else {
        skipped += 1;
      }
    }

    console.log("[cron membership-daily-snapshot] wrote rows", { date: yesterdayInSydney, written, skipped });
    return NextResponse.json({ ok: true, date: yesterdayInSydney, written, skipped });
  } catch (err) {
    console.error("[cron membership-daily-snapshot] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
