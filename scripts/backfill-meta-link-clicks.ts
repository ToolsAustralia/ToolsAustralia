/**
 * Backfills MetaAdInsightsDaily.linkClicks for historical rows by re-fetching
 * from Meta's Marketing API. Default: last 90 days. --dry-run prints planned changes.
 *
 * Run: npm run backfill:meta-link-clicks -- --dry-run
 *      npm run backfill:meta-link-clicks
 */
import "dotenv/config";
import connectDB from "@/lib/mongodb";
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { fetchFacebookAdInsightsDaily } from "@/lib/facebook-marketing";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";

async function main() {
  await connectDB();
  const dryRun = process.argv.includes("--dry-run");
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) {
    console.error("Missing FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN");
    process.exit(1);
  }
  const until = new Date();
  const since = subDays(until, 90);
  const sinceStr = formatInTimeZone(since, AEST, "yyyy-MM-dd");
  const untilStr = formatInTimeZone(until, AEST, "yyyy-MM-dd");
  const insights = await fetchFacebookAdInsightsDaily(adAccountId, accessToken, { since: sinceStr, until: untilStr });
  let updated = 0;
  for (const ins of insights) {
    const linkClicks = parseInt(ins.inline_link_clicks || "0", 10);
    const update = { linkClicks };
    if (dryRun) {
      updated++;
      continue;
    }
    await MetaAdInsightsDaily.updateOne(
      { adAccountId, date: ins.date_start, adId: ins.ad_id },
      { $set: update },
    );
    updated++;
  }
  console.error(`${dryRun ? "[DRY-RUN] would update" : "Updated"} ${updated} MetaAdInsightsDaily rows with linkClicks.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
