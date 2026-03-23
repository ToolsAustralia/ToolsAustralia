/**
 * Meta (Facebook) Ads — UTM and URL parameter conventions for this project.
 *
 * Apply in Ads Manager → Ad → Tracking → URL parameters (or website URL), using
 * dynamic parameters where the UI supports them. Example template:
 *
 *   utm_source=facebook
 *   &utm_medium=paid
 *   &utm_campaign={{campaign.name}}
 *   &utm_content={{ad.id}}
 *   &utm_term={{adset.name}}
 *
 * Macro names depend on ad type and Meta UI version — confirm in Ads Manager
 * when creating ads. Use numeric/string ad IDs in utm_content for reliable joins
 * to MetaAdDestination.adId and synced insights.
 *
 * @see MetaAdDestination model and /api/admin/analytics/spend-by-url
 */

export const META_ADS_UTM_TEMPLATE =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.id}}&utm_term={{adset.name}}";

export type UtmParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

/**
 * Parse standard UTM parameters from a URLSearchParams instance (e.g. from request URL).
 */
export function parseUtm(searchParams: URLSearchParams): UtmParams {
  return {
    source: searchParams.get("utm_source") ?? undefined,
    medium: searchParams.get("utm_medium") ?? undefined,
    campaign: searchParams.get("utm_campaign") ?? undefined,
    content: searchParams.get("utm_content") ?? undefined,
    term: searchParams.get("utm_term") ?? undefined,
  };
}
