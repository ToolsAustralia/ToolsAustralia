import AdDestination, { type AdDestinationPlatform } from "@/models/AdDestination";
import { canonicalizeLandingUrl } from "@/utils/metrics/canonicalize-landing-url";

/**
 * The shared, platform-agnostic tail of ad→landing-URL resolution.
 *
 * Every platform differs ONLY in how it fetches an ad's URLs — Meta walks
 * `object_story_spec`/`asset_feed_spec`, TikTok reads `landing_page_url_list` off
 * `/smart_plus/ad/get/`. Everything after that (canonicalize, placeholder unresolved ads,
 * flag multi-URL, upsert) is identical, so it lives here once instead of being copied per
 * platform. This is the seam the `AdDestinationResolver` interface splits at.
 */

/** What a platform's resolver must return per ad. The ONLY platform-specific step. */
export interface ResolvedAdDestination {
  adId: string;
  /** Every distinct landing URL found on the ad, in the platform's own order. */
  rawUrls: string[];
  creativeType: string;
  adFormat: "video" | "static" | "carousel" | "unknown";
}

export interface AdDestinationResolver {
  readonly platform: AdDestinationPlatform;
  /** Fetch landing URLs for these ad ids. Ads it cannot resolve are simply omitted. */
  resolveForAdIds(
    adIds: string[],
    options?: { onProgress?: (message: string) => void },
  ): Promise<ResolvedAdDestination[]>;
}

export interface WriteDestinationsResult {
  upserted: number;
  /** Ads that produced no usable URL — stored as `unknown://<platform>-ad/<adId>`. */
  missingUrlAds: string[];
  /** resolved ÷ requested, 0-1. A sudden drop means the platform changed its shape. */
  coverage: number;
  requested: number;
}

/**
 * A landing URL is only useful if its PATH is real. Two ways it isn't:
 *
 * 1. **Unexpanded macros in the path.** TikTok returns click-time macros verbatim
 *    (`__CAMPAIGN_ID__`, `__AID_NAME__`). In the QUERY STRING they are harmless —
 *    `canonicalizeLandingUrl` drops the query entirely. In the PATH they would be
 *    canonicalized into a real-looking row (`/promotions/__X__`), inventing a phantom
 *    landing page that carries real spend and matches no prize slug.
 * 2. **A tracker/shortener host.** If the platform hands back a redirect domain rather
 *    than the final destination, the canonical URL becomes the tracker — spend then
 *    vanishes from every `/promotions/<slug>` prize row with no error.
 *
 * Both are treated as UNRESOLVED (routed to `unknown://`) rather than stored, because a
 * plausible-but-wrong URL is worse than an honestly missing one: nothing downstream would
 * question it.
 */
export function isUsableLandingUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  // Macro placeholders in the path — TikTok `__X__`, generic `{{x}}` / `{x}`.
  if (/__|\{\{|\}\}/.test(parsed.pathname)) return false;
  return true;
}

/**
 * Canonicalize, placeholder, flag and upsert a resolver's output. Platform-scoped: the
 * upsert filter carries `platform` because it is half the unique key (see AdDestination).
 */
export async function writeAdDestinations(args: {
  platform: AdDestinationPlatform;
  adAccountId: string;
  /** Every ad id we ASKED about — used to compute coverage and to placeholder the rest. */
  requestedAdIds: string[];
  resolved: ResolvedAdDestination[];
}): Promise<WriteDestinationsResult> {
  const { platform, adAccountId, requestedAdIds, resolved } = args;
  const requested = [...new Set(requestedAdIds.filter(Boolean))];
  const byAdId = new Map(resolved.map((r) => [r.adId, r]));
  const missingUrlAds: string[] = [];

  const bulkOps: Array<{
    updateOne: {
      filter: { platform: AdDestinationPlatform; adId: string };
      update: { $set: Record<string, unknown> };
      upsert: boolean;
    };
  }> = [];

  for (const adId of requested) {
    const hit = byAdId.get(adId);
    // Keep only URLs whose path is trustworthy; a macro-path or tracker URL is worse
    // than no URL at all.
    const rawUrls = [...new Set((hit?.rawUrls ?? []).filter(isUsableLandingUrl))];
    let primary = rawUrls[0];
    if (!primary) {
      primary = `unknown://${platform}-ad/${adId}`;
      missingUrlAds.push(adId);
    }

    bulkOps.push({
      updateOne: {
        filter: { platform, adId },
        update: {
          $set: {
            platform,
            adAccountId,
            adId,
            canonicalUrl: canonicalizeLandingUrl(primary),
            rawUrls: rawUrls.length ? rawUrls : [primary],
            multiUrl: rawUrls.length > 1,
            creativeType: hit?.creativeType ?? "unknown",
            adFormat: hit?.adFormat ?? "unknown",
            fetchedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (bulkOps.length > 0) {
    await AdDestination.bulkWrite(bulkOps, { ordered: false });
  }

  const resolvedCount = requested.length - missingUrlAds.length;
  return {
    upserted: bulkOps.length,
    missingUrlAds,
    requested: requested.length,
    coverage: requested.length > 0 ? resolvedCount / requested.length : 1,
  };
}
