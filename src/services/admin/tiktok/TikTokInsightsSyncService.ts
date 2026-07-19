import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { fetchTikTokAdInsightsDaily, isTikTokAdInsightsConfigured } from "./tiktokAdInsights";

/** Mongo bulkWrite batch size (ops per round-trip). */
const INSIGHTS_BULK_BATCH = 800;

/** Log lines for CLI / observability (optional; API/cron routes omit). */
export type SyncTikTokInsightsProgress = (message: string) => void;

export interface SyncTikTokInsightsResult {
  /** null when TikTok Marketing-API creds are not configured (no-op). */
  configured: boolean;
  rowsUpserted: number;
  adIds: string[];
  dateRange: { since: string; until: string };
}

/**
 * Pulls daily ad-level insights from TikTok and upserts into TikTokAdInsightsDaily.
 * The TikTok analogue of MetaInsightsSyncService.syncDateRange. Idempotent: keyed by
 * advertiserId (as adAccountId) + date + adId, always $set syncedAt to refresh the TTL.
 */
export class TikTokInsightsSyncService {
  async syncDateRange(
    dateRange: { since: string; until: string },
    options?: { onProgress?: SyncTikTokInsightsProgress },
  ): Promise<SyncTikTokInsightsResult> {
    const log = options?.onProgress;
    log?.(
      `[tiktok-insights] Downloading TikTok ad-level insights (ad × day). Range ${dateRange.since} → ${dateRange.until}.`,
    );

    const rows = await fetchTikTokAdInsightsDaily(dateRange.since, dateRange.until);
    if (rows === null) {
      // Distinguish "not configured" (clean no-op) from "configured but the API failed"
      // (must THROW so the cron returns 500 and Vercel cron monitoring surfaces the
      // failure — a 200 {configured:false} would hide a broken token/API outage).
      if (isTikTokAdInsightsConfigured()) {
        throw new Error(
          "TikTok ad-insights fetch failed despite creds being configured (see [tiktokAdInsights] console.error for the API response)",
        );
      }
      log?.("[tiktok-insights] Skipped — TikTok Marketing-API creds not set.");
      return { configured: false, rowsUpserted: 0, adIds: [], dateRange };
    }

    log?.(`[tiktok-insights] Download finished: ${rows.length} rows. Upserting into MongoDB…`);

    const adIds = new Set<string>();
    let rowsUpserted = 0;

    const ops: Array<{
      updateOne: {
        filter: { adAccountId: string; date: string; adId: string };
        update: { $set: Record<string, unknown> };
        upsert: boolean;
      };
    }> = [];

    const flush = async () => {
      if (ops.length === 0) return;
      await TikTokAdInsightsDaily.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    };

    for (const row of rows) {
      if (!row.date || !row.adId) continue;
      const update = {
        adAccountId: row.advertiserId,
        date: row.date,
        adId: row.adId,
        adsetId: row.adsetId,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adsetName: row.adsetName,
        adName: row.adName,
        spendCents: row.spendCents,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenueCents: row.revenueCents,
        raw: row.raw,
        // Always $set (not $setOnInsert) so each re-sync refreshes the syncedAt TTL clock.
        syncedAt: new Date(),
      };
      ops.push({
        updateOne: {
          filter: { adAccountId: row.advertiserId, date: row.date, adId: row.adId },
          update: { $set: update },
          upsert: true,
        },
      });
      rowsUpserted++;
      adIds.add(row.adId);
      if (ops.length >= INSIGHTS_BULK_BATCH) await flush();
    }

    await flush();
    log?.(`[tiktok-insights] Done: ${rowsUpserted} rows upserted, ${adIds.size} distinct ad IDs.`);

    return { configured: true, rowsUpserted, adIds: [...adIds], dateRange };
  }
}
