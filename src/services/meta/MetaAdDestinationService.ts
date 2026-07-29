import AdDestination from "@/models/AdDestination";
import { canonicalizeLandingUrl } from "@/utils/metrics/canonicalize-landing-url";

const API_VERSION = "v21.0";
const BATCH_SIZE = 45;

interface FacebookApiError {
  error?: { message?: string; code?: number };
}

type AdFormat = "video" | "static" | "carousel" | "unknown";

/** Pull destination links from Meta call_to_action objects (shape varies by placement). */
function pushUrlsFromCallToAction(cta: unknown, urls: string[]) {
  if (!cta || typeof cta !== "object") return;
  const c = cta as { value?: { link?: string }; link?: string };
  if (c.value?.link) urls.push(c.value.link);
  if (typeof c.link === "string") urls.push(c.link);
}

function inferAdFormatFromStorySpec(spec: unknown): AdFormat {
  if (!spec || typeof spec !== "object") return "unknown";
  const s = spec as Record<string, unknown>;
  if (s.video_data && typeof s.video_data === "object") return "video";
  const ld = s.link_data as Record<string, unknown> | undefined;
  if (ld && Array.isArray(ld.child_attachments) && ld.child_attachments.length > 1) {
    return "carousel";
  }
  if (ld && typeof ld === "object") return "static";
  /** Photo ads often use photo_data (link may live here instead of link_data). */
  if (s.photo_data && typeof s.photo_data === "object") return "static";
  return "unknown";
}

function extractLinksFromObjectStorySpec(spec: unknown): string[] {
  const urls: string[] = [];
  if (!spec || typeof spec !== "object") return urls;
  const s = spec as Record<string, unknown>;

  /** Video creatives: destination is often only under video_data (not link_data). */
  if (s.video_data && typeof s.video_data === "object") {
    const vd = s.video_data as Record<string, unknown>;
    if (typeof vd.link === "string") urls.push(vd.link);
    pushUrlsFromCallToAction(vd.call_to_action, urls);
  }

  if (s.link_data && typeof s.link_data === "object") {
    const ld = s.link_data as Record<string, unknown>;
    if (typeof ld.link === "string") urls.push(ld.link);
    /** Some link ads expose destination only on `website_url` or CTA, not `link`. */
    if (typeof ld.website_url === "string") urls.push(ld.website_url);
    pushUrlsFromCallToAction(ld.call_to_action, urls);
    if (Array.isArray(ld.child_attachments)) {
      for (const child of ld.child_attachments) {
        if (child && typeof child === "object") {
          const ch = child as { link?: string; call_to_action?: unknown };
          if (typeof ch.link === "string") urls.push(ch.link);
          pushUrlsFromCallToAction(ch.call_to_action, urls);
        }
      }
    }
  }

  /** Text-only / some static formats use text_data with optional link. */
  if (s.text_data && typeof s.text_data === "object") {
    const td = s.text_data as Record<string, unknown>;
    if (typeof td.link === "string") urls.push(td.link);
    pushUrlsFromCallToAction(td.call_to_action, urls);
  }

  /** Photo / static image creatives: destination link is often under photo_data. */
  if (s.photo_data && typeof s.photo_data === "object") {
    const pd = s.photo_data as Record<string, unknown>;
    if (typeof pd.link === "string") urls.push(pd.link);
    pushUrlsFromCallToAction(pd.call_to_action, urls);
  }

  if (s.template_data && typeof s.template_data === "object") {
    const td = s.template_data as Record<string, unknown>;
    if (typeof td.link === "string") urls.push(td.link);
    pushUrlsFromCallToAction(td.call_to_action, urls);
  }

  return [...new Set(urls.filter(Boolean))];
}

/**
 * Dynamic Creative / Advantage+ ads store landing URLs under asset_feed_spec.link_urls,
 * not under object_story_spec (which may only contain page_id).
 * @see https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/options/
 */
function extractLinksFromAssetFeedSpec(spec: unknown): string[] {
  const urls: string[] = [];
  if (!spec || typeof spec !== "object") return urls;
  const s = spec as Record<string, unknown>;
  const linkUrls = s.link_urls;
  if (!Array.isArray(linkUrls)) return urls;
  for (const item of linkUrls) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.website_url === "string") urls.push(o.website_url);
  }
  for (const item of linkUrls) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.deeplink_url === "string") urls.push(o.deeplink_url);
  }
  return [...new Set(urls.filter(Boolean))];
}

function inferAdFormatFromAssetFeed(spec: unknown): AdFormat {
  if (!spec || typeof spec !== "object") return "unknown";
  const s = spec as Record<string, unknown>;
  const formats = s.ad_formats;
  if (!Array.isArray(formats) || formats.length === 0) return "unknown";
  const f = String(formats[0]).toUpperCase();
  if (f === "SINGLE_VIDEO") return "video";
  if (f === "CAROUSEL" || f === "CAROUSEL_IMAGE") return "carousel";
  if (f === "SINGLE_IMAGE" || f === "AUTOMATIC_FORMAT") return "static";
  return "unknown";
}

function extractUrlsFromCreative(creative: unknown): {
  urls: string[];
  creativeType: string;
  adFormat: AdFormat;
} {
  if (!creative || typeof creative !== "object") {
    return { urls: [], creativeType: "none", adFormat: "unknown" };
  }
  const c = creative as Record<string, unknown>;
  const oss = c.object_story_spec;
  const urlsFromStory = extractLinksFromObjectStorySpec(oss);
  const formatFromStory = inferAdFormatFromStorySpec(oss);

  if (urlsFromStory.length > 0) {
    return { urls: urlsFromStory, creativeType: "object_story", adFormat: formatFromStory };
  }

  const afs = c.asset_feed_spec && typeof c.asset_feed_spec === "object" ? c.asset_feed_spec : null;
  const fromFeed = afs ? extractLinksFromAssetFeedSpec(afs) : [];
  const formatFromFeed = afs ? inferAdFormatFromAssetFeed(afs) : "unknown";
  const adFormatFromFeed =
    formatFromFeed !== "unknown" ? formatFromFeed : formatFromStory !== "unknown" ? formatFromStory : "static";

  const fromTop: string[] = [];
  if (typeof c.object_url === "string") fromTop.push(c.object_url);
  if (typeof c.link_url === "string") fromTop.push(c.link_url);

  /** Prefer asset_feed URLs, then creative-level link_url / object_url (often set for DC / Advantage+). */
  const merged = [...new Set([...fromFeed, ...fromTop].filter(Boolean))];

  if (merged.length === 0) {
    return {
      urls: [],
      creativeType: afs ? "asset_feed" : "unknown",
      adFormat: afs ? adFormatFromFeed : formatFromStory,
    };
  }

  let creativeType: string;
  if (fromFeed.length > 0) {
    creativeType = "asset_feed";
  } else if (fromTop.length > 0) {
    creativeType = "creative_fields";
  } else {
    creativeType = "unknown";
  }

  return {
    urls: merged,
    creativeType,
    adFormat: fromFeed.length > 0 ? adFormatFromFeed : formatFromStory !== "unknown" ? formatFromStory : "static",
  };
}

export interface SyncDestinationsResult {
  upserted: number;
  missingUrlAds: string[];
}

/**
 * Batch-fetch Ad objects from Graph API and upsert MetaAdDestination.
 * Spend is attributed to the first URL when multiple exist (see plan).
 */
export class MetaAdDestinationService {
  async syncDestinationsForAdIds(
    adAccountId: string,
    accessToken: string,
    adIds: string[],
    options?: { onProgress?: (message: string) => void }
  ): Promise<SyncDestinationsResult> {
    const log = options?.onProgress;
    const unique = [...new Set(adIds.filter(Boolean))];
    const missingUrlAds: string[] = [];
    let upserted = 0;
    const totalChunks = Math.max(1, Math.ceil(unique.length / BATCH_SIZE));

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const chunk = unique.slice(i, i + BATCH_SIZE);
      const chunkIndex = Math.floor(i / BATCH_SIZE) + 1;
      log?.(`[destinations] Graph batch ${chunkIndex}/${totalChunks} (${chunk.length} ads)…`);
      const u = new URL(`https://graph.facebook.com/${API_VERSION}/`);
      u.searchParams.set("ids", chunk.join(","));
      u.searchParams.set(
        "fields",
        "creative{object_story_spec,asset_feed_spec,url_tags,object_url,link_url}"
      );
      u.searchParams.set("access_token", accessToken);

      const res = await fetch(u.toString(), { method: "GET", headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const err: FacebookApiError = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Facebook batch ad fetch failed: ${res.status}`);
      }

      const data = (await res.json()) as Record<
        string,
        { creative?: unknown; id?: string; error?: { message?: string } }
      >;

      const bulkOps: Array<{
        updateOne: {
          // `platform` is half the unique key — see the filter below.
          filter: { platform: "meta"; adId: string };
          update: { $set: Record<string, unknown> };
          upsert: boolean;
        };
      }> = [];

      for (const adId of chunk) {
        const node = data[adId];
        if (!node || ("error" in node && node.error)) {
          missingUrlAds.push(adId);
          continue;
        }
        const { urls, creativeType, adFormat } = extractUrlsFromCreative(node.creative);
        const rawUrls = [...new Set(urls)];
        let primary = rawUrls[0];
        if (!primary) {
          primary = `unknown://meta-ad/${adId}`;
          missingUrlAds.push(adId);
        }
        const canonicalUrl = canonicalizeLandingUrl(primary);
        const multiUrl = rawUrls.length > 1;

        bulkOps.push({
          updateOne: {
            // The filter MUST carry platform — it is half the unique key. Without it the
            // upsert can target another platform's row for the same numeric ad id, or
            // insert a row that then violates {platform, adId} (2026-07-29).
            filter: { platform: "meta" as const, adId },
            update: {
              $set: {
                platform: "meta" as const,
                adAccountId,
                adId,
                canonicalUrl,
                rawUrls: rawUrls.length ? rawUrls : [primary],
                multiUrl,
                creativeType,
                adFormat,
                fetchedAt: new Date(),
              },
            },
            upsert: true,
          },
        });
        upserted++;
      }

      if (bulkOps.length > 0) {
        await AdDestination.bulkWrite(bulkOps, { ordered: false });
      }
    }

    return { upserted, missingUrlAds };
  }
}
