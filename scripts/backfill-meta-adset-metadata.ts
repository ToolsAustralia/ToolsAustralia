/**
 * Backfills adsetBudgetCents, campaignObjective, learningStatus, lastSignificantEdit
 * onto MetaAdInsightsDaily rows from the live adset metadata snapshot. Note: this
 * fills the CURRENT state across historical rows — Meta doesn't expose
 * historical learning_stage_info.
 *
 * Run: npm run backfill:meta-adset-metadata -- --dry-run
 */
import "dotenv/config";
import connectDB from "@/lib/mongodb";
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { fetchAdsetMetadata } from "@/services/facebook-ads-health/adsetMetadataFetcher";

async function main() {
  await connectDB();
  const dryRun = process.argv.includes("--dry-run");
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    console.error("Missing FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN");
    process.exit(1);
  }
  const metadata = await fetchAdsetMetadata(adAccountId, accessToken);
  console.error(`Fetched metadata for ${metadata.length} adsets.`);
  let updated = 0;
  for (const m of metadata) {
    const update = {
      adsetBudgetCents: m.dailyBudgetCents ?? m.lifetimeBudgetCents ?? null,
      campaignObjective: m.campaignObjective,
      learningStatus: m.learningStatus,
      lastSignificantEdit: m.lastSignificantEdit,
    };
    if (dryRun) {
      const count = await MetaAdInsightsDaily.countDocuments({ adAccountId, adsetId: m.adsetId });
      updated += count;
      continue;
    }
    const res = await MetaAdInsightsDaily.updateMany(
      { adAccountId, adsetId: m.adsetId },
      { $set: update },
    );
    updated += res.modifiedCount;
  }
  console.error(`${dryRun ? "[DRY-RUN] would update" : "Updated"} ${updated} MetaAdInsightsDaily rows.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
