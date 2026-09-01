/**
 * Meta Ads Manager deep link for ONE ad — the ad's EDIT screen, not a filtered list.
 *
 * Kept as the single place this URL shape is written (it is built inside a table cell that
 * renders once per ad), so a future correction stays a one-line change here.
 *
 * ## Provenance
 *
 * `verified` — the shape below is the owner's own working URL, copied out of a live Ads Manager
 * session on 2026-09-01, with only the account id, business id and ad id parameterised. The
 * previous shape (`/adsmanager/manage/ads?act=…&selected_ad_ids=…`) was `assumed`, never opened,
 * and landed on a filtered ad LIST rather than the ad itself.
 *
 * ## Why the encoding is hand-written rather than `encodeURIComponent`
 *
 * `filter_set` is a Meta-internal serialisation, not a normal query value:
 *
 *   SEARCH_BY_ADGROUP_IDS-STRING_SET<RS>ANY<RS>["<adId>"]
 *
 * where `<RS>` is the ASCII record separator U+001E, sent as `%1E`. In the working URL the
 * square brackets are LITERAL and only the double quotes are percent-encoded (`%22`). Running
 * `encodeURIComponent` over the whole value would also encode the brackets as `%5B`/`%5D`, and
 * possibly the separator differently. That may well still work — but the owner's format is the
 * one we know works, and there is no way to test a variation from here, so it is reproduced
 * character for character.
 *
 * `nav_source=no_referrer` and `current_step=0` are present in the working URL and kept.
 *
 * ## Degrading without a business id
 *
 * `business_id` names the Business Manager the account sits under. It is configuration, not
 * something the app can derive, so it comes from the environment (see `resolveMetaBusinessId`).
 * When it is unset the parameter is OMITTED and the rest of the link is built unchanged — Meta
 * resolves the business from the signed-in session in most cases. `assumed`, not verified: an
 * account belonging to several businesses may land on a chooser instead of the ad. Setting the
 * env var is the fix; emitting `business_id=` empty or refusing to render the link would both
 * be worse than a link that usually works.
 */

/** ASCII record separator (U+001E), Meta's delimiter inside `filter_set`. */
const RECORD_SEPARATOR = "%1E";

/**
 * The Business Manager id for Ads Manager deep links.
 *
 * Server var first, `NEXT_PUBLIC_` twin as the fallback — the same pairing
 * `src/config/featureFlags.ts` uses for values needed on both sides. The link is built in a
 * client component today, so `NEXT_PUBLIC_FACEBOOK_BUSINESS_ID` is the one that must be set;
 * both are declared so a future server-side caller needs no new variable.
 *
 * ⚠️ `.env.local` never merges between folders and Vercel is configured independently — set the
 * value in every worktree's `.env.local`, the main folder's, AND Vercel (CLAUDE.md §9).
 */
export function resolveMetaBusinessId(): string | undefined {
  const server = process.env.FACEBOOK_BUSINESS_ID;
  if (typeof server === "string" && server.trim()) return server.trim();
  const client = process.env.NEXT_PUBLIC_FACEBOOK_BUSINESS_ID;
  if (typeof client === "string" && client.trim()) return client.trim();
  return undefined;
}

/**
 * Deep link to one ad's edit screen in Meta Ads Manager.
 *
 * @param adAccountId with or without the `act_` prefix — Ads Manager wants it bare.
 * @param adId        the Meta ad id.
 * @param businessId  defaults to the configured value; pass explicitly only in tests.
 */
export function buildAdsManagerAdUrl(
  adAccountId: string,
  adId: string,
  businessId: string | undefined = resolveMetaBusinessId(),
): string {
  const bareAccountId = adAccountId.replace(/^act_/, "");
  const filterSet = `SEARCH_BY_ADGROUP_IDS-STRING_SET${RECORD_SEPARATOR}ANY${RECORD_SEPARATOR}[%22${adId}%22]`;

  const params = [
    `act=${encodeURIComponent(bareAccountId)}`,
    ...(businessId ? [`business_id=${encodeURIComponent(businessId)}`] : []),
    `filter_set=${filterSet}`,
    `selected_ad_ids=${encodeURIComponent(adId)}`,
    "nav_source=no_referrer",
    "current_step=0",
  ];

  return `https://adsmanager.facebook.com/adsmanager/manage/ads/edit/standalone?${params.join("&")}`;
}
