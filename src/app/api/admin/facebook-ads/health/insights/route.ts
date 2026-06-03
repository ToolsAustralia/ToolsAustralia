import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getFacebookAdsHealthInsights } from "@/services/facebook-ads-health/healthInsights";
import { loadActiveSnoozes } from "@/services/facebook-ads-health/snoozeService";
import { parseISO } from "date-fns";

// Health view mirrors the legacy Ads view's level switcher (campaign/adset/ad).
// Verdict semantics are most meaningful at adset level, but campaign and ad
// levels are supported so the team can switch granularity without leaving the
// Health view. "Account" level is intentionally NOT supported — verdicts don't
// make sense for a single aggregated row.
//
// Core orchestration (settings + aggregate + verdict + projection + alertCount)
// lives in `getFacebookAdsHealthInsights` so the admin route and the Norm
// projection share one path. The per-operator snooze state is layered on here.
const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  level: z.enum(["campaign", "adset", "ad"]).default("adset"),
  // ALL row-level filters (verdict, learningStatus, liveOnly, minSpend, search, campaign)
  // are applied client-side. They are intentionally absent from this schema — keeping them
  // server-side defeats TanStack cache hits AND would shrink the client's campaign list to
  // the currently-filtered subset, breaking a future multiselect dropdown.
});

export async function GET(request: NextRequest) {
  // requirePermission returns { session: Session } or a NextResponse — destructure.
  const guard = await requirePermission("facebookAds.view");
  if (guard instanceof NextResponse) return guard;
  const { session } = guard;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const q = parsed.data;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID ?? "";
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN ?? "";
  if (!adAccountId) {
    return NextResponse.json(
      { success: false, error: "FACEBOOK_AD_ACCOUNT_ID not configured" },
      { status: 500 },
    );
  }
  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "FACEBOOK_MARKETING_ACCESS_TOKEN not configured" },
      { status: 500 },
    );
  }

  const { rows, alertCount } = await getFacebookAdsHealthInsights({
    adAccountId,
    accessToken,
    startDate: parseISO(q.startDate),
    endDate: parseISO(q.endDate),
    level: q.level,
  });

  // Operator-specific snooze enrichment, layered on the shared service rows.
  const userId = session.user?.id ?? "";
  const snoozes = userId
    ? await loadActiveSnoozes(userId, rows.map((r) => r.id))
    : new Map<string, Date>();
  const out = rows.map((r) => ({ ...r, snoozedUntil: snoozes.get(r.id) ?? null }));

  return NextResponse.json({ success: true, rows: out, alertCount });
}
