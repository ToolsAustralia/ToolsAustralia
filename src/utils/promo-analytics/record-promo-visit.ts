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
  anonymousId?: string;
  /** Raw `referer` request header. */
  referrerHeader: string;
  /** URL used for attribution parsing (x-forwarded-url / referer / request.url). */
  url: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /**
   * First-touch UTM from the durable `_ta_attr` cookie, read server-side by the route.
   *
   * Takes precedence over the landing URL so visits, signups and conversions are all attributed
   * on the same basis. Read on the SERVER, not in the client hook: the hook that WRITES this
   * cookie mounts higher in the tree than the one that fires the visit beacon, and React runs
   * child effects first — a client-side read could beat the write on a first landing.
   */
  firstTouchUtmSource?: string;
  firstTouchUtmMedium?: string;
  firstTouchUtmCampaign?: string;
}

/** Shape passed to the recorder — matches PromoAnalyticsService.recordVisit's input. */
export interface PromoVisitRecordPayload {
  pageType: PromoPageType;
  slug: string;
  anonymousId?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmBasis?: "first_touch" | "landing_url";
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

  // FIRST-TOUCH takes precedence over the current URL.
  //
  // Visits used to read UTM only from the landing URL, while signups read the durable 90-day
  // `_ta_attr` first-touch cookie and conversions read it too. That put the visits column and
  // the signups column of the Channel table on two different bases: a visitor who arrived on a
  // UTM-tagged page, browsed to an untagged promo page and registered there gave the paid
  // channel a signup with no visit (a misleading 0% visit→signup) and Direct a visit with no
  // signup. Reading the same cookie here puts all three legs on one basis by construction.
  const utmSource = capture.firstTouchUtmSource ?? capture.utmSource ?? attribution.utm_source;
  const utmMedium = capture.firstTouchUtmMedium ?? capture.utmMedium ?? attribution.utm_medium;
  const utmCampaign =
    capture.firstTouchUtmCampaign ??
    capture.utmCampaign ??
    attribution.utm_campaign ??
    (attribution.campaign_id ? `fb_${attribution.campaign_id}` : undefined);

  const result = await deps.recordVisit({
    pageType: capture.pageType,
    slug: capture.slug,
    anonymousId: capture.anonymousId,
    referrer: referrerInfo.referrer || undefined,
    utmSource,
    utmMedium,
    utmCampaign,
    // Makes the change falsifiable in production:
    //   db.promoanalyticsvisits.aggregate([{ $sortByCount: "$utmBasis" }])
    // If a channel's visits jump after this ships, this column says whether it is the new
    // precedence or a genuine traffic change.
    utmBasis: capture.firstTouchUtmSource ? "first_touch" : "landing_url",
  });

  if (!result.success) return { recorded: false, reason: result.error ?? "record_failed" };
  return { recorded: true };
}
