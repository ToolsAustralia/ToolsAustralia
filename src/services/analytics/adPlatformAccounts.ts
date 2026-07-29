import type { AdDestinationPlatform } from "@/models/AdDestination";

/**
 * The single place that maps an ad platform to the account identifier its data is stamped
 * with. Every analytics surface that accepts `?platform=` needs this, and each one getting
 * it wrong differently is how a route ends up querying TikTok rows with a Meta account id
 * and rendering a confident $0.
 *
 * The id here MUST match what the platform's insights rows carry in `adAccountId`:
 *   meta   → FACEBOOK_AD_ACCOUNT_ID (act_<id>)
 *   tiktok → TIKTOK_ADVERTISER_ID   (advertiser_id — TikTok has no separate "ad account")
 *
 * Adding a platform is one entry here plus its sync descriptor; no route changes.
 */
const AD_ACCOUNT_ENV_VAR: Record<AdDestinationPlatform, string> = {
  meta: "FACEBOOK_AD_ACCOUNT_ID",
  tiktok: "TIKTOK_ADVERTISER_ID",
};

export const AD_PLATFORMS: readonly AdDestinationPlatform[] = ["meta", "tiktok"] as const;

export function isAdPlatform(value: unknown): value is AdDestinationPlatform {
  return typeof value === "string" && (AD_PLATFORMS as readonly string[]).includes(value);
}

/** The configured account id for a platform, or null when this environment has none. */
export function resolveAdAccountId(platform: AdDestinationPlatform): string | null {
  return process.env[AD_ACCOUNT_ENV_VAR[platform]]?.trim() || null;
}

/** Which env var to name in an error message when `resolveAdAccountId` returns null. */
export function adAccountEnvVar(platform: AdDestinationPlatform): string {
  return AD_ACCOUNT_ENV_VAR[platform];
}
