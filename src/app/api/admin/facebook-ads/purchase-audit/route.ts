import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { computeAccountTrueRoas } from "@/services/facebook-ads-health/accountTrueRoasService";

const querySchema = z.object({
  range: z.enum(["today", "7d", "30d"]).default("today"),
});

/**
 * GET /api/admin/facebook-ads/purchase-audit
 * Readonly comparison: local PaymentEvent (non-renewal) revenue vs Meta Insights purchase revenue.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid query", details: parsed.error.issues }, { status: 400 });
    }

    const AEST = "Australia/Sydney";
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let fbSince: string;
    let fbUntil: string;

    if (parsed.data.range === "today") {
      const startOfToday = getStartOfTodayInAEST();
      startDate = startOfToday;
      const tomorrowStart = new Date(startOfToday);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      endDate = new Date(tomorrowStart.getTime() - 1);
      const y = parseInt(formatInTimeZone(now, AEST, "yyyy"), 10);
      const m = parseInt(formatInTimeZone(now, AEST, "M"), 10);
      const d = parseInt(formatInTimeZone(now, AEST, "d"), 10);
      const ds = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      fbSince = ds;
      fbUntil = ds;
    } else {
      const days = parsed.data.range === "7d" ? 7 : 30;
      const end = now;
      const start = subDays(getStartOfTodayInAEST(), days - 1);
      startDate = start;
      endDate = end;
      fbSince = formatInTimeZone(start, AEST, "yyyy-MM-dd");
      fbUntil = formatInTimeZone(end, AEST, "yyyy-MM-dd");
    }

    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN ?? "";
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";

    // When credentials are absent, skip the Meta call and surface a clear config error.
    const missingCredentials = !accessToken || !adAccountId;

    const result = await computeAccountTrueRoas({
      startDate,
      endDate,
      fbSince,
      fbUntil,
      accessToken: missingCredentials ? "" : accessToken,
      adAccountId: missingCredentials ? "" : adAccountId,
    });

    // Override the service error with the config-specific message when env vars are absent.
    const metaError = missingCredentials
      ? "FACEBOOK_MARKETING_ACCESS_TOKEN or FACEBOOK_AD_ACCOUNT_ID not configured"
      : result.error;

    const localRevenueAud = Math.round(result.localRevenueAud * 100) / 100;
    const metaPurchaseRevenueAud = result.metaPurchaseRevenueAud;

    const diffAud =
      metaPurchaseRevenueAud != null
        ? Math.round((metaPurchaseRevenueAud - localRevenueAud) * 100) / 100
        : null;

    return NextResponse.json({
      success: true,
      range: parsed.data.range,
      window: { start: startDate.toISOString(), end: endDate.toISOString() },
      facebookInsightsRange: { since: fbSince, until: fbUntil },
      local: {
        benefitsGrantedNonRenewalCount: result.localEventCount,
        revenueAud: localRevenueAud,
        note: "Excludes membership subscription_cycle (renewals). Uses PaymentEvent.data.price.",
      },
      meta: {
        purchaseRevenueAud: missingCredentials ? null : metaPurchaseRevenueAud,
        purchaseConversions: missingCredentials ? null : result.metaPurchaseConversions,
        error: metaError,
      },
      reconciliation: {
        differenceMetaMinusLocalAud: diffAud,
        interpretation:
          diffAud == null
            ? "Meta revenue unavailable"
            : diffAud > 0
              ? "Meta attributes more purchase revenue than local non-renewal total (duplicates, attribution window, or refunds)"
              : diffAud < 0
                ? "Local non-renewal total exceeds Meta purchase revenue (missing CAPI, non-ads attribution, or pixel)"
                : "Exact match (unusual)",
      },
    });
  } catch (error) {
    console.error("purchase-audit error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
