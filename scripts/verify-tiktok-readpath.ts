/**
 * One-off verification (2026-07-29): does the READ path the admin dashboard uses agree
 * with the rows the sync stored?
 *
 * Exercises the real services — no re-implementation — so a drift between the writer and
 * either reader shows up here:
 *   1. getTikTokAdInsights()      → the TikTok tab's per-ad table + totals
 *   2. tiktokAdChannelProvider    → the Overview Advertising card / blended ROAS / MER
 *
 * Read-only. Run: npx tsx scripts/verify-tiktok-readpath.ts [--days=30]
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { getTikTokAdInsights } from "@/services/admin/tiktok/tiktokAdInsightsQuery";
import { tiktokAdChannelProvider } from "@/services/admin/dashboard-stats/adChannelProviders";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const AEST = "Australia/Sydney";
const money = (n: number) => `$${n.toFixed(2)}`;

async function main() {
  await connectDB();

  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? parseInt(daysArg.split("=")[1] ?? "30", 10) : 30;
  const now = new Date();
  const startDate = formatInTimeZone(subDays(now, days), AEST, "yyyy-MM-dd");
  const endDate = formatInTimeZone(now, AEST, "yyyy-MM-dd");
  console.log(`Window ${startDate} → ${endDate}\n`);

  // ── Ground truth: raw stored rows ───────────────────────────────────────────
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  const raw = await TikTokAdInsightsDaily.find({
    date: { $gte: startDate, $lte: endDate },
    ...(advertiserId ? { adAccountId: advertiserId } : {}),
  }).lean<
    Array<{ date: string; adId: string; spendCents: number; conversions: number; revenueCents: number }>
  >();
  const rawSpend = raw.reduce((s, r) => s + (r.spendCents ?? 0), 0) / 100;
  const rawConv = raw.reduce((s, r) => s + (r.conversions ?? 0), 0);
  const rawRev = raw.reduce((s, r) => s + (r.revenueCents ?? 0), 0) / 100;
  const distinctAds = new Set(raw.map((r) => r.adId)).size;
  console.log(`STORED  rows=${raw.length} ads=${distinctAds} spend=${money(rawSpend)} purchases=${rawConv} value=${money(rawRev)}`);

  let failures = 0;
  const check = (label: string, a: number, b: number, tol = 0.011) => {
    const ok = Math.abs(a - b) <= tol;
    if (!ok) failures++;
    console.log(`  ${ok ? "✅" : "❌"} ${label}: ${a.toFixed(2)} vs ${b.toFixed(2)}`);
  };

  // ── 1. Per-ad table read ────────────────────────────────────────────────────
  console.log(`\n1. getTikTokAdInsights() — TikTok tab`);
  const insights = await getTikTokAdInsights({ startDate, endDate });
  console.log(`   configured=${insights.configured} rows=${insights.rows.length}`);
  check("total spend", insights.totals.spend, rawSpend);
  check("total purchases", insights.totals.conversions, rawConv, 0);
  check("total value", insights.totals.revenue, rawRev);
  check("ad count", insights.rows.length, distinctAds, 0);
  const sumRows = insights.rows.reduce((s, r) => s + r.spend, 0);
  check("per-ad rows sum to totals", sumRows, insights.totals.spend);
  const expectedRoas = rawSpend > 0 ? rawRev / rawSpend : 0;
  check("totals.roas", insights.totals.roas, expectedRoas, 0.0001);
  const top = insights.rows[0];
  if (top) {
    console.log(`   top ad: "${top.adName ?? top.adId}" spend=${money(top.spend)} purchases=${top.conversions} value=${money(top.revenue)} roas=${top.roas.toFixed(2)}x`);
  }
  // Sorted by spend desc?
  const sorted = insights.rows.every((r, i, a) => i === 0 || a[i - 1].spend >= r.spend);
  console.log(`  ${sorted ? "✅" : "❌"} rows sorted by spend desc`);
  if (!sorted) failures++;

  // ── 2. Ad-channel provider (Overview card / blended ROAS / MER) ─────────────
  console.log(`\n2. tiktokAdChannelProvider — Overview card`);
  const byDay = new Map<string, { spend: number; revenue: number; conv: number }>();
  for (const r of raw) {
    const cur = byDay.get(r.date) ?? { spend: 0, revenue: 0, conv: 0 };
    cur.spend += (r.spendCents ?? 0) / 100;
    cur.revenue += (r.revenueCents ?? 0) / 100;
    cur.conv += r.conversions ?? 0;
    byDay.set(r.date, cur);
  }
  const days3 = [...byDay.keys()].sort().slice(-3);
  for (const dateKey of days3) {
    const [y, m, d] = dateKey.split("-").map(Number);
    // Midday UTC anchor lands inside the AEST day the provider derives.
    const dayStartUTC = new Date(Date.UTC(y, m - 1, d, 2, 0, 0));
    const result = await tiktokAdChannelProvider.fetchForDay({ dayStartUTC, dayEndUTC: dayStartUTC });
    const expect = byDay.get(dateKey)!;
    if (result.status !== "ok") {
      console.log(`  ❌ ${dateKey}: provider returned "${result.status}" but ${raw.filter(r=>r.date===dateKey).length} rows exist`);
      failures++;
      continue;
    }
    const okSpend = Math.abs(result.metrics.spend - expect.spend) <= 0.011;
    const okRev = Math.abs(result.metrics.revenue - expect.revenue) <= 0.011;
    const expRoas = expect.spend > 0 ? expect.revenue / expect.spend : 0;
    const okRoas = Math.abs(result.metrics.roas - expRoas) <= 0.0001;
    if (!okSpend || !okRev || !okRoas) failures++;
    console.log(
      `  ${okSpend && okRev && okRoas ? "✅" : "❌"} ${dateKey}: spend ${money(result.metrics.spend)} (exp ${money(expect.spend)}) · value ${money(result.metrics.revenue)} (exp ${money(expect.revenue)}) · roas ${result.metrics.roas.toFixed(3)}x`,
    );
  }

  // A future day must be "empty", never a fabricated zero row.
  const future = await tiktokAdChannelProvider.fetchForDay({
    dayStartUTC: new Date(Date.now() + 5 * 864e5),
    dayEndUTC: new Date(Date.now() + 5 * 864e5),
  });
  console.log(`  ${future.status === "empty" ? "✅" : "❌"} future day → "${future.status}" (expected "empty")`);
  if (future.status !== "empty") failures++;

  console.log(`\n${failures === 0 ? "✅ READ PATHS ACCURATE — no drift between writer and readers" : `❌ ${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-tiktok-readpath failed:", e);
  process.exit(1);
});
