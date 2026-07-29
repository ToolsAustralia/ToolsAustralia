import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { isTikTokAdInsightsConfigured } from "@/services/admin/tiktok/tiktokAdInsights";

const AEST_TIMEZONE = "Australia/Sydney";

export interface AdChannelMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions?: number;
  clicks?: number;
}

/**
 * Outcome of a one-day ad-channel fetch. The distinction between "empty" and
 * "error" is load-bearing for the snapshot writer:
 *   - "ok"    → real metrics; write them.
 *   - "empty" → legitimately no data (future day, or zero spend with no insights
 *               row); write the channel as absent ($0).
 *   - "error" → the fetch FAILED (expired/invalid token, missing config, network,
 *               API error). The writer must PRESERVE the prior stored value rather
 *               than wipe it. A dead token must never silently zero out correct
 *               history — that is what caused the 2026-06-11 ad-spend wipe
 *               (see docs/tracking/gotchas.md).
 */
export type AdChannelFetchResult =
  | { status: "ok"; metrics: AdChannelMetrics }
  | { status: "empty" }
  | { status: "error" };

/**
 * An ad-channel provider knows how to fetch one day's metrics for one channel.
 * Add a new channel (TikTok, Snapchat, Google Ads) by appending one provider —
 * no schema change required; the snapshot stores adChannels as a Map.
 */
export interface AdChannelProvider {
  key: string; // becomes the Map key in the snapshot
  fetchForDay(args: { dayStartUTC: Date; dayEndUTC: Date }): Promise<AdChannelFetchResult>;
}

function aestDateString(d: Date): string {
  const y = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "yyyy"), 10);
  const m = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(d, AEST_TIMEZONE, "d"), 10);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const facebookAdChannelProvider: AdChannelProvider = {
  key: "facebook",
  async fetchForDay({ dayStartUTC }) {
    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    // Missing config counts as an ERROR (preserve), not "empty": an accidentally
    // unset token in one environment must not wipe stored spend.
    if (!adAccountId || !accessToken) {
      console.error(
        "[adChannel:facebook] FACEBOOK_AD_ACCOUNT_ID or FACEBOOK_MARKETING_ACCESS_TOKEN not set — preserving any prior snapshot value"
      );
      return { status: "error" };
    }

    const dateStr = aestDateString(dayStartUTC);
    // Facebook rejects a `since` in the future — this happens when a date range
    // runs to a future draw date (e.g. "Current Draw" → the 27th). There is no ad
    // data for future days, so this is genuinely "empty" (write nothing), not an error.
    if (dateStr > aestDateString(new Date())) return { status: "empty" };
    try {
      const insights = await fetchFacebookInsights(
        adAccountId,
        accessToken,
        { since: dateStr, until: dateStr },
        "account"
      );
      if (!insights || insights.length === 0) return { status: "empty" };
      const m = insights[0].metrics;
      return {
        status: "ok",
        metrics: {
          spend: m.spend / 100, // metrics.spend is in cents; convert to dollars
          revenue: m.revenue / 100, // metrics.revenue is in cents; convert to dollars
          roas: m.roas,
          impressions: typeof m.impressions === "number" ? m.impressions : undefined,
          clicks: typeof m.clicks === "number" ? m.clicks : undefined,
        },
      };
    } catch (err) {
      // Fetch FAILED (expired token, network, API error). Do NOT let this wipe
      // history — signal the writer to preserve the prior stored value.
      console.error(
        `[adChannel:facebook] fetch FAILED for ${dateStr} — preserving prior snapshot value:`,
        err
      );
      return { status: "error" };
    }
  },
};

/**
 * TikTok spend/revenue per AEST day, read from TikTokAdInsightsDaily (filled by the
 * nightly /api/cron/sync-tiktok-ads — NOT a live Marketing-API call, so this provider
 * is cheap and rate-limit-free). Key "tiktok" is what PLATFORM_TO_AD_CHANNEL_KEY maps
 * the tiktok platform to — without this provider the overview Advertising card, blended
 * ROAS, and MER could never show TikTok spend (panel F-001).
 *
 * revenue here is TIKTOK-reported purchase value (platform attribution), matching how
 * the facebook provider stores Meta-reported revenue — the card's trueRoas still uses
 * first-party attributed revenue; this map is the spend + platform-reported side.
 */
export const tiktokAdChannelProvider: AdChannelProvider = {
  key: "tiktok",
  async fetchForDay({ dayStartUTC }) {
    // Missing config counts as an ERROR (preserve), not "empty" — same rule as the
    // facebook provider: an accidentally unset token must not wipe stored spend.
    if (!isTikTokAdInsightsConfigured()) {
      console.error(
        "[adChannel:tiktok] TIKTOK_ADVERTISER_ID or TIKTOK_MARKETING_ACCESS_TOKEN not set — preserving any prior snapshot value"
      );
      return { status: "error" };
    }

    const dateStr = aestDateString(dayStartUTC);
    // No ad data exists for future days — genuinely "empty", not an error.
    if (dateStr > aestDateString(new Date())) return { status: "empty" };

    try {
      await connectDB();
      const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
      const match: Record<string, unknown> = { date: dateStr };
      if (advertiserId) match.adAccountId = advertiserId;
      const agg = await TikTokAdInsightsDaily.aggregate<{
        spendCents: number;
        revenueCents: number;
        impressions: number;
        clicks: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: null,
            spendCents: { $sum: "$spendCents" },
            revenueCents: { $sum: "$revenueCents" },
            impressions: { $sum: "$impressions" },
            clicks: { $sum: "$clicks" },
          },
        },
      ]);
      // No synced rows for that day (e.g. pre-token history, or the nightly sync
      // hasn't covered it) → absent, mirroring facebook's zero-insights branch.
      if (agg.length === 0) return { status: "empty" };
      const m = agg[0];
      const spend = (m.spendCents ?? 0) / 100;
      const revenue = (m.revenueCents ?? 0) / 100;
      return {
        status: "ok",
        metrics: {
          spend,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
          impressions: m.impressions ?? 0,
          clicks: m.clicks ?? 0,
        },
      };
    } catch (err) {
      console.error(
        `[adChannel:tiktok] read FAILED for ${dateStr} — preserving prior snapshot value:`,
        err
      );
      return { status: "error" };
    }
  },
};

/**
 * Registered providers. To add a new channel, append its provider here.
 * Snapshots will start capturing the new channel on the next cron run.
 */
export const AD_CHANNEL_PROVIDERS: AdChannelProvider[] = [
  facebookAdChannelProvider,
  tiktokAdChannelProvider,
];

/**
 * Merge freshly-fetched per-channel results with the prior snapshot's stored
 * ad-channels, preserving prior values when a fetch ERRORED so an expired token
 * can never wipe correct history. Pure — unit-tested in
 * `__tests__/mergeAdChannels.test.ts`.
 *
 * - status "ok"    → write the new metrics
 * - status "empty" → omit the channel (renders as $0 / absent)
 * - status "error" → keep the prior stored value if present; otherwise omit
 *                    (a first write with no prior simply has no value to keep)
 */
export function mergeAdChannels(
  fetched: Array<{ key: string; result: AdChannelFetchResult }>,
  prior: Record<string, AdChannelMetrics> | null | undefined
): { channels: Map<string, AdChannelMetrics>; preserved: string[]; lost: string[] } {
  const channels = new Map<string, AdChannelMetrics>();
  const preserved: string[] = [];
  const lost: string[] = [];
  for (const { key, result } of fetched) {
    if (result.status === "ok") {
      channels.set(key, result.metrics);
    } else if (result.status === "error") {
      const priorVal = prior?.[key];
      if (priorVal) {
        channels.set(key, priorVal);
        preserved.push(key);
      } else {
        lost.push(key);
      }
    }
    // status "empty" → intentionally omit (absent renders as $0)
  }
  return { channels, preserved, lost };
}
