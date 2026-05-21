import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { runMetaSpendByUrlSync } from "@/services/meta/runMetaSpendByUrlSync";
import { formatDateForFacebook } from "@/lib/facebook-marketing";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-meta-spend-by-url
 * Re-syncs the last 8 days of ad-level insights and recomputes URL aggregates (overlap for Meta revisions).
 */
export async function GET() {
  const startTime = Date.now();
  try {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    if (!adAccountId || !accessToken) {
      console.warn("sync-meta-spend-by-url: skipping — Facebook env not set");
      return NextResponse.json({ ok: false, skipped: true, reason: "env" }, { status: 200 });
    }

    await connectDB();

    const until = new Date();
    const since = subDays(until, 7);
    const dateRange = {
      since: formatDateForFacebook(since),
      until: formatDateForFacebook(until),
    };

    const data = await runMetaSpendByUrlSync(adAccountId, accessToken, dateRange);

    const ms = Date.now() - startTime;
    console.log(`sync-meta-spend-by-url: done in ${ms}ms`, {
      dateRange,
      rowsUpserted: data.insights.rowsUpserted,
      destinations: data.destinations.upserted,
    });

    return NextResponse.json({
      ok: true,
      dateRange,
      ...data,
      durationMs: ms,
    });
  } catch (e) {
    console.error("sync-meta-spend-by-url:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
