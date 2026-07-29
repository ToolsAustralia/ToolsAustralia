/**
 * TikTok Marketing API — read-only AD-LEVEL daily insights (spend + platform-reported
 * purchases/value), the per-ad analogue of tiktokHourlySpend.ts. This is the source
 * that lets the admin see "TikTok ad X spent $Y drove Z sales", mirroring the Meta
 * ad-level insights that feed MetaAdInsightsDaily.
 *
 *   GET business-api.tiktok.com/open_api/v1.3/report/integrated/get/
 *   data_level=AUCTION_AD, dimensions=["ad_id","stat_time_day"],
 *   metrics=[spend, impressions, clicks, ad_name, adgroup_id/name, campaign_id/name,
 *            complete_payment, value_per_complete_payment, complete_payment_roas]
 *
 * ✅ VERIFIED against the live API on 2026-07-29 (advertiser 7561254031700557840,
 * "Tools Australia Pty Ltd"). What the probe established — all three were guesses before:
 *
 * 1. **Currency = AUD, display_timezone = Australia/Sydney** (`/advertiser/info/`), so the
 *    `spend × 100 → cents` conversion and the AEST hour bucketing are both correct.
 *
 * 2. **`total_complete_payment_value` DOES NOT EXIST** — the request 40002'd on it, and 14
 *    other plausible total-value names were rejected too (`complete_payment_value`,
 *    `total_conversion_value`, `purchase_value`, `gmv`, …). This account exposes purchase
 *    value only as a PER-UNIT figure, so total value must be DERIVED:
 *        value = value_per_complete_payment × complete_payment
 *    Cross-checked against the independent `complete_payment_roas × spend` over a 30-day,
 *    68-row window: $1024.93 vs $1024.37 — 0.05% apart, pure 2-dp rounding. The per-unit
 *    form is the more accurate of the two (its rounding error scales with the purchase
 *    COUNT, the ROAS form's with SPEND, which is far larger on big rows).
 *
 * 3. **`conversion` is NOT purchases — do not use it for the conversions column.** It
 *    counts each ad group's OWN optimization event, so landing-page-view-optimised groups
 *    inflate it enormously: the same 30-day window returned `conversion` = 11,782 against
 *    `complete_payment` = 45 actual purchases. `complete_payment` is the purchase count and
 *    is what makes the platform figure comparable to our first-party PaymentEvent count.
 *
 * The full row is still stored in `raw`, so if TikTok changes its metric vocabulary the
 * live field names remain inspectable without a code change.
 */
import { outboundFetch } from "@/lib/http/outbound";

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

/**
 * A Marketing-API report call failed. Carries TikTok's own code/message so the cron
 * can persist a truthful sync-status ("permission error (40001)") instead of a generic
 * failure — the admin UI renders that message verbatim (panel F-002).
 */
export class TikTokReportError extends Error {
  readonly httpStatus?: number;
  readonly tiktokCode?: number;

  constructor(message: string, opts?: { httpStatus?: number; tiktokCode?: number }) {
    super(message);
    this.name = "TikTokReportError";
    this.httpStatus = opts?.httpStatus;
    this.tiktokCode = opts?.tiktokCode;
  }
}

/**
 * The account settings this module's math ASSUMES (panel F-006). Both are silent
 * corrupters if wrong: a non-AUD account makes every `spend × 100 → cents` figure the
 * wrong currency with no error, and a non-Sydney reporting timezone offsets the hourly
 * spend buckets from the AEST revenue buckets they sit beside.
 */
const ASSUMED_CURRENCY = "AUD";
const ASSUMED_TIMEZONE_MATCH = /sydney|melbourne|australia\/(sydney|melbourne)|\+1[01]:00/i;

export interface TikTokAccountAssumptions {
  currency?: string;
  timezone?: string;
  currencyOk: boolean;
  timezoneOk: boolean;
  ok: boolean;
}

/**
 * Verify the live advertiser's currency + reporting timezone against what the sync
 * assumes. Requires the "Ad Account Management: read" scope. Throws TikTokReportError
 * on API failure (same contract as the report fetcher); returns null when unconfigured.
 *
 * Run this on token day — the seed script's --dry-run calls it, and the nightly cron
 * logs loudly when it disagrees, so a mismatched account can never quietly poison the
 * spend history.
 */
export async function checkTikTokAccountAssumptions(): Promise<TikTokAccountAssumptions | null> {
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  const token = process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim();
  if (!advertiserId || !token) return null;

  const params = new URLSearchParams({
    advertiser_ids: JSON.stringify([advertiserId]),
    // Field names verified against the API's own "correct is [...]" 40002 enumeration.
    fields: JSON.stringify(["advertiser_id", "name", "currency", "timezone", "display_timezone"]),
  });

  let body: {
    code?: number;
    message?: string;
    data?: { list?: Array<{ currency?: string; timezone?: string; display_timezone?: string }> };
  } | null = null;
  try {
    const res = await outboundFetch(`${TIKTOK_API}/advertiser/info/?${params.toString()}`, {
      headers: { "Access-Token": token },
      signal: AbortSignal.timeout(8000),
    });
    body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0) {
      const detail = body ? `code ${body.code} ${body.message ?? ""}` : "unparseable response body";
      console.error(`[tiktokAdInsights] advertiser/info error: HTTP ${res.status} ${detail}`);
      throw new TikTokReportError(body?.message ?? `advertiser/info failed (HTTP ${res.status})`, {
        httpStatus: res.status,
        tiktokCode: body?.code,
      });
    }
  } catch (e) {
    if (e instanceof TikTokReportError) throw e;
    throw new TikTokReportError(e instanceof Error ? e.message : "advertiser/info fetch failed");
  }

  const info = body.data?.list?.[0] ?? {};
  const currency = info.currency;
  const timezone = info.display_timezone ?? info.timezone;
  const currencyOk = currency === ASSUMED_CURRENCY;
  // Absent timezone → can't confirm; treat as NOT ok so it gets eyes rather than a pass.
  const timezoneOk = Boolean(timezone && ASSUMED_TIMEZONE_MATCH.test(timezone));

  return { currency, timezone, currencyOk, timezoneOk, ok: currencyOk && timezoneOk };
}

/** Human-readable warning for a failed assumption check, or null when everything matches. */
export function describeAccountAssumptionMismatch(a: TikTokAccountAssumptions): string | null {
  if (a.ok) return null;
  const problems: string[] = [];
  if (!a.currencyOk) {
    problems.push(
      `currency is ${a.currency ?? "unknown"} but spend is stored as ${ASSUMED_CURRENCY} cents — every spend/ROAS figure will be WRONG`,
    );
  }
  if (!a.timezoneOk) {
    problems.push(
      `reporting timezone is ${a.timezone ?? "unknown"} but hourly spend is bucketed as Australia/Sydney — hourly spend will be OFFSET from revenue`,
    );
  }
  return `TikTok account assumptions MISMATCH: ${problems.join("; ")}.`;
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
 * Returns normalized rows, or `null` ONLY when the creds are not configured.
 * On any API failure it THROWS a TikTokReportError carrying TikTok's code/message —
 * callers (sync service → cron) persist that as the sync status and fail loudly
 * (panel F-002; previously error and unconfigured were conflated into one null).
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
          // Purchases + value. See the header note: `conversion` is the ad group's own
          // optimization event (LPVs etc.), NOT purchases — `complete_payment` is.
          // There is no total-value metric on this account, so value is derived from
          // the per-unit figure; `complete_payment_roas` is pulled purely as a
          // cross-check that lands in `raw` for later auditing.
          "complete_payment",
          "value_per_complete_payment",
          "complete_payment_roas",
        ]),
        start_date: startDate,
        end_date: endDate,
        page: String(page),
        page_size: "1000",
      });
      const res = await outboundFetch(`${TIKTOK_API}/report/integrated/get/?${params.toString()}`, {
        headers: { "Access-Token": token },
        // Bounded (panel F-007): this also runs on the admin request path, so a hanging
        // TikTok API must not hold the Vercel function open until its own limit.
        // outboundFetch adds the keep-alive-bounded dispatcher every third-party
        // integration should use (src/lib/http/outbound.ts — the UND_ERR_SOCKET fix).
        signal: AbortSignal.timeout(8000),
      });
      // A body we cannot parse is an ERROR, not an empty success (panel F-013): the old
      // `.catch(() => ({}))` + `(body.code ?? 0)` pair turned an HTTP 200 with a
      // malformed/HTML body (gateway error page, truncated response) into "code 0" —
      // reported as a successful 0-row sync. Require an explicit code === 0.
      const body = (await res.json().catch(() => null)) as TikTokReportResponse | null;
      if (!res.ok || !body || body.code !== 0) {
        const detail = body
          ? `code ${body.code} ${body.message ?? ""}`
          : "unparseable response body";
        // console.error survives the production removeConsole strip (per CLAUDE.md)
        console.error(`[tiktokAdInsights] report error: HTTP ${res.status} ${detail}`);
        throw new TikTokReportError(
          body?.message ?? `TikTok report request failed (HTTP ${res.status}, ${detail})`,
          { httpStatus: res.status, tiktokCode: body?.code },
        );
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
          // PURCHASES — `complete_payment` only. Never fall back to `conversion`: it is
          // the ad group's optimization event and over-counts by ~260× on this account
          // (11,782 vs 45 in the verified 30-day window). A wrong-but-plausible number
          // here is worse than a zero, because nothing downstream would question it.
          conversions: Math.round(parseMetric(m, ["complete_payment"])),
          // VALUE — derived; this account exposes no total-value metric (see header).
          // Rounding to cents happens once, on the product, to avoid compounding.
          revenueCents: Math.round(
            parseMetric(m, ["value_per_complete_payment"]) *
              parseMetric(m, ["complete_payment"]) *
              100,
          ),
          raw: (row as unknown as Record<string, unknown>) ?? {},
        });
      }
      const totalPages = body.data?.page_info?.total_page ?? 1;
      if (page >= totalPages) break;
      page += 1;
    }
  } catch (e) {
    if (e instanceof TikTokReportError) throw e;
    console.error("[tiktokAdInsights] fetch failed:", e instanceof Error ? e.message : e);
    throw new TikTokReportError(e instanceof Error ? e.message : "TikTok report fetch failed");
  }
  return rows;
}
