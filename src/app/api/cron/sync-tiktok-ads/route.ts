import { NextRequest, NextResponse } from "next/server";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import {
  TikTokInsightsSyncService,
  metricNamesSuspect,
} from "@/services/admin/tiktok/TikTokInsightsSyncService";
import {
  isTikTokAdInsightsConfigured,
  checkTikTokAccountAssumptions,
  describeAccountAssumptionMismatch,
} from "@/services/admin/tiktok/tiktokAdInsights";
import { recordTikTokSyncRun } from "@/services/admin/tiktok/tiktokSyncStatus";

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
  const until = new Date();
  const since = subDays(until, 7);
  const dateRange = {
    since: formatInTimeZone(since, TZ, "yyyy-MM-dd"),
    until: formatInTimeZone(until, TZ, "yyyy-MM-dd"),
  };
  try {
    if (!isTikTokAdInsightsConfigured()) {
      console.error("sync-tiktok-ads: skipping — TikTok Marketing-API env not set");
      return NextResponse.json({ ok: false, skipped: true, reason: "env" }, { status: 200 });
    }

    await connectDB();

    const data = await new TikTokInsightsSyncService().syncDateRange(dateRange);

    const ms = Date.now() - startTime;
    // Persist the outcome so the admin UI can render a truthful sync state (F-002).
    await recordTikTokSyncRun({
      outcome: "ok",
      rowsUpserted: data.rowsUpserted,
      since: dateRange.since,
      until: dateRange.until,
      durationMs: ms,
    });
    console.error("sync-tiktok-ads: done", {
      dateRange,
      rowsUpserted: data.rowsUpserted,
      adIds: data.adIds.length,
      durationMs: ms,
    });

    // Metric-name tripwire (panel F-005): clicks with zero conversions AND zero revenue
    // across the whole window means the guessed metric names likely missed — the rows
    // were written with confident zeros. Shout; verify names against a row's raw.metrics.
    const suspect = data.rowsUpserted > 0 && metricNamesSuspect(data.totals);
    if (suspect) {
      console.error(
        "sync-tiktok-ads: WARNING metric-names-suspect — clicks > 0 but conversions and revenue are ALL ZERO. " +
          "The requested metric names may not match this account; inspect a TikTokAdInsightsDaily row's raw.metrics keys " +
          "(or run seed:tiktok-insights:dry, which prints them).",
        data.totals,
      );
    }

    // Account-assumption guard (panel F-006): the sync stores spend as AUD cents and
    // buckets hours as Australia/Sydney. Verify the live account still agrees — a
    // currency or reporting-timezone change would silently corrupt every figure.
    // Best-effort and AFTER the sync: never let this check block or fail the sync
    // (it needs a scope the report call doesn't).
    let assumptionsWarning: string | null = null;
    try {
      const assumptions = await checkTikTokAccountAssumptions();
      if (assumptions) {
        assumptionsWarning = describeAccountAssumptionMismatch(assumptions);
        if (assumptionsWarning) console.error(`sync-tiktok-ads: ${assumptionsWarning}`);
      }
    } catch (e) {
      console.error(
        "sync-tiktok-ads: account-assumption check failed (non-fatal; needs Ad Account Management: read):",
        e instanceof Error ? e.message : e,
      );
    }

    return NextResponse.json({
      ok: true,
      ...data,
      durationMs: ms,
      ...(suspect && { warning: "metric-names-suspect" }),
      ...(assumptionsWarning && { assumptionsWarning }),
    });
  } catch (e) {
    console.error("sync-tiktok-ads:", e);
    // Best-effort status write (never throws) — the cron still 500s so Vercel
    // cron monitoring keeps surfacing the failure loudly.
    await recordTikTokSyncRun({
      outcome: "error",
      error: e,
      since: dateRange.since,
      until: dateRange.until,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 },
    );
  }
}
