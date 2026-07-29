/**
 * One-time seeding script: populates TikTokAdInsightsDaily from the TikTok Marketing API.
 * The TikTok analogue of scripts/seed-meta-insights.ts (panel F-004) — the nightly
 * /api/cron/sync-tiktok-ads only re-pulls a trailing 8-day window, so history (e.g. the
 * weeks a broken token blocked syncing) can only be captured by running this once.
 *
 * Idempotent on {adAccountId, date, adId} (unique index enforces this).
 * Each run refreshes syncedAt via $set — critical for the TTL clock pattern.
 * Live writes delegate to TikTokInsightsSyncService.syncDateRange — the same tested
 * upsert path the cron uses — so this script can never drift from the cron's behavior.
 *
 * Usage:
 *   npm run seed:tiktok-insights:dry           # fetch + report, write nothing
 *   npm run seed:tiktok-insights               # last 30 days
 *   npm run seed:tiktok-insights -- --days=60  # run this on token day
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import {
  fetchTikTokAdInsightsDaily,
  isTikTokAdInsightsConfigured,
  checkTikTokAccountAssumptions,
  describeAccountAssumptionMismatch,
} from "@/services/admin/tiktok/tiktokAdInsights";
import {
  TikTokInsightsSyncService,
  metricNamesSuspect,
} from "@/services/admin/tiktok/TikTokInsightsSyncService";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Parse --days=N
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1] ?? "30", 10) : 30;
  if (isNaN(days) || days < 1) {
    console.error("Invalid --days value. Must be a positive integer.");
    process.exit(1);
  }

  if (!isTikTokAdInsightsConfigured()) {
    console.error(
      "Missing TIKTOK_ADVERTISER_ID or TIKTOK_MARKETING_ACCESS_TOKEN in .env.local"
    );
    process.exit(1);
  }

  const now = new Date();
  const since = formatInTimeZone(subDays(now, days), AEST, "yyyy-MM-dd");
  const until = formatInTimeZone(now, AEST, "yyyy-MM-dd");

  console.error(
    `[seed-tiktok-insights] Starting. days=${days} window=${since}..${until} dryRun=${dryRun}`
  );

  if (dryRun) {
    // Token-day guard (panel F-006): confirm the live account really is AUD /
    // Australia-Sydney before anyone trusts a single synced figure.
    console.error("[seed-tiktok-insights] [DRY-RUN] Checking account currency + timezone…");
    try {
      const assumptions = await checkTikTokAccountAssumptions();
      if (assumptions) {
        console.error(
          `[seed-tiktok-insights] [DRY-RUN] account currency=${assumptions.currency ?? "?"} timezone=${assumptions.timezone ?? "?"}`,
        );
        const mismatch = describeAccountAssumptionMismatch(assumptions);
        console.error(
          mismatch
            ? `[seed-tiktok-insights] [DRY-RUN] ⚠️ ${mismatch}`
            : "[seed-tiktok-insights] [DRY-RUN] ✅ currency + timezone match the sync's assumptions.",
        );
      }
    } catch (e) {
      console.error(
        "[seed-tiktok-insights] [DRY-RUN] account check FAILED (needs the Ad Account Management: read scope):",
        e instanceof Error ? e.message : e,
      );
    }

    console.error("[seed-tiktok-insights] [DRY-RUN] Fetching from TikTok (no writes)…");
    let rows;
    try {
      // Throws TikTokReportError on API failure; null only when unconfigured (guarded above).
      rows = await fetchTikTokAdInsightsDaily(since, until);
    } catch (e) {
      console.error(
        "[seed-tiktok-insights] [DRY-RUN] FETCH FAILED (bad token/scopes?):",
        e instanceof Error ? e.message : e
      );
      process.exit(1);
    }
    if (rows === null) {
      console.error("[seed-tiktok-insights] [DRY-RUN] Not configured — nothing to fetch.");
      process.exit(1);
    }
    const adIds = new Set(rows.map((r) => r.adId));
    const spendCents = rows.reduce((s, r) => s + r.spendCents, 0);
    console.error(
      `[seed-tiktok-insights] [DRY-RUN] Would upsert ${rows.length} ad×day rows ` +
        `(${adIds.size} distinct ads, total spend $${(spendCents / 100).toFixed(2)}).`
    );
    if (rows[0]) {
      console.error(
        `[seed-tiktok-insights] [DRY-RUN] Sample raw metric keys (verify metric-name guesses, panel F-005): ` +
          Object.keys((rows[0].raw as { metrics?: Record<string, unknown> })?.metrics ?? {}).join(", ")
      );
    }
    process.exit(0);
  }

  await connectDB();
  try {
    const result = await new TikTokInsightsSyncService().syncDateRange(
      { since, until },
      { onProgress: (msg) => console.error(`[seed-tiktok-insights] ${msg}`) }
    );
    console.error(
      `[seed-tiktok-insights] Done. ${result.rowsUpserted} rows upserted, ` +
        `${result.adIds.length} distinct ad IDs, window ${result.dateRange.since}..${result.dateRange.until}.`
    );
    if (result.rowsUpserted > 0 && metricNamesSuspect(result.totals)) {
      console.error(
        "[seed-tiktok-insights] ⚠️ WARNING metric-names-suspect — clicks > 0 but conversions and revenue are ALL ZERO. " +
          "The guessed metric names may not match this account (panel F-005). Re-run with --dry-run to print the live raw.metrics keys."
      );
    }
    process.exit(0);
  } catch (e) {
    console.error("[seed-tiktok-insights] Sync FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[seed-tiktok-insights] Fatal error:", e);
  process.exit(1);
});
