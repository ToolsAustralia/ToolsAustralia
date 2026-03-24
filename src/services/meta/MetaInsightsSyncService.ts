import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import { fetchFacebookAdInsightsDaily, processInsightData } from "@/lib/facebook-marketing";

/** Mongo bulkWrite batch size (ops per round-trip). */
const INSIGHTS_BULK_BATCH = 800;

/** Log lines for CLI / observability (optional; API routes omit). */
export type SyncInsightsProgress = (message: string) => void;

export interface SyncInsightsResult {
  rowsUpserted: number;
  adIds: string[];
  dateRange: { since: string; until: string };
}

export interface SyncInsightsDateRangeOptions {
  onProgress?: SyncInsightsProgress;
}

/**
 * Pulls daily ad-level insights from Meta and upserts into MetaAdInsightsDaily.
 */
export class MetaInsightsSyncService {
  async syncDateRange(
    adAccountId: string,
    accessToken: string,
    dateRange: { since: string; until: string },
    options?: SyncInsightsDateRangeOptions
  ): Promise<SyncInsightsResult> {
    const log = options?.onProgress;
    log?.(
      `[insights] Step 1/2: Downloading Meta Insights (ad × day, paginated). Range ${dateRange.since} → ${dateRange.until}. First page can take 1–2+ minutes.`
    );
    const raw = await fetchFacebookAdInsightsDaily(adAccountId, accessToken, dateRange, {
      onPage: ({ page, rowsThisPage, totalRows }) => {
        log?.(
          `[insights] Meta API page ${page}: +${rowsThisPage} rows (${totalRows} cumulative)${rowsThisPage === 0 ? " (empty page)" : ""}`
        );
      },
      onRateLimitWait: ({ attempt, waitMs }) => {
        log?.(
          `[insights] Meta rate limit — sleeping ~${Math.round(waitMs / 1000)}s (retry ${attempt}/10)…`
        );
      },
    });
    log?.(`[insights] Download finished: ${raw.length} insight rows. Step 2/2: Upserting into MongoDB…`);
    const adIds = new Set<string>();
    let rowsUpserted = 0;

    const ops: Array<{
      updateOne: {
        filter: { adAccountId: string; date: string; adId: string };
        update: { $set: Record<string, unknown> };
        upsert: boolean;
      };
    }> = [];

    let mongoFlushCount = 0;
    const flush = async () => {
      if (ops.length === 0) return;
      await MetaAdInsightsDaily.bulkWrite(ops, { ordered: false });
      mongoFlushCount++;
      if (mongoFlushCount === 1 || mongoFlushCount % 10 === 0) {
        log?.(`[insights] Mongo upsert: bulk batch #${mongoFlushCount} (~${rowsUpserted} rows committed)…`);
      }
      ops.length = 0;
    };

    for (const row of raw) {
      const date = row.date_start;
      if (!date || !row.ad_id) continue;

      const metrics = processInsightData(row);
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

      ops.push({
        updateOne: {
          filter: { adAccountId, date, adId: row.ad_id },
          update: { $set: update },
          upsert: true,
        },
      });
      rowsUpserted++;
      adIds.add(row.ad_id);

      if (ops.length >= INSIGHTS_BULK_BATCH) {
        await flush();
      }
    }

    await flush();
    log?.(`[insights] Done: ${rowsUpserted} rows upserted, ${adIds.size} distinct ad IDs.`);

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
