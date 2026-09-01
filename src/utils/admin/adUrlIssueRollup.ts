import { checkAdUrlMismatch, type CheckAdUrlMismatchResult } from "./adUrlMismatchCheck";
import type { PackagesFocusAdNode } from "@/hooks/queries/usePackagesFocusBreakdown";

/**
 * Campaign/ad-set roll-up of the per-ad `checkAdUrlMismatch` verdict.
 *
 * The badge on a Brand Performance row could say "Makita: 7 wrong-brand, 53 typo'd" but gave no
 * way to find WHICH campaign or ad set to open — every row in `CampaignTreeTable` looked
 * identical, so the owner had to expand every one by hand. This rolls the same per-ad verdict up
 * to the campaign and ad-set levels so those rows can badge too, making brand → campaign → ad set
 * → ad an unbroken trail.
 *
 * NEVER a second rule: `checkAdUrlMismatch` (`./adUrlMismatchCheck.ts`) is the one validated
 * implementation — production-checked at 8 real mismatches / 83 typos / zero false positives.
 * This module only calls it once per ad and aggregates the result; it must not re-derive a
 * verdict by any other means.
 */
export interface AdUrlIssueRollup {
  /** Ads whose campaign/ad naming contradicts their landing URL's brand. */
  mismatchAdCount: number;
  /** Ads carrying a `?toolbox=`/`?toolset=` value that names no known brand (a typo). */
  unrecognisedParamAdCount: number;
  /**
   * How many ads had a landing URL to check at all — the denominator. An ad with no URL data
   * (the KPI modal's per-bucket trees never populate `packagesFocus`/`rawUrls`/`canonicalUrl`)
   * is unverifiable, not clean, and contributes to none of these three counts.
   */
  checkedAdCount: number;
}

/** One ad's URL info — the RAW urls to check/show, and its verdict (`null` when the node carries
 *  no URL data at all, e.g. the KPI modal's per-bucket trees). */
export interface AdUrlInfo {
  rawUrls: string[];
  mismatch: CheckAdUrlMismatchResult | null;
}

/**
 * Computes one ad's URL info — the SAME inputs `CampaignTreeTable`'s per-ad icon already used
 * inline, extracted here so it runs exactly ONCE per ad and feeds both the ad row itself and the
 * campaign/ad-set roll-ups below, rather than being recomputed for each.
 */
export function computeAdUrlInfo(
  campaignName: string | undefined,
  ad: Pick<PackagesFocusAdNode, "adName" | "packagesFocus" | "rawUrls" | "canonicalUrl">,
): AdUrlInfo {
  const hasUrlInfo = ad.packagesFocus !== undefined;
  const rawUrls =
    ad.rawUrls && ad.rawUrls.length > 0 ? ad.rawUrls : ad.canonicalUrl ? [ad.canonicalUrl] : [];
  const mismatch = hasUrlInfo
    ? checkAdUrlMismatch({ campaignName, adName: ad.adName, urls: rawUrls })
    : null;
  return { rawUrls, mismatch };
}

/**
 * Aggregates a set of already-computed per-ad verdicts (`null` = unverifiable, no URL data) into
 * one campaign/ad-set roll-up. A campaign/ad-set whose ads are all clean (or all unverifiable)
 * rolls up to zero on every count — `AdUrlIssueBadge` renders nothing for that, the same
 * "no clean state" rule the per-ad icon and the brand-row badge already follow.
 */
export function rollupAdUrlIssues(verdicts: Array<CheckAdUrlMismatchResult | null>): AdUrlIssueRollup {
  let mismatchAdCount = 0;
  let unrecognisedParamAdCount = 0;
  let checkedAdCount = 0;
  for (const verdict of verdicts) {
    if (!verdict) continue;
    checkedAdCount++;
    if (verdict.verdict === "mismatch") mismatchAdCount++;
    if (verdict.unrecognisedParamValues.length > 0) unrecognisedParamAdCount++;
  }
  return { mismatchAdCount, unrecognisedParamAdCount, checkedAdCount };
}
