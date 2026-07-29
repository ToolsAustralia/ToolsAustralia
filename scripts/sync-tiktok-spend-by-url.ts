#!/usr/bin/env npx tsx
/**
 * Backfill or refresh TikTok ad insights + destination URLs + landing page aggregates.
 *
 * The TikTok twin of `scripts/sync-meta-spend-by-url.ts`. Both run the SAME pipeline
 * (`runSpendByUrlSync`); only the descriptor differs.
 *
 * Usage:
 *   npm run sync:tiktok-spend-by-url                              # trailing 7 days
 *   npm run sync:tiktok-spend-by-url -- --since=2026-06-01 --until=2026-07-28
 *   npm run sync:tiktok-spend-by-url:dry                          # report only, no writes
 *
 * Requires: MONGODB_URI, TIKTOK_ADVERTISER_ID, TIKTOK_MARKETING_ACCESS_TOKEN.
 *
 * PREREQUISITE — run these migrations in the target environment first, or the aggregate
 * rebuild's platform-scoped delete will not match the unstamped legacy rows and the unique
 * index will collide instead of replacing them:
 *   scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts --live
 *   scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts --live
 *
 * Exit codes: 0 = ok · 1 = fatal (bad args, creds, or API error) · 2 = ran but coverage
 * below 80%, i.e. most spend landed on `unknown://tiktok-ad/<id>` rather than a real page.
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";
import { subDays, format } from "date-fns";

config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import {
  runSpendByUrlSync,
  tiktokSpendByUrlDescriptor,
} from "@/services/analytics/runSpendByUrlSync";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import LandingPageMetricsDaily from "@/models/LandingPageMetricsDaily";
import AdDestination from "@/models/AdDestination";

/** Below this, the run is reported as degraded (exit 2) rather than silently "done". */
const COVERAGE_FLOOR = 0.8;

function parseArgs(): { since: string; until: string; dryRun: boolean } {
  const argv = process.argv.slice(2);
  let since: string | undefined;
  let until: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--since=")) since = a.slice("--since=".length);
    if (a.startsWith("--until=")) until = a.slice("--until=".length);
  }
  const end = new Date();
  return {
    since: since ?? format(subDays(end, 7), "yyyy-MM-dd"),
    until: until ?? format(end, "yyyy-MM-dd"),
    dryRun: argv.includes("--dry-run"),
  };
}

function logLine(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function main() {
  const descriptor = tiktokSpendByUrlDescriptor();
  if (!descriptor) {
    console.error("Missing TIKTOK_ADVERTISER_ID — nothing to sync.");
    process.exit(1);
  }

  const { since, until, dryRun } = parseArgs();
  if (since > until) {
    console.error("since must be <= until");
    process.exit(1);
  }

  await connectDB();

  console.log(`\n=== TikTok spend-by-url sync (${dryRun ? "DRY-RUN" : "LIVE"}) ===\n`);
  logLine(`Advertiser ${descriptor.adAccountId} · range ${since} → ${until}`);

  if (dryRun) {
    // Read-only: what exists now, so the operator can see what a live run would replace.
    const [insightRows, adIds, destCount, aggRows] = await Promise.all([
      TikTokAdInsightsDaily.countDocuments({
        adAccountId: descriptor.adAccountId,
        date: { $gte: since, $lte: until },
      }),
      TikTokAdInsightsDaily.distinct("adId", {
        adAccountId: descriptor.adAccountId,
        date: { $gte: since, $lte: until },
      }),
      AdDestination.countDocuments({ platform: "tiktok" }),
      LandingPageMetricsDaily.countDocuments({
        platform: "tiktok",
        adAccountId: descriptor.adAccountId,
        date: { $gte: since, $lte: until },
      }),
    ]);
    console.log(`\nCurrent state (nothing written):`);
    console.log(`  TikTok insight rows in range : ${insightRows} (${adIds.length} distinct ads)`);
    console.log(`  TikTok ad destinations stored: ${destCount}`);
    console.log(`  TikTok aggregate rows in range: ${aggRows} (would be rebuilt)`);
    console.log(`\nRe-run without --dry-run to sync.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const t0 = Date.now();
  const result = await runSpendByUrlSync(descriptor, { since, until }, { onProgress: logLine });

  if (!result.configured) {
    console.error("\nTikTok Marketing-API creds not configured — nothing synced.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const coveragePct = (result.destinations.coverage * 100).toFixed(1);
  console.log(`\nSummary`);
  console.log(`=======`);
  console.log(`  Elapsed        : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Insight rows   : ${result.insights.rowsUpserted} (${result.insights.adIds.length} ads)`);
  console.log(
    `  Destinations   : ${result.destinations.upserted} upserted · coverage ${coveragePct}% ` +
      `(${result.destinations.missingUrlAds.length} unresolved)`,
  );
  console.log(
    `  Aggregate rows : ${result.aggregation.rowsWritten} across ${result.aggregation.datesProcessed} day(s)`,
  );

  const degraded =
    result.destinations.requested > 0 && result.destinations.coverage < COVERAGE_FLOOR;
  if (degraded) {
    console.error(
      `\n⚠️  Coverage ${coveragePct}% is below ${COVERAGE_FLOOR * 100}%. Most spend is filed under ` +
        `unknown://tiktok-ad/<id> and will NOT appear against any /promotions page. ` +
        `Check the id bridge (/ad/get/ → smart_plus_ad_id) before trusting per-URL figures.`,
    );
  }

  await mongoose.disconnect();
  process.exit(degraded ? 2 : 0);
}

main().catch(async (e) => {
  console.error("sync failed:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
