import { NextRequest, NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { MembershipAnalyticsService } from "@/services/admin/MembershipAnalyticsService";
import MembershipDailySnapshot, { SNAPSHOT_SOURCE_VERSION } from "@/models/MembershipDailySnapshot";
import { getPackageById } from "@/data/membershipPackages";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// In-file override (2026-08-24) — vercel.json's `functions` block has NO entry for this route,
// so without this it falls through to the `src/app/api/**/route.ts` catch-all's 10s cap. That
// silent gap combined with the write-once guard below is a real failure mode: a run that times
// out mid-loop leaves the packages after the cutoff unwritten, and because the guard treats
// "row already exists" as final, the NEXT fire only fills in the packages the first run missed
// — one day's three package rows would end up carrying two different census moments instead of
// one. Declared in-file rather than only in vercel.json so it can't be silently shadowed by a
// catch-all entry ordered above it (see docs/infrastructure/architecture.md's "Pattern ordering
// matters" note — `charge-past-due` is currently shadowed exactly this way).
export const maxDuration = 300;

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
 * A row is treated as degenerate when every count is zero — the signature of an aggregate that
 * silently returned no rows. `getMembershipByPackageLiveForSnapshot` (MembershipAnalyticsService)
 * has ZERO date filtering — it's a pure `User.aggregate` census of CURRENT subscription state —
 * and never throws on an empty result; `a[packageId] ?? 0` maps that straight to a clean-looking
 * `0`. A real subscription package legitimately hitting zero on active AND past-due AND
 * scheduled-cancel AND cancelled simultaneously is not a state this product reaches, so this is a
 * cheap, high-confidence signal that the write that produced it was bad, not that membership
 * genuinely emptied out.
 */
function isDegenerateSnapshotCounts(row: {
  activeCount: number;
  pastDueCount: number;
  scheduledCancelCount: number;
  cancelledCount: number;
}): boolean {
  return (
    row.activeCount === 0 &&
    row.pastDueCount === 0 &&
    row.scheduledCancelCount === 0 &&
    row.cancelledCount === 0
  );
}

/**
 * WRITE-ONCE GUARD, WITH A DEGENERATE-ROW ESCAPE HATCH (2026-08-24).
 *
 * This cron is scheduled twice a day (see vercel.json) so a missed/failed first run still gets
 * a snapshot written by the second — but both runs resolve to the SAME date key
 * (yesterday-in-Sydney, computed in GET below). An unconditional `$set` upsert let the second
 * run silently clobber the first every time, which is the wrong default: this collection has no
 * OTHER writer and no repair path (`getMembershipSnapshotHealth` only checks that a row EXISTS,
 * not that its counts look sane), so once a bad write lands, nothing else in the system corrects
 * it.
 *
 * THE REAL TRADE-OFF (corrected 2026-08-24 — the original comment here claimed the first run is
 * "PRE-burst" and the second is "POST-burst"; that framing is false and was never verified
 * against the read path). `getMembershipByPackageLiveForSnapshot` is NOT a point-in-time
 * snapshot of a closed day — it is a purely LIVE census, re-run fresh on every cron fire, with no
 * date filter of any kind. The `date` key is only a LABEL (`now − 24h`, formatted in Sydney);
 * accuracy is entirely a function of how many hours past the Sydney day boundary the cron
 * happened to fire. Every fire, first or second, captures "membership state right now" and
 * stamps it with yesterday's date — there is no run that is genuinely "pre-burst" versus
 * "post-burst" in an absolute sense, only "closer to the boundary" versus "further from it".
 * Moving both fires later in the day (to clear the renewal-webhook-burst hour — see
 * docs/infrastructure/gotchas.md) makes EVERY fire's census further from the true end-of-day
 * state than it used to be; the guard below only ensures we keep the CLOSER of the two, not that
 * either one is uncontaminated.
 *
 * So: guarding on the row not already existing makes the first run to reach a given
 * (date, packageId) authoritative (closer to the boundary, less renewal churn baked in); the
 * second becomes a no-op fallback for a missed/failed first run rather than an unconditional
 * overwrite. The ESCAPE HATCH: if the existing row is degenerate (see
 * `isDegenerateSnapshotCounts`), it is treated as if it doesn't exist, so a first run that wrote
 * a bad zero (crash mid-aggregate, empty result, etc.) can still be corrected by the second run
 * instead of permanently locking in a silent zero. The two DB round trips are not atomic, but the
 * two cron fires are scheduled hours apart (never concurrent), and the unique `{date, packageId}`
 * index is a hard backstop against a genuine race.
 */
export async function upsertMembershipSnapshotRow(
  row: MembershipSnapshotRowInput
): Promise<{ written: boolean }> {
  const existing = await MembershipDailySnapshot.findOne(
    { date: row.date, packageId: row.packageId },
    { activeCount: 1, pastDueCount: 1, scheduledCancelCount: 1, cancelledCount: 1 }
  ).lean();

  if (existing && !isDegenerateSnapshotCounts(existing)) {
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
