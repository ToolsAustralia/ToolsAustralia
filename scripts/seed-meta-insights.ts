/**
 * One-time seeding script: populates MetaAdInsightsDaily from the Meta Marketing API.
 * Fetches ad-level daily insights for the last N days and upserts into Mongo.
 *
 * Idempotent on {adAccountId, date, adId} (unique index enforces this).
 * Each run refreshes syncedAt via $set — critical for the TTL clock pattern.
 *
 * Usage:
 *   npm run seed:meta-insights             # last 30 days
 *   npm run seed:meta-insights -- --days=60
 *   npm run seed:meta-insights -- --dry-run
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import {
  fetchFacebookAdInsightsDaily,
  processInsightData,
} from "@/lib/facebook-marketing";
import { fetchAdsetMetadata, type AdsetMetadata } from "@/services/facebook-ads-health/adsetMetadataFetcher";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";
const BULK_BATCH = 800;

async function main() {
  await connectDB();

  const dryRun = process.argv.includes("--dry-run");

  // Parse --days=N
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1] ?? "30", 10) : 30;
  if (isNaN(days) || days < 1) {
    console.error("Invalid --days value. Must be a positive integer.");
    process.exit(1);
  }

  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    console.error("Missing FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  const now = new Date();
  const since = subDays(now, days);
  const sinceStr = formatInTimeZone(since, AEST, "yyyy-MM-dd");
  const untilStr = formatInTimeZone(now, AEST, "yyyy-MM-dd");

  console.error(
    `[seed-meta-insights] Starting. days=${days} window=${sinceStr}..${untilStr} dryRun=${dryRun}`
  );

  // Step 1: Fetch ad-level daily insights from Meta
  console.error("[seed-meta-insights] Step 1/3: Fetching Meta ad insights (paginated)…");
  const rawInsights = await fetchFacebookAdInsightsDaily(adAccountId, accessToken, {
    since: sinceStr,
    until: untilStr,
  }, {
    onPage: ({ page, rowsThisPage, totalRows }) => {
      console.error(
        `[seed-meta-insights] Meta API page ${page}: +${rowsThisPage} rows (${totalRows} total)`
      );
    },
    onRateLimitWait: ({ attempt, waitMs }) => {
      console.error(
        `[seed-meta-insights] Rate limit — sleeping ~${Math.round(waitMs / 1000)}s (retry ${attempt}/10)…`
      );
    },
  });
  console.error(`[seed-meta-insights] Download done: ${rawInsights.length} rows.`);

  // Step 2: Fetch adset metadata for budget/objective/learning-status join
  console.error("[seed-meta-insights] Step 2/3: Fetching adset metadata…");
  const metadataList: AdsetMetadata[] = await fetchAdsetMetadata(adAccountId, accessToken);
  const metadataByAdsetId = new Map<string, AdsetMetadata>(
    metadataList.map((m) => [m.adsetId, m])
  );
  console.error(`[seed-meta-insights] Adset metadata: ${metadataList.length} adsets.`);

  if (dryRun) {
    console.error(
      `[seed-meta-insights] [DRY-RUN] Would upsert ${rawInsights.length} rows into MetaAdInsightsDaily.`
    );
    process.exit(0);
  }

  // Step 3: Bulk upsert into MongoDB
  console.error("[seed-meta-insights] Step 3/3: Upserting into MongoDB…");

  type BulkOp = {
    updateOne: {
      filter: { adAccountId: string; date: string; adId: string };
      update: { $set: Record<string, unknown> };
      upsert: boolean;
    };
  };

  const ops: BulkOp[] = [];
  let rowsUpserted = 0;
  let batchCount = 0;

  const flush = async () => {
    if (ops.length === 0) return;
    await MetaAdInsightsDaily.bulkWrite(ops, { ordered: false });
    batchCount++;
    ops.length = 0;
  };

  for (const row of rawInsights) {
    const date = row.date_start;
    if (!date || !row.ad_id) continue;

    const metrics = processInsightData(row);
    const meta = row.adset_id ? metadataByAdsetId.get(row.adset_id) : undefined;

    const update: Record<string, unknown> = {
      adAccountId,
      date,
      adId: row.ad_id,
      adsetId: row.adset_id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      adsetName: row.adset_name,
      adName: row.ad_name,
      spendCents: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions: metrics.conversions,
      revenueCents: metrics.revenue,
      linkClicks: metrics.linkClicks,
      reach: metrics.reach,
      frequency: metrics.frequency,
      cpmCents: metrics.cpmCents,
      adsetBudgetCents: meta?.dailyBudgetCents ?? meta?.lifetimeBudgetCents ?? null,
      campaignObjective: meta?.campaignObjective ?? null,
      learningStatus: meta?.learningStatus ?? null,
      lastSignificantEdit: meta?.lastSignificantEdit ?? null,
      raw: row as unknown as Record<string, unknown>,
      // CRITICAL for TTL: $set ensures syncedAt is refreshed on every run,
      // extending the TTL clock on rows that are still being touched.
      syncedAt: new Date(),
    };

    ops.push({
      updateOne: {
        filter: { adAccountId, date, adId: row.ad_id },
        update: { $set: update },
        upsert: true,
      },
    });
    rowsUpserted++;

    if (rowsUpserted % 100 === 0) {
      console.error(`[seed-meta-insights] Progress: ${rowsUpserted} rows processed…`);
    }

    if (ops.length >= BULK_BATCH) {
      await flush();
    }
  }

  await flush();

  console.error(
    `[seed-meta-insights] Done. ${rowsUpserted} rows upserted in ${batchCount} bulk batch(es).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-meta-insights] Fatal error:", e);
  process.exit(1);
});
