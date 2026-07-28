/**
 * Cheapest packages that unlock a given partner-catalogue tier — pure static-data
 * helper for the rewards-return banner recommendation ("unlock the rest of the
 * partner catalogue with …"). Given the percent a member still needs, it returns
 * the cheapest active subscription and the cheapest active PUBLIC one-time pack
 * whose partner-catalogue access percent covers it, so the banner can offer one
 * upgrade path per purchase family.
 *
 * THE TRAP — resolve percents via the MEMBERSHIP-PACKAGE-ID resolver only
 * ----------------------------------------------------------------------
 * Percents MUST come from `getPartnerCatalogAccessPercentForMembershipPackageId(pkg._id)`
 * (static lookup → `derivePlanIdFromPackage` → tier rules). Never feed a bare tier
 * word to `getPartnerCatalogAccessPercentForPlanId`: "tradie" alone misses the
 * `includes("subscription")` branch and returns the ONE-TIME percent (40) instead
 * of the subscription's 50 — and any id that matches no tier rule inherits the
 * "unknown → 100%" fallback, which would silently promote a mis-keyed package to
 * top tier. Iterating real catalog `_id`s through the membership-package resolver
 * avoids both failure modes.
 *
 * Candidate pool: active subscriptions plus active public one-time packs.
 * Member-only `additional-*` packs are excluded (`isAdditional`), and mini packs
 * never appear here — they live outside `membershipPackages` static data.
 *
 * @module utils/partner-discounts/unlock-packages
 */

import { getPackagesByType, type StaticMembershipPackage } from "@/data/membershipPackages";
import {
  getPartnerCatalogAccessPercentForMembershipPackageId,
  PARTNER_CATALOG_LADDER_PCTS,
} from "@/utils/partner-discounts/partner-catalog-visibility";

/** One recommended package: the cheapest in its family covering the required percent. */
export interface UnlockPackageOption {
  packageId: string;
  name: string;
  price: number;
  /** The package's own partner-catalogue access percent (>= the required percent). */
  pct: number;
}

export interface UnlockPackagesForLevel {
  subscription: UnlockPackageOption | null;
  oneTime: UnlockPackageOption | null;
}

function cheapestCovering(
  packages: StaticMembershipPackage[],
  requiredPct: number
): UnlockPackageOption | null {
  let best: UnlockPackageOption | null = null;
  for (const pkg of packages) {
    const pct = getPartnerCatalogAccessPercentForMembershipPackageId(pkg._id);
    if (pct < requiredPct) continue;
    if (!best || pkg.price < best.price) {
      best = { packageId: pkg._id, name: pkg.name, price: pkg.price, pct };
    }
  }
  return best;
}

/**
 * Resolve the cheapest active subscription and cheapest active public one-time pack
 * whose partner-catalogue percent covers `requiredPct`.
 *
 * @param requiredPct one of the ladder percents ({@link PARTNER_CATALOG_LADDER_PCTS});
 *   anything else (0, NaN, in-between values) returns `{ subscription: null, oneTime: null }`
 *   — fail-closed rather than guessing a tier (mirrors member-level.ts).
 */
export function resolveUnlockPackagesForLevel(requiredPct: number): UnlockPackagesForLevel {
  if (!PARTNER_CATALOG_LADDER_PCTS.has(requiredPct)) {
    return { subscription: null, oneTime: null };
  }

  // getPackagesByType already filters isActive; exclude member-only additional-* packs
  // so the banner never recommends a pack the viewer may not be eligible to buy.
  const subscription = cheapestCovering(getPackagesByType("subscription"), requiredPct);
  const oneTime = cheapestCovering(
    getPackagesByType("one-time").filter((pkg) => !pkg.isAdditional),
    requiredPct
  );
  return { subscription, oneTime };
}
