import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { fetchFacebookAdInsightsDaily, processInsightData } from "@/lib/facebook-marketing";

export interface SyncInsightsResult {
  rowsUpserted: number;
  adIds: string[];
  dateRange: { since: string; until: string };
}

/**
 * Pulls daily ad-level insights from Meta and upserts into MetaAdInsightsDaily.
 */
export class MetaInsightsSyncService {
  async syncDateRange(
    adAccountId: string,
    accessToken: string,
    dateRange: { since: string; until: string }
  ): Promise<SyncInsightsResult> {
    const raw = await fetchFacebookAdInsightsDaily(adAccountId, accessToken, dateRange);
    const adIds = new Set<string>();
    let rowsUpserted = 0;

    for (const row of raw) {
      const date = row.date_start;
      if (!date || !row.ad_id) continue;

      const metrics = processInsightData(row);
      const filter: Record<string, unknown> = { adAccountId, date, adId: row.ad_id };
      const update = {
        adAccountId,
        date,
        adId: row.ad_id,
        adsetId: row.adset_id,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        adsetName: row.adset_name,
        adName: row.ad_name,
        spendCents: metrics.spend,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        conversions: metrics.conversions,
        revenueCents: metrics.revenue,
        raw: row as unknown as Record<string, unknown>,
        syncedAt: new Date(),
      };

      await MetaAdInsightsDaily.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
      });
      rowsUpserted++;
      adIds.add(row.ad_id);
    }

    return {
      rowsUpserted,
      adIds: [...adIds],
      dateRange,
    };
  }

  /** Distinct ad IDs from stored insights for a date range (for destination resolution). */
  async listAdIdsInRange(
    adAccountId: string,
    since: string,
    until: string
  ): Promise<string[]> {
    const rows = await MetaAdInsightsDaily.distinct("adId", {
      adAccountId,
      date: { $gte: since, $lte: until },
    });
    return rows as string[];
  }
}
