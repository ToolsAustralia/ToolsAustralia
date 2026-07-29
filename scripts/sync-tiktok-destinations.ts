/**
 * Resolve TikTok ad → landing-URL destinations for the ads already present in
 * TikTokAdInsightsDaily, and upsert them into `AdDestination` (platform "tiktok").
 *
 * This is stage 2 of the spend-by-URL chain for TikTok (stage 1 = the insights sync,
 * stage 3 = the LandingPageMetricsDaily rollup).
 *
 * Usage:
 *   npm run sync:tiktok-destinations:dry            # resolve + report, no writes
 *   npm run sync:tiktok-destinations                # live
 *   npm run sync:tiktok-destinations -- --days=60
 *
 * Coverage is reported and the run FAILS below the threshold — a silent drop to 0% is the
 * exact failure mode of getting TikTok's ad_id → smart_plus_ad_id bridge wrong, and it
 * would present as "no TikTok URL data" rather than as an error.
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import AdDestination from "@/models/AdDestination";
import { TikTokAdDestinationService } from "@/services/admin/tiktok/TikTokAdDestinationService";
import { writeAdDestinations } from "@/services/analytics/adDestinationWriter";
import { derivePackagesFocusForDestination } from "@/utils/metrics/packages-focus";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";
/** Below this, treat the run as failed rather than reporting partial data as success. */
const MIN_COVERAGE = 0.5;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1] ?? "30", 10) : 30;

  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  if (!advertiserId || !process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim()) {
    console.error("Missing TIKTOK_ADVERTISER_ID / TIKTOK_MARKETING_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  const now = new Date();
  const since = formatInTimeZone(subDays(now, days), AEST, "yyyy-MM-dd");
  const until = formatInTimeZone(now, AEST, "yyyy-MM-dd");
  console.error(`[sync-tiktok-destinations] window ${since}..${until} dryRun=${dryRun}`);

  await connectDB();

  // Which ads do we actually have spend for? Resolving anything else is wasted work.
  const adIds = (await TikTokAdInsightsDaily.distinct("adId", {
    adAccountId: advertiserId,
    date: { $gte: since, $lte: until },
  })) as string[];
  console.error(`[sync-tiktok-destinations] ${adIds.length} distinct ad(s) with insights in range.`);
  if (adIds.length === 0) {
    console.error("Nothing to resolve — run `npm run seed:tiktok-insights` first.");
    process.exit(1);
  }

  const resolver = new TikTokAdDestinationService();
  const resolved = await resolver.resolveForAdIds(adIds, {
    onProgress: (m) => console.error(`[sync-tiktok-destinations] ${m}`),
  });

  const coverage = resolved.length / adIds.length;
  console.error(
    `[sync-tiktok-destinations] coverage ${(coverage * 100).toFixed(1)}% (${resolved.length}/${adIds.length})`,
  );

  // Show what the classifier will make of these URLs BEFORE writing anything — a
  // 100%-membership split is expected here (TikTok URLs carry no `packages` param) and
  // must be read as "no one-time URLs found", not as a measured 0%.
  const focusTally: Record<string, number> = {};
  const distinctUrls = new Set<string>();
  for (const r of resolved) {
    for (const u of r.rawUrls) distinctUrls.add(u.split("?")[0]);
    const focus = derivePackagesFocusForDestination({
      canonicalUrl: r.rawUrls[0] ?? "",
      rawUrls: r.rawUrls,
    } as never);
    focusTally[focus] = (focusTally[focus] ?? 0) + 1;
  }
  console.error(`[sync-tiktok-destinations] distinct landing paths: ${distinctUrls.size}`);
  for (const u of [...distinctUrls].slice(0, 10)) console.error(`    ${u}`);
  console.error(`[sync-tiktok-destinations] packages-focus tally: ${JSON.stringify(focusTally)}`);
  const multi = resolved.filter((r) => r.rawUrls.length > 1).length;
  console.error(`[sync-tiktok-destinations] ads with MULTIPLE landing URLs: ${multi}`);

  if (dryRun) {
    console.error(`\n[DRY-RUN] Would upsert ${adIds.length} destination row(s) (platform="tiktok").`);
    process.exit(coverage >= MIN_COVERAGE ? 0 : 1);
  }

  const result = await writeAdDestinations({
    platform: "tiktok",
    adAccountId: advertiserId,
    requestedAdIds: adIds,
    resolved,
  });
  console.error(
    `\n[sync-tiktok-destinations] upserted ${result.upserted} row(s); ` +
      `${result.missingUrlAds.length} unresolved → unknown://tiktok-ad/…`,
  );

  const stored = await AdDestination.countDocuments({ platform: "tiktok" });
  const metaStored = await AdDestination.countDocuments({ platform: "meta" });
  console.error(`[sync-tiktok-destinations] AdDestination now: tiktok=${stored} meta=${metaStored}`);

  if (result.coverage < MIN_COVERAGE) {
    console.error(
      `\n❌ coverage ${(result.coverage * 100).toFixed(1)}% is below the ${MIN_COVERAGE * 100}% threshold — ` +
        `the ad_id → smart_plus_ad_id bridge may have changed. Inspect /ad/get/ and /smart_plus/ad/get/.`,
    );
    process.exit(1);
  }
  console.error(`\n✅ done`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[sync-tiktok-destinations] failed:", e);
  process.exit(1);
});
