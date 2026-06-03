import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getMetricsDebugSnapshot } from "@/services/metrics/MetricsDebugService";

/**
 * GET /api/admin/metrics/debug
 * Debug endpoint to check what data exists and why aggregation might be returning zeros.
 * Engineer-facing diagnostic — shape may change without notice.
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("overview.view");
    if (_guard instanceof NextResponse) return _guard;

    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get("days") || "7", 10);

    const snapshot = await getMetricsDebugSnapshot(
      Number.isFinite(daysBack) ? daysBack : 7
    );

    return NextResponse.json({
      dateRange: {
        start: snapshot.dateRange.start.toISOString(),
        end: snapshot.dateRange.end.toISOString(),
        days: snapshot.dateRange.days,
      },
      paymentEvents: {
        count: snapshot.paymentEvents.count,
        sample: snapshot.paymentEvents.sample.map((e) => ({
          timestamp: e.timestamp,
          price: e.price,
          packageType: e.packageType,
        })),
        totalRevenue: snapshot.paymentEvents.totalRevenue,
      },
      facebookAds: snapshot.facebookAds,
      note: snapshot.note,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DEBUG_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 }
    );
  }
}
