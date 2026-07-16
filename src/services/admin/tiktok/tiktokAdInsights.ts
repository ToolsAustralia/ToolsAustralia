/**
 * TikTok Marketing API — read-only AD-LEVEL daily insights (spend + platform-reported
 * conversions/value), the per-ad analogue of tiktokHourlySpend.ts. This is the source
 * that lets the admin see "TikTok ad X spent $Y drove Z sales", mirroring the Meta
 * ad-level insights that feed MetaAdInsightsDaily.
 *
 *   GET business-api.tiktok.com/open_api/v1.3/report/integrated/get/
 *   data_level=AUCTION_AD, dimensions=["ad_id","stat_time_day"],
 *   metrics=[spend, impressions, clicks, ad_name, adgroup_id/name, campaign_id/name,
 *            conversion, total_complete_payment_value]
 *
 * ⚠️ UNVERIFIED against the live API (no creds at build time) — same stance as
 * tiktokHourlySpend.ts. When TIKTOK_ADVERTISER_ID + TIKTOK_MARKETING_ACCESS_TOKEN are
 * set, verify against your TikTok events setup:
 *   - the conversion COUNT metric name (assumed "conversion"),
 *   - the purchase VALUE metric name (assumed "total_complete_payment_value"; some
 *     accounts expose "complete_payment_value" / "total_purchase_value"), and
 *   - the spend currency (assumed AUD) + that spend/value are decimal account-currency
 *     (dollars), which we convert to cents.
 * The full row is stored in `raw` so the exact live field names can be inspected without
 * a code change. parseMetric() already tries several candidate keys defensively.
 */
const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

/** One normalized ad×day row, shaped to upsert straight into TikTokAdInsightsDaily. */
export interface TikTokAdInsightRow {
  /** TikTok advertiser_id (stored as adAccountId on the model). */
  advertiserId: string;
  /** YYYY-MM-DD */
  date: string;
  adId: string;
  adName?: string;
  adsetId?: string;
  adsetName?: string;
  campaignId?: string;
  campaignName?: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  /** TikTok-reported conversion count. */
  conversions: number;
  /** TikTok-reported purchase value in cents. */
  revenueCents: number;
  raw: Record<string, unknown>;
}

interface TikTokReportRow {
  dimensions?: { ad_id?: string; stat_time_day?: string };
  metrics?: Record<string, string | number | undefined>;
}
interface TikTokReportResponse {
  code?: number;
  message?: string;
  data?: { list?: TikTokReportRow[]; page_info?: { total_page?: number } };
}

/** True when the TikTok Marketing-API creds are present (advertiser id + reporting token). */
export function isTikTokAdInsightsConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_ADVERTISER_ID?.trim() && process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim(),
  );
}

/** Read a numeric metric, trying candidate field names in order. Tolerant of string/number/absent. */
function parseMetric(metrics: TikTokReportRow["metrics"], keys: string[]): number {
  if (!metrics) return 0;
  for (const key of keys) {
    const raw = metrics[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    if (Number.isFinite(n)) return n as number;
  }
  return 0;
}

function str(metrics: TikTokReportRow["metrics"], key: string): string | undefined {
  const v = metrics?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Fetch per-ad daily insights for [startDate, endDate] (inclusive, YYYY-MM-DD).
 * Returns normalized rows, or `null` when not configured / on any API error
 * (callers then leave the admin view empty rather than showing wrong numbers).
 */
export async function fetchTikTokAdInsightsDaily(
  startDate: string,
  endDate: string,
): Promise<TikTokAdInsightRow[] | null> {
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  const token = process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim();
  if (!advertiserId || !token) return null; // not configured → caller shows "—"

  const rows: TikTokAdInsightRow[] = [];
  let page = 1;
  try {
    for (let i = 0; i < 100; i++) {
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_AD",
        dimensions: JSON.stringify(["ad_id", "stat_time_day"]),
        metrics: JSON.stringify([
          "spend",
          "impressions",
          "clicks",
          "ad_name",
          "adgroup_id",
          "adgroup_name",
          "campaign_id",
          "campaign_name",
          "conversion",
          "total_complete_payment_value",
        ]),
        start_date: startDate,
        end_date: endDate,
        page: String(page),
        page_size: "1000",
      });
      const res = await fetch(`${TIKTOK_API}/report/integrated/get/?${params.toString()}`, {
        headers: { "Access-Token": token },
      });
      const body = (await res.json().catch(() => ({}))) as TikTokReportResponse;
      if (!res.ok || (body.code ?? 0) !== 0) {
        // console.error survives the production removeConsole strip (per CLAUDE.md)
        console.error(
          `[tiktokAdInsights] report error: HTTP ${res.status} code ${body.code} ${body.message ?? ""}`,
        );
        return null;
      }
      for (const row of body.data?.list ?? []) {
        const adId = row.dimensions?.ad_id;
        const day = row.dimensions?.stat_time_day; // e.g. "2026-06-01 00:00:00" or "2026-06-01"
        if (!adId || !day) continue;
        const date = day.slice(0, 10);
        const m = row.metrics;
        rows.push({
          advertiserId,
          date,
          adId,
          adName: str(m, "ad_name"),
          adsetId: str(m, "adgroup_id"),
          adsetName: str(m, "adgroup_name"),
          campaignId: str(m, "campaign_id"),
          campaignName: str(m, "campaign_name"),
          spendCents: Math.round(parseMetric(m, ["spend"]) * 100),
          impressions: Math.round(parseMetric(m, ["impressions"])),
          clicks: Math.round(parseMetric(m, ["clicks"])),
          conversions: Math.round(parseMetric(m, ["conversion", "complete_payment", "total_purchase"])),
          revenueCents: Math.round(
            parseMetric(m, [
              "total_complete_payment_value",
              "complete_payment_value",
              "total_purchase_value",
            ]) * 100,
          ),
          raw: (row as unknown as Record<string, unknown>) ?? {},
        });
      }
      const totalPages = body.data?.page_info?.total_page ?? 1;
      if (page >= totalPages) break;
      page += 1;
    }
  } catch (e) {
    console.error("[tiktokAdInsights] fetch failed:", e instanceof Error ? e.message : e);
    return null;
  }
  return rows;
}
