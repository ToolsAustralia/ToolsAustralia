/**
 * Local-dev smoke check (2026-07-29): will the admin dashboard show BOTH Meta and TikTok
 * on this machine, with this `.env.local`?
 *
 * Drives the REAL `DashboardStatsService.getStats()` — the same code the admin route calls
 * — so it answers the practical question ("can I test ad analytics locally?") rather than
 * asserting that credentials merely exist. Reports, per ad platform:
 *   - whether its creds are configured at all
 *   - the ad-channel spend/ROAS that reached the snapshot layer
 *   - the per-platform attributed revenue + signups + dual ROAS the Advertising card renders
 *   - the combined `adTotals` behind the headline Ad Spend / ROAS KPIs
 *
 * Read-only. Run: npx tsx scripts/verify-local-ad-platforms.ts [--days=30]
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import { DashboardStatsService } from "@/services/admin/DashboardStatsService";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";
const money = (n: number) => `$${(n ?? 0).toFixed(2)}`;
const yn = (b: boolean) => (b ? "✅" : "❌");

async function main() {
  await connectDB();

  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1] ?? "30", 10) : 30;
  const now = new Date();
  const startDate = formatInTimeZone(subDays(now, days), AEST, "yyyy-MM-dd");
  const endDate = formatInTimeZone(now, AEST, "yyyy-MM-dd");

  console.log(`\n=== LOCAL AD-PLATFORM CHECK (${startDate} → ${endDate}) ===\n`);

  // 1. Credentials actually present in this folder's .env.local.
  const metaConfigured = Boolean(
    process.env.FACEBOOK_AD_ACCOUNT_ID && process.env.FACEBOOK_MARKETING_ACCESS_TOKEN,
  );
  const tiktokConfigured = Boolean(
    process.env.TIKTOK_ADVERTISER_ID && process.env.TIKTOK_MARKETING_ACCESS_TOKEN,
  );
  console.log("CREDENTIALS (.env.local)");
  console.log(`  ${yn(metaConfigured)} Meta   — FACEBOOK_AD_ACCOUNT_ID + FACEBOOK_MARKETING_ACCESS_TOKEN`);
  console.log(`  ${yn(tiktokConfigured)} TikTok — TIKTOK_ADVERTISER_ID + TIKTOK_MARKETING_ACCESS_TOKEN`);

  // 2. The real service call the admin route makes.
  console.log("\nCalling DashboardStatsService.getStats() (custom range)…");
  const t0 = Date.now();
  const stats = await new DashboardStatsService().getStats({
    dateRange: "custom" as never,
    startDate,
    endDate,
  });
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // 3. Headline KPIs.
  const adTotals = (stats as { adTotals?: { spend: number; revenue: number; roas: number } }).adTotals;
  const fb = (stats as { facebookAds?: { spend: number; roas: number } }).facebookAds;
  console.log("\nHEADLINE KPIs (Overview)");
  console.log(`  Ad Spend (all platforms) : ${money(adTotals?.spend ?? 0)}`);
  console.log(`  ROAS     (all platforms) : ${(adTotals?.roas ?? 0).toFixed(2)}x`);
  console.log(`  facebookAds (Meta-only, for Norm) : spend ${money(fb?.spend ?? 0)} roas ${(fb?.roas ?? 0).toFixed(2)}x`);

  // 4. Per-platform rows — exactly what the Advertising card renders.
  const ar = (stats as {
    attributedRevenue?: Record<
      string,
      { revenue: number; conversions: number; signups?: number; adSpend?: number; trueRoas?: number; platformRoas?: number; platformRevenue?: number }
    >;
  }).attributedRevenue ?? {};

  console.log("\nADVERTISING CARD ROWS");
  console.log("  platform      spend      signups  conv   revenue    ROAS·server  ROAS·platform");
  const order = ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "direct"];
  for (const key of order) {
    const e = ar[key];
    if (!e) continue;
    const spend = e.adSpend != null ? money(e.adSpend) : "—";
    const srv = e.trueRoas != null ? `${e.trueRoas.toFixed(2)}x` : "—";
    const plat = e.platformRoas != null ? `${e.platformRoas.toFixed(2)}x` : "—";
    console.log(
      `  ${key.padEnd(13)} ${spend.padStart(9)}  ${String(e.signups ?? 0).padStart(7)}  ${String(e.conversions).padStart(4)}  ${money(e.revenue).padStart(9)}  ${srv.padStart(11)}  ${plat.padStart(13)}`,
    );
  }

  // 5. Verdict — the question the user actually asked.
  const metaVisible = (ar.meta?.adSpend ?? 0) > 0;
  const tiktokVisible = (ar.tiktok?.adSpend ?? 0) > 0;
  console.log("\nVERDICT — will localhost show ad data?");
  console.log(`  ${yn(metaVisible)} Meta spend visible`);
  console.log(`  ${yn(tiktokVisible)} TikTok spend visible`);
  if (!tiktokVisible && tiktokConfigured) {
    console.log("     TikTok creds are set but no spend surfaced — check TikTokAdInsightsDaily has rows");
    console.log("     for this range in the DB that .env.local's MONGODB_URI points at, then re-run");
    console.log("     `npm run seed:tiktok-insights -- --days=30`.");
  }
  if (!metaVisible && metaConfigured) {
    console.log("     Meta creds are set but no spend surfaced — the Meta token may be expired.");
  }

  process.exit(metaVisible && tiktokVisible ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-local-ad-platforms failed:", e);
  process.exit(1);
});
