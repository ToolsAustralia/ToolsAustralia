#!/usr/bin/env npx tsx
/**
 * Rebuild LandingPageMetricsDaily for every date still covered by MetaAdInsightsDaily
 * (~60-day TTL window) so each resolved row gains the packagesFocus split
 * (membership vs one-time, derived from MetaAdDestination.rawUrls). Row totals are
 * recomputed by the SAME idempotent per-day delete+rewrite the crons use — this
 * script just widens the window once. Dates older than the insights TTL keep their
 * existing rows (no split → read as "unclassified").
 *
 * LIVE mode recomputes ONE DATE AT A TIME so a bad date can't abort the rest of the
 * window — errors are tallied per date and the run continues.
 *
 * Safe to re-run: recompute is deterministic from source collections.
 *
 * Usage:
 *   npx tsx scripts/backfill-packages-focus-aggregates.ts [--dry-run] [--since=YYYY-MM-DD]
 *   --dry-run     Report the dates + row counts that WOULD be rebuilt; write nothing.
 *   --since=DATE  Override the window start (default: oldest MetaAdInsightsDaily date).
 *                 Must be YYYY-MM-DD.
 *
 * Exit: 0 clean · 2 per-date errors · 3 outer/fatal · 1 unhandled.
 * Env: .env.local must have MONGODB_URI + FACEBOOK_AD_ACCOUNT_ID.
 * @module scripts/backfill-packages-focus-aggregates
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const SINCE_ARG = process.argv.find((a) => a.startsWith("--since="));
const SINCE_OVERRIDE = SINCE_ARG ? SINCE_ARG.split("=")[1] : null;

if (SINCE_OVERRIDE && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE_OVERRIDE)) {
  console.error(`--since must be YYYY-MM-DD, got "${SINCE_OVERRIDE}" — aborting.`);
  process.exit(3);
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// %-style periodic line shared by both the dry-run and the live per-date loop, per
// CLAUDE.md's operational-script progress convention.
function progressLine(done: number, total: number, startMs: number, extra: string): string {
  const el = Date.now() - startMs;
  const rate = done / Math.max(el / 1000, 0.001);
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  const etaMs = rate > 0 ? (Math.max(0, total - done) / rate) * 1000 : 0;
  return (
    `  Progress: ${done}/${total} dates (${pct}%) · ${extra}${rate.toFixed(1)}/sec · ` +
    `elapsed ${formatDuration(el)} · ETA ${formatDuration(etaMs)}`
  );
}

async function main() {
  // Resolved once, up front, so every exit path (including pre-connect ones) can
  // route through the same helper — a bare process.exit() would skip the disconnect.
  const mongoose = (await import("mongoose")).default;
  const exitWith = async (code: number): Promise<never> => {
    await mongoose.disconnect().catch(() => {});
    process.exit(code);
  };

  const connectDB = (await import("../src/lib/mongodb")).default;
  const MetaAdInsightsDaily = (await import("../src/models/MetaAdInsightsDaily")).default;
  const LandingPageMetricsDaily = (await import("../src/models/LandingPageMetricsDaily")).default;
  const { SpendByUrlAggregationService } = await import("../src/services/analytics/SpendByUrlAggregationService");

  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!adAccountId) {
    console.error("FACEBOOK_AD_ACCOUNT_ID is not set in .env.local — aborting.");
    return exitWith(3);
  }

  await connectDB();

  console.log(`Packages-focus aggregate backfill ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`  Ad account: ${adAccountId}\n`);

  // Window = every date the source collection still holds (TTL-bounded).
  const dates: string[] = (await MetaAdInsightsDaily.distinct("date", { adAccountId })).sort();
  const windowDates = SINCE_OVERRIDE ? dates.filter((d) => d >= SINCE_OVERRIDE) : dates;

  if (windowDates.length === 0) {
    console.log("No MetaAdInsightsDaily dates found — nothing to rebuild.");
    return exitWith(0);
  }

  console.log(
    `  To process: ${windowDates.length} dates (${windowDates[0]} → ${windowDates[windowDates.length - 1]})\n`,
  );

  const startMs = Date.now();
  const total = windowDates.length;
  // Adaptive cadence: ~20 progress lines regardless of size, capped at every 1000 for
  // huge windows, minimum every date for tiny ones.
  const PROGRESS_EVERY = Math.max(1, Math.min(1000, Math.floor(total / 20)));

  if (DRY_RUN) {
    // Read-only pass: per-date insight/current-aggregate counts.
    let insightTotal = 0;
    for (let i = 0; i < windowDates.length; i++) {
      const date = windowDates[i];
      const insightCount = await MetaAdInsightsDaily.countDocuments({ adAccountId, date });
      insightTotal += insightCount;
      // Meta-scoped: this backfill rebuilds Meta rows only, so the "will be replaced"
      // count must exclude any TikTok rows for the same date (2026-07-29).
      const existing = await LandingPageMetricsDaily.countDocuments({
        platform: "meta",
        adAccountId,
        date,
      });
      console.log(
        `  [dry] ${date}: ${insightCount} insight rows → currently ${existing} aggregate rows (pre-rebuild count)`,
      );
      const done = i + 1;
      if (done % PROGRESS_EVERY === 0 || done === total) {
        console.log(progressLine(done, total, startMs, `${insightTotal.toLocaleString()} insight rows · `));
      }
    }
    console.log(`\nSummary\n=======`);
    console.log(`  Mode:    DRY RUN (nothing written)`);
    console.log(`  Dates:   ${windowDates.length} · insight rows: ${insightTotal.toLocaleString()}`);
    console.log(`  Elapsed: ${formatDuration(Date.now() - startMs)}`);
    console.log(`  Next:    npm run backfill:packages-focus`);
  } else {
    const service = new SpendByUrlAggregationService();
    let ok = 0;
    let errored = 0;
    let rowsWritten = 0;
    // One date per recomputeForDateRange call so a bad date can't abort the rest of
    // the window. No onProgress passthrough: with since === until the service
    // would print 2 unthrottled lines per date (~120 for a full window); the
    // adaptive %-style Progress line below is the sole progress channel.
    for (let i = 0; i < windowDates.length; i++) {
      const date = windowDates[i];
      try {
        const result = await service.recomputeForDateRange("meta", adAccountId, date, date, {});
        rowsWritten += result.rowsWritten;
        ok++;
      } catch (e) {
        errored++;
        console.error(`  ✗ ${date}: recompute failed — ${e instanceof Error ? e.message : String(e)}`);
      }
      const done = i + 1;
      if (done % PROGRESS_EVERY === 0 || done === total) {
        console.log(progressLine(done, total, startMs, `${ok} ok · ${errored} err · `));
      }
    }
    console.log(`\nSummary\n=======`);
    console.log(`  Mode:      LIVE`);
    console.log(
      `  Dates:     ${total} · ok: ${ok} · errored: ${errored} · rows written: ${rowsWritten.toLocaleString()}`,
    );
    console.log(`  Elapsed:   ${formatDuration(Date.now() - startMs)}`);
    if (errored > 0) {
      console.log(`  ⚠️ ${errored} date(s) failed to recompute — see ✗ lines above.`);
      return exitWith(2);
    }
  }

  return exitWith(0);
}

main().catch((err) => {
  console.error("\n🚨 Backfill aborted with unhandled error:", err);
  process.exit(1);
});
