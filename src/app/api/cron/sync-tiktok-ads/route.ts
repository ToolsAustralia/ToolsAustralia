import { NextRequest, NextResponse } from "next/server";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import { metricNamesSuspect } from "@/services/admin/tiktok/TikTokInsightsSyncService";
import {
  runSpendByUrlSync,
  tiktokSpendByUrlDescriptor,
} from "@/services/analytics/runSpendByUrlSync";
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
 * Sydney-local wall-clock slots this sync actually does work at — 3am, 6am, 9am, 12pm, 3pm,
 * 6pm, 9pm and 11:59pm. Identical to `sync-meta-ads`; see the rationale on the handler.
 */
const SLOT_HOURS = new Set([3, 6, 9, 12, 15, 18, 21]);

/**
 * GET /api/cron/sync-tiktok-ads
 *
 * Re-sync of the FULL TikTok spend-by-URL pipeline — insights → ad→landing-URL destinations
 * → per-URL daily aggregates — the TikTok analogue of sync-meta-ads. Re-pulls a trailing
 * 8-day window so TikTok's later revisions to recent days are picked up. No-ops cleanly when
 * the TikTok Marketing-API creds are not set.
 *
 * CADENCE (2026-08-11): every 3 hours, matching `sync-meta-ads` exactly.
 *
 * It ran ONCE daily (`45 2 * * *`) until then, which was an oversight rather than a
 * decision — TikTok shipped "nightly" on 2026-07-16 and kept that cadence when the shared
 * `runSpendByUrlSync` pipeline was wired in on 2026-07-29, even though Meta had been running
 * the same pipeline 3-hourly all along. Nothing justified the asymmetry: no rate-limit
 * constraint is documented, and a run is a couple of report calls.
 *
 * The cost of the daily cadence was real. TikTok spend for the CURRENT day was invisible
 * until the next morning, and every downstream read — the Advertising card, blended ROAS,
 * MER, the spend-by-URL drill-down — inherited that staleness. It also left the day's figures
 * settling ~12h after the daily snapshot recorded them (see the ordering note on
 * `dashboard-stats-daily-snapshot`).
 *
 * AEST/AEDT gating + Vercel schedule rationale (copied from sync-meta-ads):
 *   Vercel cron fires in UTC and does NOT follow DST, so we over-invoke from Vercel and gate
 *   here against the actual Sydney wall clock (DST-correct via date-fns-tz). Real work only
 *   happens when local time is a target slot — hour ∈ {3,6,9,12,15,18,21} at minute 0, OR
 *   exactly 23:59. Every other invocation returns 200 "skipped" cheaply, before touching
 *   Mongo or TikTok.
 *
 *   vercel.json schedules:
 *     - "0 * * * *"      hourly on the hour; covers every 3-hourly slot for both AEST
 *                        (UTC+10) and AEDT (UTC+11), since hour-0 slots always land on a UTC
 *                        hour boundary.
 *     - "59 12,13 * * *" covers the 23:59 slot: 23:59 AEDT = 12:59 UTC and 23:59 AEST =
 *                        13:59 UTC. The handler's 23:59 gate picks whichever is really local
 *                        23:59 today.
 *
 * ⚠️ The 23:59 slot is the one that matters for day-boundary accuracy: it lands just before
 * the AEST day closes, so the day is captured near-complete before `dashboard-stats-daily-
 * snapshot` writes it (its first two fires are `30 17`/`30 20 * * *` UTC as of 2026-08-24 —
 * moved off 14:00/15:00 UTC to clear the renewal-webhook-burst hour; see
 * docs/infrastructure/gotchas.md). It does NOT remove the need for the later 03:20 UTC
 * snapshot re-run — TikTok keeps attributing conversions for hours after midnight (7-day
 * click / 1-day view), so the day is only SETTLED well after it ends. The two fixes are
 * complementary: this one makes the number fresh, that one makes it final.
 *
 * ⚠️ If `dashboard-stats-daily-snapshot`'s first two fires ever move again, they must avoid
 * landing on one of THIS cron's slot hours ({3,6,9,12,15,18,21}:00 Sydney local) in EITHER DST
 * regime — that cron reads the tables this one is actively writing. A `0 18`/`0 19 * * *`
 * attempt shipped and was reverted the same day this note was added: `19:00 UTC` is exactly
 * the Sydney-06:00 slot during AEDT. A `:30` UTC minute is structurally immune (this gate only
 * fires at local minute 0, or local 23:59).
 *
 * It ran insights-only until 2026-07-29. That left `LandingPageMetricsDaily` permanently
 * empty for TikTok in production: the Ad Spend drill-down and Prize Performance read the
 * rollup, not the raw insights, so TikTok showed $0 everywhere with nothing failing. The
 * pipeline is shared with Meta (`runSpendByUrlSync`), so the two platforms cannot drift.
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

  // Sydney-local gate (DST-correct) — see the handler note. Returns before touching Mongo
  // or TikTok on the ~16 invocations a day that are not a target slot.
  const now = new Date();
  const localHour = Number(formatInTimeZone(now, TZ, "H"));
  const localMinute = Number(formatInTimeZone(now, TZ, "m"));
  const isSlotHour = SLOT_HOURS.has(localHour) && localMinute === 0;
  const isEndOfDay = localHour === 23 && localMinute === 59;
  if (!isSlotHour && !isEndOfDay) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "not-a-target-slot",
      localTime: formatInTimeZone(now, TZ, "yyyy-MM-dd HH:mm"),
    });
  }

  const startTime = Date.now();
  const until = now;
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

    const descriptor = tiktokSpendByUrlDescriptor();
    if (!descriptor) {
      console.error("sync-tiktok-ads: skipping — TIKTOK_ADVERTISER_ID not set");
      return NextResponse.json({ ok: false, skipped: true, reason: "env" }, { status: 200 });
    }

    const result = await runSpendByUrlSync(descriptor, dateRange);
    const data = result.insights;

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
      destinationsUpserted: result.destinations.upserted,
      destinationCoverage: result.destinations.coverage,
      aggregateRowsWritten: result.aggregation.rowsWritten,
      durationMs: ms,
    });

    // Metric-name tripwire (panel F-005): clicks with zero conversions AND zero revenue
    // across the whole window means the guessed metric names likely missed — the rows
    // were written with confident zeros. Shout; verify names against a row's raw.metrics.
    const suspect = data.rowsUpserted > 0 && !!data.totals && metricNamesSuspect(data.totals);
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
