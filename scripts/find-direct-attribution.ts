#!/usr/bin/env npx tsx
/**
 * READ-ONLY audit: what is the "direct" conversion bucket really made of?
 *
 * For every non-renewal BenefitsGranted PaymentEvent in the window whose
 * convertingPlatform is "direct" (or null — legacy unstamped rows), classify it by the
 * PERSISTED touch evidence the live resolver could not see (event data.utmSource →
 * fallback user.signupAttribution), normalized through the same normalizeUtmToPlatform
 * the resolver uses:
 *
 *   paid-touch-in-window    persisted paid UTM (meta/tiktok/snapchat/google) ≤7d old at
 *                           sale → SUSPICIOUS: a paid touch the cookies lost (ITP /
 *                           cross-device / cleared) — the real "leak" bucket.
 *   paid-touch-expired      persisted paid UTM >7d old at sale → correctly `direct`
 *                           per the attribution window (window vs monthly-draw timing).
 *   klaviyo-touch-in-window persisted Klaviyo UTM ≤5d old → suspicious (should be rare
 *                           since the owned-channel reconcile recovers these).
 *   klaviyo-touch-expired   persisted Klaviyo UTM >5d old → correctly `direct`.
 *   unrecognized-source     a utm_source exists but maps to "other".
 *   organic-no-signal       no persisted UTM anywhere → genuine direct.
 *   null-unstamped          convertingPlatform is null (pre-attribution-feature rows).
 *
 * Touch time: data.attributionSource === "session" → the sale time (captured at THIS
 * checkout → in-window by definition); otherwise signupAttribution.visitedAt, falling
 * back to user.createdAt.
 *
 * Usage:
 *   npx tsx scripts/find-direct-attribution.ts [--days=N] [--env=FILE] [--verbose] [--limit=N]
 *   --days=N    Window ending now (default 35 — covers a full draw cycle).
 *   --env=FILE  Env file to load (default .env.local; use .env.production to audit prod).
 *   --verbose   Per-row classification lines (userId only — never prints email/phone).
 *   --limit=N   Stop after N direct rows (sampling).
 *
 * Safety: READ-ONLY — aggregations + finds only, zero writes, no PII in output.
 * Exit: 0 clean · 3 fatal · 1 unhandled.
 * Env: MONGODB_URI in the chosen env file.
 * @module scripts/find-direct-attribution
 */
import { config } from "dotenv";
import path from "path";

const ENV_ARG = process.argv.find((a) => a.startsWith("--env="));
const ENV_FILE = ENV_ARG ? ENV_ARG.split("=").slice(1).join("=") : ".env.local";
config({ path: path.resolve(process.cwd(), ENV_FILE) });

const DAYS_ARG = process.argv.find((a) => a.startsWith("--days="));
const WINDOW_DAYS = DAYS_ARG ? parseInt(DAYS_ARG.split("=")[1], 10) : 35;
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;
const VERBOSE = process.argv.includes("--verbose");

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID_WINDOW_DAYS = 7; // mirrors platformPriority windowDays for paid channels
const KLAVIYO_WINDOW_DAYS = 5; // mirrors platformPriority windowDays for klaviyo_email/sms

type Category =
  | "paid-touch-in-window"
  | "paid-touch-expired"
  | "klaviyo-touch-in-window"
  | "klaviyo-touch-expired"
  | "unrecognized-source"
  | "organic-no-signal"
  | "null-unstamped";

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  const connectDB = (await import("../src/lib/mongodb")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const User = (await import("../src/models/User")).default;
  const { normalizeUtmToPlatform } = await import("../src/services/attribution/normalizePlatform");

  await connectDB();
  const startedAt = Date.now();
  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS);
  console.log(`find-direct-attribution — READ-ONLY audit`);
  console.log(`  env file : ${ENV_FILE}`);
  console.log(`  window   : last ${WINDOW_DAYS} days (since ${since.toISOString()})`);

  // ── Context: full convertingPlatform distribution for the window (non-renewal conversions) ──
  const baseMatch = {
    eventType: "BenefitsGranted",
    timestamp: { $gte: since },
    isRenewal: { $ne: true },
  };
  const distribution: Array<{ _id: string | null; n: number }> = await PaymentEvent.aggregate([
    { $match: baseMatch },
    { $group: { _id: "$convertingPlatform", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  const totalConversions = distribution.reduce((a, d) => a + d.n, 0);
  console.log(`\nConversion distribution (${totalConversions} non-renewal BenefitsGranted):`);
  for (const d of distribution) {
    const pct = totalConversions ? ((d.n / totalConversions) * 100).toFixed(1) : "0.0";
    console.log(`  ${String(d._id ?? "null (unstamped)").padEnd(22)} ${String(d.n).padStart(6)}  ${pct}%`);
  }

  // ── The direct + null slice, classified ──
  const directMatch = { ...baseMatch, $or: [{ convertingPlatform: "direct" }, { convertingPlatform: null }] };
  const totalDirect = await PaymentEvent.countDocuments(directMatch);
  const auditTotal = Math.min(totalDirect, LIMIT);
  console.log(`\nAuditing ${auditTotal}/${totalDirect} direct/null conversions…`);

  const counts: Record<Category, number> = {
    "paid-touch-in-window": 0,
    "paid-touch-expired": 0,
    "klaviyo-touch-in-window": 0,
    "klaviyo-touch-expired": 0,
    "unrecognized-source": 0,
    "organic-no-signal": 0,
    "null-unstamped": 0,
  };
  const expiredPaidAgesDays: number[] = [];
  const expiredPaidByPlatform: Record<string, number> = {};
  const inWindowPaidByPlatform: Record<string, number> = {};

  const progressEvery = Math.max(1, Math.floor(auditTotal / 20));
  let processed = 0;

  const cursor = PaymentEvent.find(directMatch)
    .select("userId timestamp convertingPlatform data packageType")
    .sort({ timestamp: -1 })
    .limit(Number.isFinite(LIMIT) ? LIMIT : 0)
    .lean()
    .cursor({ batchSize: 500 });

  let batch: Array<Record<string, unknown>> = [];
  const flushBatch = async () => {
    if (batch.length === 0) return;
    const userIds = [...new Set(batch.map((e) => String(e.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
      .select("signupAttribution createdAt")
      .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    for (const ev of batch) {
      const data = (ev.data ?? {}) as Record<string, unknown>;
      const user = userById.get(String(ev.userId)) as
        | { signupAttribution?: { utmSource?: string; utmMedium?: string; visitedAt?: Date }; createdAt?: Date }
        | undefined;
      const saleAt = (ev.timestamp as Date).getTime();

      let category: Category;
      let detail = "";

      if (ev.convertingPlatform == null) {
        category = "null-unstamped";
      } else {
        // Persisted UTM: event data blob first (merged session→signup at grant time),
        // then the user's signup snapshot.
        const utmSource =
          (typeof data.utmSource === "string" && data.utmSource) ||
          user?.signupAttribution?.utmSource ||
          undefined;
        const utmMedium =
          (typeof data.utmMedium === "string" && data.utmMedium) ||
          user?.signupAttribution?.utmMedium ||
          undefined;
        const platform = normalizeUtmToPlatform(utmSource, utmMedium);

        if (!platform) {
          category = "organic-no-signal";
        } else if (platform === "other") {
          category = "unrecognized-source";
          detail = `utm_source=${utmSource}`;
        } else {
          const touchAt =
            data.attributionSource === "session"
              ? saleAt
              : (user?.signupAttribution?.visitedAt?.getTime() ?? user?.createdAt?.getTime() ?? null);
          const ageDays = touchAt != null ? (saleAt - touchAt) / DAY_MS : null;
          const isKlaviyo = platform === "klaviyo_email" || platform === "klaviyo_sms";
          const windowDays = isKlaviyo ? KLAVIYO_WINDOW_DAYS : PAID_WINDOW_DAYS;
          const inWindow = ageDays != null && ageDays >= 0 && ageDays <= windowDays;

          if (isKlaviyo) {
            category = inWindow ? "klaviyo-touch-in-window" : "klaviyo-touch-expired";
          } else if (inWindow) {
            category = "paid-touch-in-window";
            inWindowPaidByPlatform[platform] = (inWindowPaidByPlatform[platform] ?? 0) + 1;
          } else {
            category = "paid-touch-expired";
            expiredPaidByPlatform[platform] = (expiredPaidByPlatform[platform] ?? 0) + 1;
            if (ageDays != null) expiredPaidAgesDays.push(ageDays);
          }
          detail = `${platform} touch ${ageDays != null ? ageDays.toFixed(1) + "d before sale" : "age unknown"}`;
        }
      }

      counts[category]++;
      processed++;
      if (VERBOSE) {
        console.log(`  [${category}] user=${String(ev.userId)} pkg=${String(ev.packageType)} ${detail}`);
      }
      if (processed % progressEvery === 0 || processed === auditTotal) {
        const elapsed = Date.now() - startedAt;
        const rate = processed / (elapsed / 1000);
        const etaMs = rate > 0 ? ((auditTotal - processed) / rate) * 1000 : 0;
        console.log(
          `  progress ${processed}/${auditTotal} (${((processed / auditTotal) * 100).toFixed(0)}%) · ${rate.toFixed(0)}/s · ETA ${formatDuration(etaMs)}`,
        );
      }
    }
    batch = [];
  };

  for await (const ev of cursor) {
    batch.push(ev as unknown as Record<string, unknown>);
    if (batch.length >= 500) await flushBatch();
  }
  await flushBatch();

  // ── Summary ──
  console.log(`\n══ DIRECT BUCKET BREAKDOWN (${processed} rows) ══`);
  const order: Category[] = [
    "paid-touch-in-window",
    "klaviyo-touch-in-window",
    "paid-touch-expired",
    "klaviyo-touch-expired",
    "unrecognized-source",
    "organic-no-signal",
    "null-unstamped",
  ];
  for (const c of order) {
    const pct = processed ? ((counts[c] / processed) * 100).toFixed(1) : "0.0";
    console.log(`  ${c.padEnd(26)} ${String(counts[c]).padStart(6)}  ${pct}%`);
  }
  const medAge = median(expiredPaidAgesDays);
  if (medAge != null) {
    console.log(`\n  expired paid touches — median age at sale: ${medAge.toFixed(1)} days`);
  }
  if (Object.keys(expiredPaidByPlatform).length) {
    console.log(`  expired paid by platform: ${JSON.stringify(expiredPaidByPlatform)}`);
  }
  if (Object.keys(inWindowPaidByPlatform).length) {
    console.log(`  IN-WINDOW paid (suspicious leak) by platform: ${JSON.stringify(inWindowPaidByPlatform)}`);
  }
  console.log(
    `\nInterpretation: "paid/klaviyo-touch-in-window" = touches the cookie-only resolver LOST` +
      ` (ITP/cross-device) — the real leak. "*-expired" = correctly direct under the window` +
      ` model (window vs draw timing). "organic-no-signal" = genuine direct.`,
  );
  console.log(`\nDone in ${formatDuration(Date.now() - startedAt)} (read-only; nothing written).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("find-direct-attribution fatal:", e);
  process.exit(3);
});
