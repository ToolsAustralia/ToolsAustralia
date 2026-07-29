import TikTokAdInsightsDaily from "@/models/TikTokAdInsightsDaily";
import { fetchTikTokAdInsightsDaily } from "./tiktokAdInsights";

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
  /** Window sums of the synced rows — feeds the metric-name tripwire (panel F-005). */
  totals: { clicks: number; conversions: number; revenueCents: number };
}

/**
 * Metric-name tripwire (panel F-005): the report request names the metrics it wants, so
 * a wrong guess (e.g. TikTok exposing "complete_payment" instead of the assumed
 * "conversion") comes back as rows full of confident ZEROS — parseMetric's fallback keys
 * can never appear in a response that only contains requested metrics. Real clicks with
 * zero conversions AND zero revenue across a whole multi-day window is the signature of
 * that failure (a genuinely converting account can't look like this once ads run).
 * Callers (cron, seed script) must surface this loudly; verify the live names against a
 * stored row's `raw.metrics` keys.
 */
export function metricNamesSuspect(totals: SyncTikTokInsightsResult["totals"]): boolean {
  return totals.clicks > 0 && totals.conversions === 0 && totals.revenueCents === 0;
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

    // Contract (panel F-002/F-008): `null` means NOT CONFIGURED — a clean no-op.
    // A configured-but-failing API call THROWS a TikTokReportError from the fetcher
    // (carrying TikTok's code/message), which propagates out of syncDateRange so the
    // cron records the error status and returns 500 — Vercel cron monitoring surfaces
    // the failure. A 200 {configured:false} must never hide a broken token/API outage.
    const rows = await fetchTikTokAdInsightsDaily(dateRange.since, dateRange.until);
    if (rows === null) {
      log?.("[tiktok-insights] Skipped — TikTok Marketing-API creds not set.");
      return {
        configured: false,
        rowsUpserted: 0,
        adIds: [],
        dateRange,
        totals: { clicks: 0, conversions: 0, revenueCents: 0 },
      };
    }

    log?.(`[tiktok-insights] Download finished: ${rows.length} rows. Upserting into MongoDB…`);

    const adIds = new Set<string>();
    let rowsUpserted = 0;
    const totals = { clicks: 0, conversions: 0, revenueCents: 0 };

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
      totals.clicks += row.clicks;
      totals.conversions += row.conversions;
      totals.revenueCents += row.revenueCents;
      if (ops.length >= INSIGHTS_BULK_BATCH) await flush();
    }

    await flush();
    log?.(`[tiktok-insights] Done: ${rowsUpserted} rows upserted, ${adIds.size} distinct ad IDs.`);

    return { configured: true, rowsUpserted, adIds: [...adIds], dateRange, totals };
  }
}
