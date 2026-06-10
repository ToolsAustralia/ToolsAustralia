/**
 * Functional core for recording a promo-page visit: dedup -> resolve attribution -> persist.
 *
 * Side effects (the dedup read and the write) are INJECTED, so this orchestration is
 * unit-testable with no DB/network. The promo-page-visit route is the imperative shell:
 * it captures request values, then calls this inside Next's `after()` so the work runs
 * off the response path (see docs/tracking/gotchas.md — "Tracking beacons must not block
 * the response").
 *
 * @see src/app/api/tracking/promo-page-visit/route.ts
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
import { parseReferrer } from "@/utils/tracking/referrer-helpers";
import { extractAttributionParams } from "@/utils/tracking/utm-helpers";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";

/** Request-derived values captured synchronously by the route before the response is sent. */
export interface PromoVisitCapture {
  pageType: PromoPageType;
  slug: string;
  referrerSlug?: string;
  anonymousId?: string;
  /** Raw `referer` request header. */
  referrerHeader: string;
  /** URL used for attribution parsing (x-forwarded-url / referer / request.url). */
  url: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/** Shape passed to the recorder — matches PromoAnalyticsService.recordVisit's input. */
export interface PromoVisitRecordPayload {
  pageType: PromoPageType;
  slug: string;
  referrerSlug?: string;
  anonymousId?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface PromoVisitDeps {
  /** True when a visit for this anonymousId+slug+pageType already exists within the dedup window. */
  hasRecentVisit: (args: {
    anonymousId: string;
    slug: string;
    pageType: PromoPageType;
  }) => Promise<boolean>;
  /** Persists the visit (e.g. PromoAnalyticsService.recordVisit). */
  recordVisit: (payload: PromoVisitRecordPayload) => Promise<{ success: boolean; error?: string }>;
}

export type PromoVisitOutcome =
  | { recorded: true }
  | { recorded: false; reason: "duplicate" | string };

/**
 * Dedup (when an anonymousId is present), resolve UTM/referrer attribution, then persist.
 *
 * UTM resolution order: explicit value from the request body, then URL attribution, then
 * (for utmCampaign only) a `fb_<campaign_id>` fallback for Facebook ads that omit utm_campaign.
 */
export async function recordPromoVisit(
  capture: PromoVisitCapture,
  deps: PromoVisitDeps
): Promise<PromoVisitOutcome> {
  const normalizedSlug = capture.slug.toLowerCase().trim();

  if (capture.anonymousId) {
    // Dedup is best-effort: fail OPEN on a dedup error (timeout, connection
    // failure) and record anyway. Worst cost is one duplicate row inside the
    // 60s window — dropping the visit would defeat the point of this path.
    let duplicate = false;
    try {
      duplicate = await deps.hasRecentVisit({
        anonymousId: capture.anonymousId,
        slug: normalizedSlug,
        pageType: capture.pageType,
      });
    } catch (error) {
      console.error("[record-promo-visit] dedup read failed; recording anyway:", error);
    }
    if (duplicate) return { recorded: false, reason: "duplicate" };
  }

  const referrerInfo = parseReferrer(capture.referrerHeader);
  const attribution = extractAttributionParams(capture.url);

  const utmCampaign =
    capture.utmCampaign ??
    attribution.utm_campaign ??
    (attribution.campaign_id ? `fb_${attribution.campaign_id}` : undefined);

  const result = await deps.recordVisit({
    pageType: capture.pageType,
    slug: capture.slug,
    referrerSlug: capture.referrerSlug,
    anonymousId: capture.anonymousId,
    referrer: referrerInfo.referrer || undefined,
    utmSource: capture.utmSource ?? attribution.utm_source,
    utmMedium: capture.utmMedium ?? attribution.utm_medium,
    utmCampaign,
  });

  if (!result.success) return { recorded: false, reason: result.error ?? "record_failed" };
  return { recorded: true };
}
