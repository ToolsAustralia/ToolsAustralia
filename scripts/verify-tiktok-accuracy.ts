#!/usr/bin/env npx tsx
/**
 * Cross-source accuracy check for the TikTok analytics pipeline.
 *
 * Every figure is derived from a DIFFERENT source than the one it's compared against, so
 * agreement is evidence rather than tautology:
 *
 *   A. TikTok's own API      — live `/report/integrated/get/`
 *   B. TikTokAdInsightsDaily — what the sync stored
 *   C. LandingPageMetricsDaily — the per-URL rollup every dashboard surface reads
 *   D. PackagesFocusBreakdownService — what the Ad Spend drill-down modal renders
 *
 * A→B catches a broken sync, B→C a broken aggregation, C→D a broken read path. It also
 * asserts the platform scoping actually holds (no unstamped rows, no cross-namespaced
 * `unknown://` placeholders) and that Meta's rollup still reconciles with Meta's insights —
 * the regression that platform-scoping the shared collections could plausibly cause.
 *
 * ## The current AEST day is excluded from A→B on purpose
 *
 * B is a snapshot taken when the sync last ran; A is live. Today's spend keeps accruing
 * between the two, so comparing them strictly would fail every run for a non-reason — an
 * alarm that always fires teaches people to ignore it. Today is still REPORTED (as drift,
 * with the last-sync time) so genuine staleness stays visible; it just isn't a failure.
 *
 * Usage:
 *   npm run verify:tiktok-accuracy                          # trailing 7 days
 *   npm run verify:tiktok-accuracy -- --since=2026-06-01 --until=2026-06-30
 *
 * Exit: 0 = all checks passed · 1 = a check failed (or creds/DB unavailable).
 */
import { config } from "dotenv";
import path from "path";
import { subDays, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import LandingPageMetricsDaily from "@/models/LandingPageMetricsDaily";
import AdDestination from "@/models/AdDestination";
import { fetchTikTokAdInsightsDaily } from "@/services/admin/tiktok/tiktokAdInsights";
import { PackagesFocusBreakdownService } from "@/services/analytics/PackagesFocusBreakdownService";
import { resolveAdAccountId } from "@/services/analytics/adPlatformAccounts";

const AEST = "Australia/Sydney";

/** Meta restates spend for days after the fact; allow a small absolute drift there. */
const META_TOLERANCE_CENTS = 50;

function parseArgs(): { since: string; until: string } {
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
  };
}

const aud = (cents: number) => `$${(cents / 100).toFixed(2)}`;

let failures = 0;
function check(label: string, a: number, b: number, toleranceCents = 2) {
  const ok = Math.abs(a - b) <= toleranceCents;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(50)} ${aud(a)} vs ${aud(b)}`);
}
function assert(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(50)} ${detail}`);
}

async function main() {
  const { since, until } = parseArgs();
  const advertiserId = resolveAdAccountId("tiktok");
  const metaAccountId = resolveAdAccountId("meta");
  if (!advertiserId) {
    console.error("TIKTOK_ADVERTISER_ID not set — nothing to verify.");
    process.exit(1);
  }

  await connectDB();
  const todayAest = formatInTimeZone(new Date(), AEST, "yyyy-MM-dd");
  console.log(`\n=== TikTok accuracy pass · ${since} → ${until} (today AEST: ${todayAest}) ===\n`);

  // ── A. live TikTok API ──────────────────────────────────────────────────────
  const live = await fetchTikTokAdInsightsDaily(since, until);
  if (!live) {
    console.error("TikTok Marketing-API creds not configured — cannot verify.");
    await mongoose.disconnect();
    process.exit(1);
  }
  const liveByDate = new Map<string, number>();
  for (const r of live) liveByDate.set(r.date, (liveByDate.get(r.date) ?? 0) + r.spendCents);
  const liveClosed = live.filter((r) => r.date !== todayAest);
  const apiSpendClosed = liveClosed.reduce((s, r) => s + r.spendCents, 0);
  const apiRevenueClosed = liveClosed.reduce((s, r) => s + r.revenueCents, 0);
  const apiConvClosed = liveClosed.reduce((s, r) => s + r.conversions, 0);

  // ── B. stored insights ──────────────────────────────────────────────────────
  const [storedAll] = await TikTokAdInsightsDaily.aggregate([
    { $match: { adAccountId: advertiserId, date: { $gte: since, $lte: until } } },
    { $group: { _id: null, spend: { $sum: "$spendCents" }, rev: { $sum: "$revenueCents" }, conv: { $sum: "$conversions" }, n: { $sum: 1 }, syncedAt: { $max: "$syncedAt" } } },
  ]);
  const [storedClosed] = await TikTokAdInsightsDaily.aggregate([
    { $match: { adAccountId: advertiserId, date: { $gte: since, $lte: until, $ne: todayAest } } },
    { $group: { _id: null, spend: { $sum: "$spendCents" }, rev: { $sum: "$revenueCents" }, conv: { $sum: "$conversions" } } },
  ]);
  const B = storedAll ?? { spend: 0, rev: 0, conv: 0, n: 0, syncedAt: null };
  const Bc = storedClosed ?? { spend: 0, rev: 0, conv: 0 };

  // ── C. per-URL rollup ───────────────────────────────────────────────────────
  const [rollup] = await LandingPageMetricsDaily.aggregate([
    { $match: { platform: "tiktok", adAccountId: advertiserId, date: { $gte: since, $lte: until } } },
    { $group: { _id: null, spend: { $sum: "$spendCents" }, rev: { $sum: "$revenueCents" }, conv: { $sum: "$conversions" }, n: { $sum: 1 } } },
  ]);
  const C = rollup ?? { spend: 0, rev: 0, conv: 0, n: 0 };

  // ── D. what the modal renders ───────────────────────────────────────────────
  const D = await new PackagesFocusBreakdownService().getBreakdownFormatted(
    "tiktok", advertiserId, since, until,
  );

  const lastSync = B.syncedAt
    ? new Date(B.syncedAt).toLocaleString("en-AU", { timeZone: AEST })
    : "never";
  console.log(`A. TikTok API (live)      ${live.length} rows`);
  console.log(`B. TikTokAdInsightsDaily  ${B.n} rows · last synced ${lastSync}`);
  console.log(`C. LandingPageMetrics     ${C.n} rows`);
  console.log(`D. PackagesFocus modal    ${aud(D.summary.total.spendCents)} total\n`);

  console.log(`A → B  (closed days only; today excluded — see file header)`);
  check("live API spend === stored spend", apiSpendClosed, Bc.spend);
  check("live API revenue === stored revenue", apiRevenueClosed, Bc.rev);
  assert("conversions match", apiConvClosed === Bc.conv, `${apiConvClosed} vs ${Bc.conv}`);

  console.log(`\nB → C → D  (full range — all snapshots, so strict)`);
  check("stored spend === rollup spend", B.spend, C.spend);
  check("stored revenue === rollup revenue", B.rev, C.rev);
  check("rollup spend === modal total spend", C.spend, D.summary.total.spendCents);
  check("rollup revenue === modal total revenue", C.rev, D.summary.total.revenueCents);
  check(
    "focus buckets sum === total (no spend lost)",
    D.summary.membership.spendCents + D.summary["one-time"].spendCents + D.summary.unclassified.spendCents,
    D.summary.total.spendCents,
  );
  assert("conversions B === C", B.conv === C.conv, `${B.conv} vs ${C.conv}`);

  console.log(`\nPLATFORM SCOPING`);
  const [mRollup, tRollup, uRollup, mDest, tDest, uDest, crossNs] = await Promise.all([
    LandingPageMetricsDaily.countDocuments({ platform: "meta" }),
    LandingPageMetricsDaily.countDocuments({ platform: "tiktok" }),
    LandingPageMetricsDaily.countDocuments({ platform: { $exists: false } }),
    AdDestination.countDocuments({ platform: "meta" }),
    AdDestination.countDocuments({ platform: "tiktok" }),
    AdDestination.countDocuments({ platform: { $exists: false } }),
    LandingPageMetricsDaily.countDocuments({
      $or: [
        { platform: "meta", canonicalUrl: /^unknown:\/\/tiktok-ad\// },
        { platform: "tiktok", canonicalUrl: /^unknown:\/\/meta-ad\// },
      ],
    }),
  ]);
  assert("every rollup row is stamped", uRollup === 0, `meta=${mRollup} tiktok=${tRollup} unstamped=${uRollup}`);
  assert("every destination doc is stamped", uDest === 0, `meta=${mDest} tiktok=${tDest} unstamped=${uDest}`);
  assert("no cross-namespaced unknown:// rows", crossNs === 0, `${crossNs} found`);

  if (metaAccountId) {
    console.log(`\nMETA REGRESSION (platform scoping must not have disturbed Meta)`);
    const [mA] = await LandingPageMetricsDaily.aggregate([
      { $match: { platform: "meta", adAccountId: metaAccountId, date: { $gte: since, $lte: until } } },
      { $group: { _id: null, spend: { $sum: "$spendCents" }, n: { $sum: 1 } } },
    ]);
    const [mI] = await MetaAdInsightsDaily.aggregate([
      { $match: { adAccountId: metaAccountId, date: { $gte: since, $lte: until } } },
      { $group: { _id: null, spend: { $sum: "$spendCents" } } },
    ]);
    check("Meta insights spend === Meta rollup spend", mI?.spend ?? 0, mA?.spend ?? 0, META_TOLERANCE_CENTS);
  }

  // Informational: today's drift is expected, but a LARGE gap means a stale sync.
  const todayLive = liveByDate.get(todayAest) ?? 0;
  const [todayStored] = await TikTokAdInsightsDaily.aggregate([
    { $match: { adAccountId: advertiserId, date: todayAest } },
    { $group: { _id: null, spend: { $sum: "$spendCents" } } },
  ]);
  if (todayLive > 0 || todayStored) {
    const drift = todayLive - (todayStored?.spend ?? 0);
    console.log(`\nTODAY (${todayAest}) — informational, not a check`);
    console.log(
      `  stored ${aud(todayStored?.spend ?? 0)} · live ${aud(todayLive)} · drift ${aud(drift)} — ` +
        `spend accrued since the last sync at ${lastSync}.`,
    );
  }

  console.log(`\n${failures === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("verification failed:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
