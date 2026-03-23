import MetaAdDestination from "@/models/MetaAdDestination";
import { canonicalizeLandingUrl } from "@/utils/meta/canonicalize-landing-url";

const API_VERSION = "v21.0";
const BATCH_SIZE = 45;

interface FacebookApiError {
  error?: { message?: string; code?: number };
}

type AdFormat = "video" | "static" | "carousel" | "unknown";

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
    const cta = vd.call_to_action;
    if (cta && typeof cta === "object") {
      const c = cta as { value?: { link?: string }; link?: string };
      if (c.value?.link) urls.push(c.value.link);
      if (typeof c.link === "string") urls.push(c.link);
    }
  }

  if (s.link_data && typeof s.link_data === "object") {
    const ld = s.link_data as Record<string, unknown>;
    if (typeof ld.link === "string") urls.push(ld.link);
    if (Array.isArray(ld.child_attachments)) {
      for (const child of ld.child_attachments) {
        if (child && typeof child === "object") {
          const link = (child as { link?: string }).link;
          if (typeof link === "string") urls.push(link);
        }
      }
    }
  }

  /** Photo / static image creatives: destination link is often under photo_data. */
  if (s.photo_data && typeof s.photo_data === "object") {
    const pd = s.photo_data as Record<string, unknown>;
    if (typeof pd.link === "string") urls.push(pd.link);
    const cta = pd.call_to_action;
    if (cta && typeof cta === "object") {
      const c = cta as { value?: { link?: string }; link?: string };
      if (c.value?.link) urls.push(c.value.link);
      if (typeof c.link === "string") urls.push(c.link);
    }
  }

  if (s.template_data && typeof s.template_data === "object") {
    const td = s.template_data as Record<string, unknown>;
    if (typeof td.link === "string") urls.push(td.link);
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

  if (c.asset_feed_spec && typeof c.asset_feed_spec === "object") {
    const afs = c.asset_feed_spec;
    const urlsFromFeed = extractLinksFromAssetFeedSpec(afs);
    const formatFromFeed = inferAdFormatFromAssetFeed(afs);
    const adFormat = formatFromFeed !== "unknown" ? formatFromFeed : formatFromStory;
    if (urlsFromFeed.length > 0) {
      return { urls: urlsFromFeed, creativeType: "asset_feed", adFormat };
    }
    return { urls: [], creativeType: "asset_feed", adFormat };
  }

  return { urls: [], creativeType: "unknown", adFormat: formatFromStory };
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
    adIds: string[]
  ): Promise<SyncDestinationsResult> {
    const unique = [...new Set(adIds.filter(Boolean))];
    const missingUrlAds: string[] = [];
    let upserted = 0;

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const chunk = unique.slice(i, i + BATCH_SIZE);
      const u = new URL(`https://graph.facebook.com/${API_VERSION}/`);
      u.searchParams.set("ids", chunk.join(","));
      u.searchParams.set("fields", "creative{object_story_spec,asset_feed_spec,url_tags}");
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

        await MetaAdDestination.findOneAndUpdate(
          { adId },
          {
            adAccountId,
            adId,
            canonicalUrl,
            rawUrls: rawUrls.length ? rawUrls : [primary],
            multiUrl,
            creativeType,
            adFormat,
            fetchedAt: new Date(),
          },
          { upsert: true, new: true }
        );
        upserted++;
      }
    }

    return { upserted, missingUrlAds };
  }
}
