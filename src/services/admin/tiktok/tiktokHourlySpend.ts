/**
 * TikTok Marketing API — read-only ad-spend, aggregated to hour-of-day.
 *
 * Returns 24 hour-of-day spend buckets (dollars) for the date range, or `null` when
 * not configured (no advertiser id / token) or on any API error — callers then render
 * "—" / "awaiting sync". Endpoint:
 *   GET business-api.tiktok.com/open_api/v1.3/report/integrated/get/
 *   data_level=AUCTION_ADVERTISER, dimensions=["stat_time_hour"], metrics=["spend"]
 *
 * ⚠️ UNVERIFIED against the live API (no creds at build time). When
 * TIKTOK_ADVERTISER_ID + TIKTOK_MARKETING_ACCESS_TOKEN are set, verify: the response
 * shape (`data.list[].dimensions.stat_time_hour` + `metrics.spend`), the advertiser
 * **timezone** (assumed Australia/Sydney to match the revenue buckets), and the spend
 * **currency** (assumed AUD). Adjust here if any differ.
 */
import { outboundFetch } from "@/lib/http/outbound";

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

interface TikTokReportRow {
  dimensions?: { stat_time_hour?: string };
  metrics?: { spend?: string | number };
}
interface TikTokReportResponse {
  code?: number;
  message?: string;
  data?: { list?: TikTokReportRow[]; page_info?: { total_page?: number } };
}

/** True when the TikTok Marketing-API creds are present (advertiser id + reporting token). */
export function isTikTokSpendConfigured(): boolean {
  return Boolean(process.env.TIKTOK_ADVERTISER_ID?.trim() && process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim());
}

export async function fetchTikTokHourlySpend(startDate: string, endDate: string): Promise<number[] | null> {
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  const token = process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim();
  if (!advertiserId || !token) return null; // not configured → caller shows "—"

  const hourly = Array.from({ length: 24 }, () => 0);
  let page = 1;
  try {
    for (let i = 0; i < 30; i++) {
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: "BASIC",
        data_level: "AUCTION_ADVERTISER",
        dimensions: JSON.stringify(["stat_time_hour"]),
        metrics: JSON.stringify(["spend"]),
        start_date: startDate,
        end_date: endDate,
        page: String(page),
        page_size: "1000",
      });
      const res = await outboundFetch(`${TIKTOK_API}/report/integrated/get/?${params.toString()}`, {
        headers: { "Access-Token": token },
        // Bounded (panel F-007): this runs on the admin request path, so a hanging
        // TikTok API must not hold the Vercel function open until its own limit.
        // outboundFetch adds the keep-alive-bounded dispatcher every third-party
        // integration should use (src/lib/http/outbound.ts — the UND_ERR_SOCKET fix).
        signal: AbortSignal.timeout(8000),
      });
      // An unparseable body is an ERROR, not an empty success (panel F-013) — the old
      // `.catch(() => ({}))` + `(body.code ?? 0)` pair read a malformed HTTP 200 as
      // "code 0" and returned an all-zeros spend array (the UI then asserts $0 spend
      // instead of "—"). Require an explicit code === 0.
      const body = (await res.json().catch(() => null)) as TikTokReportResponse | null;
      if (!res.ok || !body || body.code !== 0) {
        const detail = body ? `code ${body.code} ${body.message ?? ""}` : "unparseable response body";
        // console.error survives the production removeConsole strip (per CLAUDE.md)
        console.error(`[tiktokHourlySpend] report error: HTTP ${res.status} ${detail}`);
        return null;
      }
      for (const row of body.data?.list ?? []) {
        const t = row.dimensions?.stat_time_hour; // e.g. "2026-06-01 14:00:00"
        if (!t || t.length < 13) continue;
        const hour = parseInt(t.slice(11, 13), 10);
        const raw = row.metrics?.spend;
        const spend = typeof raw === "string" ? parseFloat(raw) : raw ?? 0;
        if (hour >= 0 && hour < 24 && Number.isFinite(spend)) hourly[hour] += spend;
      }
      const totalPages = body.data?.page_info?.total_page ?? 1;
      if (page >= totalPages) break;
      page += 1;
    }
  } catch (e) {
    console.error("[tiktokHourlySpend] fetch failed:", e instanceof Error ? e.message : e);
    return null;
  }
  return hourly;
}
