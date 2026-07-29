import { isValidPromoSlug, getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import type { AttributionParams } from "@/types/tracking";

/**
 * The attribution snapshot stamped onto `User.signupAttribution` at registration.
 *
 * Mirrors the inline nested object on the User schema (`src/models/User.ts`) — the schema
 * additionally carries an optional `anonymousId`, which this path never sets.
 */
export type SignupAttribution = {
  promotionPageType?: "evergreen" | "toolset";
  promotionSlug?: string;
  builtPrizeSlug?: string;
  visitedAt: Date;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  clickPlatform?: "meta" | "tiktok" | "snapchat" | "google";
};

/**
 * Build signup attribution. Persists whenever a valid promo slug OR any attribution
 * param is present — promotionSlug/promotionPageType are optional (homepage ad-landers
 * carry UTM but no promo slug, and we must not drop their attribution).
 *
 * ⚠️ ARGUMENT ORDER IS LOAD-BEARING. All four parameters are optional strings/objects, so
 * transposing two of them type-checks cleanly and silently writes a promo slug into the
 * built-prize field (or vice versa). Two separate branches each added a "third parameter"
 * to this function during a merge. `npm run test:signup-attribution` carries an explicit
 * argument-position guard for exactly that class of mistake — keep it passing.
 */
export function buildSignupAttribution(
  promotionSlug?: string,
  attribution?: AttributionParams,
  /** The prize the visitor actually assembled in the reels, when they touched them. */
  builtPrizeSlug?: string,
  /**
   * Paid platform resolved from the request's click-id cookies (`_fbc`/`ttclid`/
   * `_sc_click`). Gives signup-source analytics the SAME click-verified basis that
   * purchases already use — without it, a paid signup that landed without UTM tags is
   * indistinguishable from organic. Only the platform is persisted, never the click id.
   */
  clickPlatform?: "meta" | "tiktok" | "snapchat" | "google"
): SignupAttribution | undefined {
  const hasPromo = !!promotionSlug && isValidPromoSlug(promotionSlug);
  const hasAttribution = !!(
    attribution &&
    (attribution.utm_source || attribution.utm_medium || attribution.utm_campaign ||
     attribution.campaign_id || attribution.adset_id || attribution.ad_id)
  );
  // Validated exactly like promotionSlug — a hand-edited URL or a crawler must not be able to
  // write an arbitrary string into attribution.
  const hasBuiltPrize = !!builtPrizeSlug && isValidPromoSlug(builtPrizeSlug);
  // A paid click with no promo slug and no UTMs is still real attribution — persist it.
  // `builtPrizeSlug` is deliberately NOT a reason to persist on its own: it only ever arrives
  // alongside a promo slug (it is derived from the promo page's own reels), so treating it as a
  // trigger would let a bare crafted param mint an attribution row that means nothing.
  if (!hasPromo && !hasAttribution && !clickPlatform) return undefined;
  return {
    ...(hasPromo && {
      promotionPageType: getPageTypeFromSlug(promotionSlug!),
      promotionSlug: promotionSlug!.toLowerCase().trim(),
    }),
    ...(hasBuiltPrize && { builtPrizeSlug: builtPrizeSlug!.toLowerCase().trim() }),
    visitedAt: new Date(),
    ...(attribution?.utm_source && { utmSource: attribution.utm_source }),
    ...(attribution?.utm_medium && { utmMedium: attribution.utm_medium }),
    ...(attribution?.utm_campaign && { utmCampaign: attribution.utm_campaign }),
    ...(attribution?.utm_content && { utmContent: attribution.utm_content }),
    ...(attribution?.utm_term && { utmTerm: attribution.utm_term }),
    ...(attribution?.campaign_id && { campaignId: attribution.campaign_id }),
    ...(attribution?.adset_id && { adsetId: attribution.adset_id }),
    ...(attribution?.ad_id && { adId: attribution.ad_id }),
    ...(clickPlatform && { clickPlatform }),
  };
}

/**
 * Fold a freshly-built attribution onto whatever the account already carries.
 *
 * Registering again on an EXISTING account must never erase attribution the account
 * already has. Assigning `signupAttribution` wholesale emits a whole-subdocument `$set`
 * (it is an inline nested object, not a sub-Schema), so a later signup carrying only a
 * click-id cookie would wipe `promotionSlug` / `promotionPageType` / `builtPrizeSlug`
 * captured on the first visit — the abandon-then-return visitor, i.e. exactly the one the
 * resume flow exists to bring back. That path opened up when a bare `clickPlatform`
 * became sufficient to persist on its own; before that, such a request returned
 * `undefined` here and left the prior attribution untouched.
 *
 * First-touch wins for the promo fields (they identify where the visitor was acquired);
 * everything else is last-write-wins, so a newer click/UTM still refreshes.
 */
export function mergeSignupAttribution(
  previous: SignupAttribution | undefined,
  next: SignupAttribution
): SignupAttribution {
  if (!previous) return next;
  return {
    ...previous,
    ...next,
    // Keep the original acquisition page/build when this signup did not carry one.
    ...(!next.promotionSlug && previous.promotionSlug
      ? {
          promotionSlug: previous.promotionSlug,
          promotionPageType: previous.promotionPageType,
        }
      : {}),
    ...(!next.builtPrizeSlug && previous.builtPrizeSlug
      ? { builtPrizeSlug: previous.builtPrizeSlug }
      : {}),
  };
}

/**
 * Mongoose stores `signupAttribution` as an inline nested object, so reading it back off a
 * hydrated document can yield a Mongoose-wrapped value. Normalise to a plain object before
 * merging so spreading it cannot drag internal symbols onto the write.
 */
export function plainSignupAttribution(value: unknown): SignupAttribution | undefined {
  if (!value || typeof value !== "object") return undefined;
  const maybeDoc = value as { toObject?: () => unknown };
  const plain = typeof maybeDoc.toObject === "function" ? maybeDoc.toObject() : value;
  return plain as SignupAttribution;
}
