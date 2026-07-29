// src/services/admin/hourlyRevenueByPlatform.ts
//
// Hour-of-day (0-23, Australia/Sydney) revenue + conversions + ad spend for a
// date range, merged into a single 24-bucket series per platform group.
//
// Revenue/conversions come from payment-attributed PaymentEvents (acquisition
// only — renewals + refunds excluded) via
// PaymentEventRepository.aggregateRevenueByHourAndPlatform (SHARED-1). Ad spend
// is pulled hourly from Meta (now) and TikTok (when configured); groups with no
// spend source (Snapchat, Klaviyo) yield `spend: null` so the UI renders "—".
//
// Shared by the admin route (`/api/admin/analytics/hourly-revenue`) and the
// Norm read route (`/api/internal/norm/v1/analytics/hourly-revenue`).
//
// Intended for bounded UI date-picker ranges — the underlying refund-exclusion
// `$lookup` is per-row, so very large spans are a perf hot-spot.
import connectDB from "@/lib/mongodb";
import { PaymentEventRepository } from "@/repositories/PaymentEventRepository";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
import { fetchFacebookInsightsHourly } from "@/lib/facebook-marketing";
import {
  fetchTikTokHourlySpend,
  isTikTokSpendConfigured,
} from "@/services/admin/tiktok/tiktokHourlySpend";

export interface HourlyRevenueInput {
  startDate: string;
  endDate: string;
  platform: "meta" | "tiktok" | "snapchat" | "klaviyo" | "ad-channels" | "all";
}

export interface HourlyRevenueResult {
  hourly: Array<{ hour: number; revenue: number; conversions: number; spend: number | null }>;
  totalRevenue: number;
  totalConversions: number;
  totalSpend: number | null;
  platform: string;
  dateRange: { start: string; end: string };
}

// Maps the `platform` value → the convertingPlatform keys to sum (merge rule, stated once).
// `ad-channels` = the 5 advertising/marketing channels (matches the overview card +
// All-Platforms aggregate scope); `all` additionally includes google/direct/other.
const PLATFORM_GROUPS: Record<string, AttributedPlatformKey[]> = {
  meta: ["meta"],
  tiktok: ["tiktok"],
  snapchat: ["snapchat"],
  klaviyo: ["klaviyo_email", "klaviyo_sms"],
  "ad-channels": ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms"],
  all: ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"],
};

/**
 * Meta hourly spend (dollars, 24 buckets) — null if not configured / on error.
 * Hour buckets use the FB ad-account's `advertiser_time_zone` (ASSUMED Australia/Sydney
 * to align with the AEST revenue buckets; verify the ad-account tz — if it differs, the
 * spend hours are offset from the revenue hours).
 */
async function fetchMetaHourlySpend(startDate: string, endDate: string): Promise<number[] | null> {
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
  if (!adAccountId || !accessToken) return null;
  try {
    const fb = await fetchFacebookInsightsHourly(adAccountId, accessToken, { since: startDate, until: endDate });
    return Array.from({ length: 24 }, (_, h) => (fb[h]?.spend ?? 0) / 100); // cents → dollars
  } catch (e) {
    console.error("[hourly-revenue] meta spend fetch failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Hour-of-day ad spend (dollars) for the platform group, summed across the platforms
 * that have a spend source (Meta now; TikTok when configured). Snapchat + owned
 * channels (Klaviyo) have no spend source. Returns null when the group has NO spend
 * source at all (e.g. klaviyo, or tiktok-only before its creds) so the UI renders "—",
 * not a misleading 0.
 *
 * A CONFIGURED source that fails is fatal for the whole group (return null): a
 * meta-success + tiktok-failure sum would render Meta-only spend as the group total
 * with no partial-data marker — understated spend, overstated efficiency (panel F-003).
 */
async function computeGroupHourlySpend(
  keys: AttributedPlatformKey[],
  startDate: string,
  endDate: string
): Promise<number[] | null> {
  const metaConfigured =
    keys.includes("meta") &&
    Boolean(process.env.FACEBOOK_AD_ACCOUNT_ID && process.env.FACEBOOK_MARKETING_ACCESS_TOKEN);
  const tiktokConfigured = keys.includes("tiktok") && isTikTokSpendConfigured();

  // Fetch concurrently (panel F-007) — sequential awaits doubled the external latency
  // on the request path. Each fetch is individually bounded (8s AbortSignal).
  const [meta, tiktok] = await Promise.all([
    metaConfigured ? fetchMetaHourlySpend(startDate, endDate) : Promise.resolve(null),
    tiktokConfigured ? fetchTikTokHourlySpend(startDate, endDate) : Promise.resolve(null),
  ]);

  // Configured but FAILED → "—" for the whole group, never a partial sum (panel F-003).
  if (metaConfigured && !meta) return null;
  if (tiktokConfigured && !tiktok) return null;

  // Snapchat: no Marketing-API client yet → no spend source.
  const sources = [meta, tiktok].filter((s): s is number[] => s !== null);
  if (sources.length === 0) return null;
  return Array.from({ length: 24 }, (_, h) => sources.reduce((s, arr) => s + (arr[h] ?? 0), 0));
}

export async function getHourlyRevenueByPlatform(input: HourlyRevenueInput): Promise<HourlyRevenueResult> {
  await connectDB();

  // AEST day bounds: start = midnight of startDate; end = EXCLUSIVE midnight of the day AFTER endDate.
  const [sy, sm, sd] = input.startDate.split("-").map(Number);
  const [ey, em, ed] = input.endDate.split("-").map(Number);
  const startUTC = createAESTDateAsUTC(sy, sm, sd, 0, 0);
  // Roll the calendar day over via a UTC anchor — createAESTDateAsUTC builds from a
  // string and would reject a day-overflow like "2099-03-32".
  const endAnchor = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
  endAnchor.setUTCDate(endAnchor.getUTCDate() + 1);
  const endUTC = createAESTDateAsUTC(
    endAnchor.getUTCFullYear(),
    endAnchor.getUTCMonth() + 1,
    endAnchor.getUTCDate(),
    0,
    0
  );

  if (endUTC.getTime() <= startUTC.getTime()) {
    throw new Error("endDate must be on or after startDate");
  }

  const byPlatform = await new PaymentEventRepository().aggregateRevenueByHourAndPlatform(startUTC, endUTC);
  const keys = PLATFORM_GROUPS[input.platform];

  // Ad spend per hour for the group (Meta now, TikTok when configured); null = no spend source → "—".
  const spendArr = await computeGroupHourlySpend(keys, input.startDate, input.endDate);

  // Merge the requested platform group into one 24-bucket series.
  const hourly = Array.from({ length: 24 }, (_, hour) => {
    let revenue = 0;
    let conversions = 0;
    for (const k of keys) {
      revenue += byPlatform[k][hour].revenue;
      conversions += byPlatform[k][hour].conversions;
    }
    return { hour, revenue, conversions, spend: spendArr ? spendArr[hour] : null };
  });

  const totalRevenue = hourly.reduce((s, h) => s + h.revenue, 0);
  const totalConversions = hourly.reduce((s, h) => s + h.conversions, 0);
  const totalSpend = spendArr ? spendArr.reduce((s, x) => s + x, 0) : null;

  return {
    hourly,
    totalRevenue,
    totalConversions,
    totalSpend,
    platform: input.platform,
    dateRange: { start: input.startDate, end: input.endDate },
  };
}
