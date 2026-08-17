import { getPackageById } from "@/data/membershipPackages";

/**
 * The member shop discount: Tradie 5%, Foreman 10%, Boss 20%.
 *
 * Subscription-only by design — every one-time and mini pack carries
 * `shopDiscountPercent: 0`, so holding a pack must not discount the shop.
 *
 * Deliberately reads `subscription.packageId` directly rather than going through
 * `getActivePackage`, which needs the enriched `subscriptionPackageData` the
 * my-account API assembles. A checkout route has the raw user document, and the
 * static catalog lookup is all this decision needs.
 */
export interface ShopDiscountUserInput {
  subscription?: {
    isActive?: boolean;
    packageId?: string | null;
  } | null;
}

/** Injectable for tests; defaults to the static catalog. */
export type PackageLookup = (id: string) => { shopDiscountPercent?: number } | undefined;

export function resolveShopDiscountPercent(
  user: ShopDiscountUserInput,
  lookup: PackageLookup = getPackageById
): number {
  const sub = user.subscription;
  // A lapsed, paused or cancelled subscription gets no discount. `isActive` is
  // the single flag the rest of the codebase gates member benefits on.
  if (!sub?.isActive || !sub.packageId) return 0;

  const pkg = lookup(sub.packageId);
  const percent = pkg?.shopDiscountPercent ?? 0;

  // Never trust a bad catalog value into the money math: a negative would
  // inflate the total, and >100 would invert it.
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(percent, 100);
}
