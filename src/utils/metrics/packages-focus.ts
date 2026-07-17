import {
  MEMBERSHIP_PACKAGES_QUERY_PARAM,
  parseMembershipPackagesTab,
} from "@/utils/membership/packagesTabParam";
import { canonicalizeLandingUrl } from "@/utils/meta/canonicalize-landing-url";

/**
 * packagesFocus — which package strategy an ad's landing URL targets.
 *
 * The ads team runs two landing-URL variants (live since early July 2026):
 *   membership-focus (default) — promo URL WITHOUT a `packages` param
 *   one-time-focus            — same URL plus `?packages=one-time`
 *
 * The rule is binary: `packages=one-time` → "one-time"; EVERYTHING else
 * (absent param, invalid value, explicit `?packages=membership`) → "membership".
 * Ads never use `?packages=membership` — the default is expressed by omission
 * (see the docblock in utils/membership/packagesTabParam.ts).
 *
 * "unclassified" is a bucket, not a focus: ads whose destination Meta couldn't
 * resolve (`unknown://meta-ad/<id>`) and pre-feature aggregate rows.
 */
export const PACKAGES_FOCUS_VALUES = ["membership", "one-time"] as const;
export type PackagesFocus = (typeof PACKAGES_FOCUS_VALUES)[number];
export type PackagesFocusBucket = PackagesFocus | "unclassified";

/** Classify one landing URL. Non-URL or non-http input falls back to membership. */
export function derivePackagesFocusFromUrl(url: string): PackagesFocus {
  try {
    const parsed = new URL(url.trim());
    const value = parseMembershipPackagesTab(parsed.searchParams.get(MEMBERSHIP_PACKAGES_QUERY_PARAM));
    return value === "one-time" ? "one-time" : "membership";
  } catch {
    return "membership";
  }
}

/**
 * The ad's PRIMARY landing URL: the first rawUrls entry whose canonicalization
 * equals the stored canonicalUrl (MetaAdDestinationService derives canonicalUrl
 * from rawUrls[0], but match by canonicalization rather than trusting order),
 * falling back to rawUrls[0].
 */
export function resolvePrimaryRawUrl(
  rawUrls: readonly string[] | null | undefined,
  canonicalUrl?: string | null,
): string | undefined {
  if (!rawUrls || rawUrls.length === 0) return undefined;
  if (canonicalUrl) {
    const match = rawUrls.find((u) => canonicalizeLandingUrl(u) === canonicalUrl);
    if (match) return match;
  }
  return rawUrls[0];
}

/**
 * Classify a MetaAdDestination doc (or its lean projection). Unresolved
 * destinations — missing doc, empty rawUrls, or the `unknown://` placeholder —
 * are "unclassified"; a real http(s) primary URL classifies via the binary rule.
 */
export function derivePackagesFocusForDestination(
  dest: { rawUrls?: readonly string[] | null; canonicalUrl?: string | null } | null | undefined,
): PackagesFocusBucket {
  if (!dest) return "unclassified";
  if (dest.canonicalUrl?.startsWith("unknown://")) return "unclassified";
  const primary = resolvePrimaryRawUrl(dest.rawUrls, dest.canonicalUrl);
  if (!primary || !/^https?:\/\//i.test(primary.trim())) return "unclassified";
  return derivePackagesFocusFromUrl(primary);
}
