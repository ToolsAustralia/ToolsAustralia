import { fetchFacebookInsights } from "@/lib/facebook-marketing";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

export interface AdChannelMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions?: number;
  clicks?: number;
}

/**
 * An ad-channel provider knows how to fetch one day's metrics for one channel.
 * Add a new channel (TikTok, Snapchat, Google Ads) by appending one provider —
 * no schema change required; the snapshot stores adChannels as a Map.
 */
export interface AdChannelProvider {
  key: string; // becomes the Map key in the snapshot
  fetchForDay(args: { dayStartUTC: Date; dayEndUTC: Date }): Promise<AdChannelMetrics | null>;
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
    if (!adAccountId || !accessToken) return null;

    const dateStr = aestDateString(dayStartUTC);
    try {
      const insights = await fetchFacebookInsights(
        adAccountId,
        accessToken,
        { since: dateStr, until: dateStr },
        "account"
      );
      if (!insights || insights.length === 0) return null;
      const m = insights[0].metrics;
      return {
        spend: m.spend / 100, // metrics.spend is in cents; convert to dollars
        revenue: m.revenue / 100, // metrics.revenue is in cents; convert to dollars
        roas: m.roas,
        impressions: typeof m.impressions === "number" ? m.impressions : undefined,
        clicks: typeof m.clicks === "number" ? m.clicks : undefined,
      };
    } catch (err) {
      console.error(`[adChannel:facebook] fetch failed for ${dateStr}:`, err);
      return null;
    }
  },
};

/**
 * Registered providers. To add a new channel, append its provider here.
 * Snapshots will start capturing the new channel on the next cron run.
 */
export const AD_CHANNEL_PROVIDERS: AdChannelProvider[] = [facebookAdChannelProvider];
