import { getUpsellPackageById } from "@/data/upsellPackages";
import { getUpsellMultiplier } from "@/services/upsell/UpsellMultiplierResolver";
import { getPackageBaseEntries } from "@/utils/payment/package-base-entries";

/**
 * Async, multiplier-aware upsell-entries calculator. **Server-only by convention** —
 * this file imports `UpsellMultiplierResolver`, which depends on Mongoose.
 *
 * Client components MUST NOT import from this file; use `package-base-entries.ts`
 * for the pure base-entries lookup instead.
 */

/**
 * Resolve upsell entries for a specific upsell record.
 *
 * Formula (all categories): `activePromoMultiplier × upsellCategoryMultiplier × baseEntries`
 * - Membership / one-time / additional upsells: upsellCategoryMultiplier is the admin-configured value.
 * - Mini upsells: upsellCategoryMultiplier is fixed at 1 — so result is `activePromoMultiplier × baseEntries`.
 *
 * `activePromoMultiplier` should be the promo that applied to the original trigger purchase
 * (recorded in `originalPurchaseContext.promoMultiplier`). Default 1× means no active promo.
 */
export async function calculateUpsellEntriesForOffer(
  offerId: string,
  activePromoMultiplier: number = 1
): Promise<number> {
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

  const promo = Number.isFinite(activePromoMultiplier) && activePromoMultiplier >= 1
    ? activePromoMultiplier
    : 1;

  if (offer.upsellCategory === "mini") {
    return promo * baseEntries; // mini upsell category multiplier is fixed at 1
  }

  const categoryMultiplier = await getUpsellMultiplier(offer.upsellCategory);
  return promo * categoryMultiplier * baseEntries;
}

/**
 * Legacy entry point used by the existing upsell purchase route. Looks up the upsell by
 * trigger pack id (since callers pass `originalPurchaseContext`, not the upsell's own id)
 * and delegates to `calculateUpsellEntriesForOffer`, passing through the promo that applied
 * to the original purchase so the new formula can stack it correctly.
 */
export async function calculateUpsellEntriesFromContext(
  originalPurchaseContext: {
    packageId: string;
    packageType: "membership" | "one-time" | "mini-draw";
    baseEntries?: number;
  },
  promoMultiplier: number
): Promise<number> {
  const { upsellPackages } = await import("@/data/upsellPackages");
  const offer = upsellPackages.find((u) =>
    u.triggersOnPackageIds?.includes(originalPurchaseContext.packageId)
  );
  if (!offer) return 0;
  return calculateUpsellEntriesForOffer(offer.id, promoMultiplier);
}
