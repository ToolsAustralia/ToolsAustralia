#!/usr/bin/env npx tsx

/**
 * Compare promo page "unique visitors" (PromoAnalyticsVisit) vs "new registrations" (User.signupAttribution)
 * for a single slug — same definitions as the admin Page Analytics dashboard.
 *
 * Usage:
 *   npx tsx scripts/promo-analytics-compare.ts
 *   npx tsx scripts/promo-analytics-compare.ts today | yesterday
 *   npx tsx scripts/promo-analytics-compare.ts [slug] [pageType] today | yesterday
 *   npx tsx scripts/promo-analytics-compare.ts [slug] [pageType] YYYY-MM-DD YYYY-MM-DD
 *
 * Examples:
 *   npx tsx scripts/promo-analytics-compare.ts ryobi toolset today
 *   npx tsx scripts/promo-analytics-compare.ts milwaukee toolset 2025-03-01 2025-03-23
 *
 * Env: MONGODB_URI in .env.local
 */

import { config } from "dotenv";
import path from "path";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { getStartOfTodayInAEST, createAESTDateAsUTC } from "../src/utils/common/timezone";

config({ path: path.resolve(process.cwd(), ".env.local") });

const AEST_TIMEZONE = "Australia/Sydney";

function parseCli(argv: string[]): {
  slug: string;
  pageType: "evergreen" | "toolset";
  rangeStart: Date;
  rangeEnd: Date;
  label: string;
} {
  let slug = "ryobi";
  let pageType: "evergreen" | "toolset" = "toolset";
  const args = [...argv];

  const last = args[args.length - 1];
  const secondLast = args[args.length - 2];
  const hasCustomRange =
    args.length >= 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(secondLast ?? "") &&
    /^\d{4}-\d{2}-\d{2}$/.test(last ?? "");

  if (hasCustomRange) {
    const endDateStr = args.pop()!;
    const startDateStr = args.pop()!;
    if (args[0] && args[0] !== "today" && args[0] !== "yesterday") slug = args[0].toLowerCase().trim();
    if (args[1] === "evergreen" || args[1] === "toolset") pageType = args[1];
    const [sy, sm, sd] = startDateStr.split("-").map(Number);
    const [ey, em, ed] = endDateStr.split("-").map(Number);
    const rangeStart = createAESTDateAsUTC(sy, sm, sd, 0, 0);
    const rangeEnd = createAESTDateAsUTC(ey, em, ed, 23, 59);
    rangeEnd.setUTCSeconds(59, 999);
    return {
      slug,
      pageType,
      rangeStart,
      rangeEnd,
      label: `${startDateStr} → ${endDateStr} (AEST)`,
    };
  }

  let preset: "today" | "yesterday" = "today";
  if (last === "today" || last === "yesterday") {
    preset = last;
    args.pop();
  }

  if (args[0] && args[0] !== "today" && args[0] !== "yesterday") {
    slug = args[0].toLowerCase().trim();
  }
  if (args[1] === "evergreen" || args[1] === "toolset") {
    pageType = args[1];
  }

  const startOfToday = getStartOfTodayInAEST();
  const now = new Date();
  const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
  const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
  endOfToday.setUTCSeconds(59, 999);

  if (preset === "yesterday") {
    return {
      slug,
      pageType,
      rangeStart: subDays(startOfToday, 1),
      rangeEnd: new Date(startOfToday.getTime() - 1),
      label: "Yesterday (AEST)",
    };
  }

  return {
    slug,
    pageType,
    rangeStart: startOfToday,
    rangeEnd: endOfToday,
    label: "Today (AEST)",
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to .env.local.");
    process.exit(1);
  }

  const { slug, pageType, rangeStart, rangeEnd, label } = parseCli(process.argv.slice(2));

  const { default: connectDB } = await import("../src/lib/mongodb");
  const { default: PromoAnalyticsRepository } = await import("../src/repositories/PromoAnalyticsRepository");

  await connectDB();
  const summary = await PromoAnalyticsRepository.getAggregatedByPage(rangeStart, rangeEnd);
  const row = summary.byPage.find((p) => p.slug === slug && p.pageType === pageType);

  console.log("\nPromo analytics comparison (matches admin Page Analytics definitions)\n");
  console.log(`  Period:     ${label}`);
  console.log(`  Range UTC:  ${rangeStart.toISOString()} → ${rangeEnd.toISOString()}`);
  console.log(`  Page:       ${pageType} / ${slug}\n`);

  if (!row) {
    console.log("  No row for this slug/pageType in the configured page list (check slug spelling).");
    console.log(`  Totals in range — visits (summed): ${summary.totalVisits}, signups: ${summary.totalSignups}\n`);
    process.exit(0);
  }

  const ratio = row.visits > 0 ? row.signups / row.visits : null;
  console.log(`  Unique visitors (this page):  ${row.visits}`);
  console.log(`  New registrations (accounts):   ${row.signups}`);
  console.log(`  Cross-visits (from toolsets):   ${row.crossVisits}`);
  console.log(`  V→S %:                          ${row.visitToSignupRate.toFixed(1)}%`);
  if (ratio !== null) {
    console.log(`  Registrations / visitor:        ${ratio.toFixed(2)}`);
  }
  console.log("\n  Interpretation:");
  console.log(
    "  Signups can exceed unique visitors when multiple accounts share one browser session"
  );
  console.log(
    "  (same anonymous cookie), or when the visit beacon failed but signup still sent the promo slug.\n"
  );
  console.log("  Headline dashboard totals sum unique visitors across all pages (not global uniques).");
  console.log(`  Summed totalVisits in API: ${summary.totalVisits}, totalSignups: ${summary.totalSignups}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
