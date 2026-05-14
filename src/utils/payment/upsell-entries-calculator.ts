import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { getUpsellMultiplier } from "@/services/upsell/UpsellMultiplierResolver";

export interface PackageBaseEntriesParams {
  packageId: string;
  packageType: "membership" | "one-time" | "mini-draw";
}

export function getPackageBaseEntries(params: PackageBaseEntriesParams): number {
  const { packageId, packageType } = params;
  try {
    if (packageType === "mini-draw") {
      const pkg = getMiniDrawPackageById(packageId);
      return pkg?.originalEntries ?? pkg?.entries ?? 0;
    }
    const pkg = getPackageById(packageId);
    if (!pkg) return 0;
    if (pkg.originalEntries !== undefined) return pkg.originalEntries;
    if (pkg.type === "subscription") return pkg.entriesPerMonth ?? 0;
    return pkg.totalEntries ?? 0;
  } catch (err) {
    console.error(`getPackageBaseEntries failed for ${packageId}:`, err);
    return 0;
  }
}

/**
 * Resolve upsell entries for a specific upsell record.
 * - Membership / one-time / additional upsells: categoryMultiplier × baseEntries(template).
 * - Mini upsells: baseEntries(template) (1:1, never multiplied).
 *
 * Active promo multipliers do NOT stack into the upsell calculation.
 */
export async function calculateUpsellEntriesForOffer(offerId: string): Promise<number> {
  const offer = getUpsellPackageById(offerId);
  if (!offer) return 0;

  // Pick the data source for base entries:
  // - membership / one-time / additional upsells reference packs in membershipPackages.ts
  // - mini upsells reference packs in miniDrawPackages.ts (Mini Pack 1–3 or additional-*-pack-mini)
  const lookupType: "membership" | "one-time" | "mini-draw" =
    offer.upsellCategory === "mini" ? "mini-draw" : "one-time";

  const baseEntries = getPackageBaseEntries({
    packageId: offer.baseTemplatePackageId,
    packageType: lookupType,
  });

  if (offer.upsellCategory === "mini") {
    return baseEntries; // fixed: no multiplier
  }

  const multiplier = await getUpsellMultiplier(offer.upsellCategory);
  return multiplier * baseEntries;
}

/**
 * Legacy entry point used by the existing upsell purchase route. Looks up the upsell by
 * trigger pack id (since callers pass `originalPurchaseContext`, not the upsell's own id)
 * and delegates to `calculateUpsellEntriesForOffer`. The `_promoMultiplier` argument is
 * retained for ABI compatibility with the legacy route but is intentionally unused — the
 * new formula does not stack with promo.
 */
export async function calculateUpsellEntriesFromContext(
  originalPurchaseContext: {
    packageId: string;
    packageType: "membership" | "one-time" | "mini-draw";
    baseEntries?: number;
  },
  _promoMultiplier: number
): Promise<number> {
  const { upsellPackages } = await import("@/data/upsellPackages");
  const offer = upsellPackages.find((u) =>
    u.triggersOnPackageIds?.includes(originalPurchaseContext.packageId)
  );
  if (!offer) return 0;
  return calculateUpsellEntriesForOffer(offer.id);
}
