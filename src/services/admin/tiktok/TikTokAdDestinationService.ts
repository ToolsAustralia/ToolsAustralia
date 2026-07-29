import { outboundFetch } from "@/lib/http/outbound";
import { TikTokReportError } from "./tiktokAdInsights";
import type {
  AdDestinationResolver,
  ResolvedAdDestination,
} from "@/services/analytics/adDestinationWriter";

/**
 * TikTok ad → landing-URL resolver. The TikTok half of the `AdDestinationResolver` seam;
 * canonicalization, `unknown://` placeholding, multi-URL flagging and the upsert all live
 * in the shared writer (`src/services/analytics/adDestinationWriter.ts`).
 *
 * ## Why `/smart_plus/ad/get/` and not `/ad/get/`
 *
 * VERIFIED against the live account 2026-07-29: `/ad/get/` returns **no landing URL at
 * all** for this advertiser — not even when `landing_page_url` is requested explicitly in
 * `fields`. The ads are `campaign_automation_type: "UPGRADED_SMART_PLUS_CREATIVE"`
 * (TikTok Smart+ / automated campaigns), and for those the destination lives on
 * `/smart_plus/ad/get/` as `landing_page_url_list[].landing_page_url`.
 *
 * ## The id bridge — the part that silently returns nothing if you get it wrong
 *
 * Reporting rows are keyed by **`ad_id`**. `/smart_plus/ad/get/` is keyed by
 * **`smart_plus_ad_id`**. These are DIFFERENT ids. Measured on the live account:
 *
 *   - joining reporting `ad_id` directly against `smart_plus_ad_id` → **0/31 ads**
 *   - joining via `/ad/get/`, which carries BOTH ids on every row → **31/31 ads**
 *
 * So `/ad/get/` is not a fallback here, it is the mandatory bridge:
 *   reporting `ad_id` → (`/ad/get/`) → `smart_plus_ad_id` → (`/smart_plus/ad/get/`) → URLs.
 *
 * Several `ad_id`s legitimately map to ONE `smart_plus_ad_id` (Smart+ generates ad variants
 * from a single configuration), so the mapping is many-to-one and every variant inherits
 * that configuration's destinations.
 *
 * `/ad/get/`'s own `landing_page_url` is used as a secondary source for any classic
 * (non-Smart+) ad, so a conventional campaign created later still resolves.
 *
 * ## Macros are expected, and are handled by the writer
 *
 * TikTok returns click-time macros unexpanded, e.g.
 * `…/promotions/milwaukee-milwaukee?utm_id=__CAMPAIGN_ID__&utm_content=__AID_NAME__`.
 * In the QUERY STRING they are harmless — canonicalization drops the query. The shared
 * writer's `isUsableLandingUrl` rejects a macro in the PATH, which would otherwise
 * canonicalize into a phantom landing page carrying real spend.
 *
 * ## Smart+ ads legitimately have MULTIPLE distinct destinations
 *
 * `landing_page_url_list` is a real array of different promo pages — unlike Meta, where
 * multiple URLs usually mean carousel cards pointing at one page. All are returned in
 * `rawUrls`; the writer flags `multiUrl`, and the packages-focus classifier refuses to
 * guess a focus when they disagree.
 */

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";
const PAGE_SIZE = 100;
/** Backstop against a pathological `total_page`; 100 pages × 100 = 10k ads. */
const MAX_PAGES = 100;
const TIMEOUT_MS = 8000;

interface SmartPlusAd {
  smart_plus_ad_id?: string;
  ad_name?: string;
  landing_page_url_list?: Array<{ landing_page_url?: string }>;
  deeplink_list?: Array<{ deeplink?: string }>;
  creative_list?: unknown[];
}

interface ClassicAd {
  ad_id?: string;
  /** Present on Smart+-generated ads — the bridge to /smart_plus/ad/get/. */
  smart_plus_ad_id?: string;
  /** Present only on classic (non-Smart+) ads. */
  landing_page_url?: string;
  ad_format?: string;
}

interface ListResponse<T> {
  code?: number;
  message?: string;
  data?: { list?: T[]; page_info?: { total_page?: number; total_number?: number } };
}

function creds(): { advertiserId: string; token: string } | null {
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID?.trim();
  const token = process.env.TIKTOK_MARKETING_ACCESS_TOKEN?.trim();
  if (!advertiserId || !token) return null;
  return { advertiserId, token };
}

/**
 * Page through a TikTok list endpoint until `total_page`. Throws `TikTokReportError` on
 * any non-zero code so a partial list is never mistaken for a complete one — silently
 * truncating here would leave ads unresolved and understate their landing URL's spend.
 */
async function fetchAllPages<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  label: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ ...params, page: String(page), page_size: String(PAGE_SIZE) });
    const res = await outboundFetch(`${TIKTOK_API}${path}?${qs.toString()}`, {
      headers: { "Access-Token": token },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as ListResponse<T> | null;
    if (!res.ok || !body || body.code !== 0) {
      const detail = body ? `code ${body.code} ${body.message ?? ""}` : "unparseable response body";
      console.error(`[tiktokAdDestinations] ${label} error: HTTP ${res.status} ${detail}`);
      throw new TikTokReportError(body?.message ?? `${label} failed (HTTP ${res.status})`, {
        httpStatus: res.status,
        tiktokCode: body?.code,
      });
    }
    out.push(...(body.data?.list ?? []));
    const totalPages = body.data?.page_info?.total_page ?? 1;
    if (page >= totalPages) break;
  }
  return out;
}

export class TikTokAdDestinationService implements AdDestinationResolver {
  readonly platform = "tiktok" as const;

  /**
   * Resolve landing URLs for the given reporting `ad_id`s.
   *
   * Three steps, in this order — see the id-bridge note at the top of this file:
   *   1. `/ad/get/`            → `ad_id` → `smart_plus_ad_id` (and any classic URL)
   *   2. `/smart_plus/ad/get/` → `smart_plus_ad_id` → landing URLs
   *   3. join                  → reporting `ad_id` → URLs
   *
   * Ads resolved by neither are omitted; the shared writer records them as `unknown://`
   * rather than inventing a URL, and the caller sees it in the coverage figure.
   */
  async resolveForAdIds(
    adIds: string[],
    options?: { onProgress?: (message: string) => void },
  ): Promise<ResolvedAdDestination[]> {
    const log = options?.onProgress;
    const c = creds();
    if (!c) {
      log?.("[tiktokAdDestinations] Skipped — TikTok Marketing-API creds not set.");
      return [];
    }
    const wanted = new Set(adIds.filter(Boolean).map(String));
    if (wanted.size === 0) return [];

    // ── 1. The bridge: every ad's ad_id → smart_plus_ad_id (+ classic URL if any) ──
    const ads = await fetchAllPages<ClassicAd>(
      "/ad/get/",
      {
        advertiser_id: c.advertiserId,
        fields: JSON.stringify(["ad_id", "ad_name", "smart_plus_ad_id", "landing_page_url"]),
      },
      c.token,
      "ad/get",
    );
    log?.(`[tiktokAdDestinations] /ad/get/ returned ${ads.length} ad(s) (id bridge).`);

    const smartPlusIdByAdId = new Map<string, string>();
    const classicUrlByAdId = new Map<string, string>();
    for (const ad of ads) {
      const adId = ad.ad_id ? String(ad.ad_id) : undefined;
      if (!adId || !wanted.has(adId)) continue;
      if (ad.smart_plus_ad_id) smartPlusIdByAdId.set(adId, String(ad.smart_plus_ad_id));
      if (typeof ad.landing_page_url === "string" && ad.landing_page_url.trim()) {
        classicUrlByAdId.set(adId, ad.landing_page_url.trim());
      }
    }

    // ── 2. Smart+ configurations → their landing URLs ────────────────────────────
    const urlsBySmartPlusId = new Map<string, string[]>();
    if (smartPlusIdByAdId.size > 0) {
      const smartPlus = await fetchAllPages<SmartPlusAd>(
        "/smart_plus/ad/get/",
        { advertiser_id: c.advertiserId },
        c.token,
        "smart_plus/ad/get",
      );
      log?.(`[tiktokAdDestinations] /smart_plus/ad/get/ returned ${smartPlus.length} config(s).`);
      for (const ad of smartPlus) {
        const spId = ad.smart_plus_ad_id ? String(ad.smart_plus_ad_id) : undefined;
        if (!spId) continue;
        const urls = (ad.landing_page_url_list ?? [])
          .map((e) => e?.landing_page_url)
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0);
        if (urls.length > 0) urlsBySmartPlusId.set(spId, urls);
      }
    }

    // ── 3. Join back to the reporting ad ids ─────────────────────────────────────
    const resolved: ResolvedAdDestination[] = [];
    for (const adId of wanted) {
      const spId = smartPlusIdByAdId.get(adId);
      const smartUrls = spId ? urlsBySmartPlusId.get(spId) : undefined;
      if (smartUrls && smartUrls.length > 0) {
        resolved.push({
          adId,
          rawUrls: smartUrls,
          creativeType: "smart_plus",
          // The Smart+ creative list exposes no reliable format discriminator; report
          // "unknown" rather than guessing a value the UI would display as fact.
          adFormat: "unknown",
        });
        continue;
      }
      const classicUrl = classicUrlByAdId.get(adId);
      if (classicUrl) {
        resolved.push({ adId, rawUrls: [classicUrl], creativeType: "classic", adFormat: "unknown" });
      }
    }

    const pct = ((resolved.length / wanted.size) * 100).toFixed(0);
    log?.(`[tiktokAdDestinations] Resolved ${resolved.length}/${wanted.size} ad(s) (${pct}% coverage).`);
    return resolved;
  }
}
