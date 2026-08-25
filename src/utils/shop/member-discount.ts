import { getPackageById, membershipPackages } from "@/data/membershipPackages";
import { centsToDollars, dollarsToCents, priceCart } from "@/utils/shop/pricing";

/**
 * The member shop discount: Tradie 10%, Foreman 15%, Boss 25%.
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

/**
 * The member price for one unit of a shop product, ready to render.
 *
 * `null` means say nothing — a free or unpriced item, or a catalog with no
 * discounting tier left in it. A "0% off" line is worse than silence.
 */
export interface MemberShopPrice {
  /** The tier percentage behind the figure. Always above 0. */
  percent: number;
  /** What that member pays for one unit, formatted — `"$47.96"`. */
  priceLabel: string;
  /** Whose discount this is: the shopper's own tier, or the best one on offer. */
  tierName: string;
  /** True when the figure is the signed-in shopper's OWN price, not an example. */
  isMember: boolean;
  /**
   * The package this discount comes from, so a surface can colour itself with
   * the tier's own palette (`getElectricPackageColorScheme`) instead of picking
   * a generic green that ties the saving to no tier in particular.
   */
  packageId: string;
  /** The undiscounted price, formatted, for a struck-through original. */
  fullPriceLabel: string;
  /** Whole dollars saved on one unit, formatted — `"$44.90"`. */
  savingLabel: string;
}

/**
 * The largest shop discount a membership currently carries.
 *
 * Read back out through `resolveShopDiscountPercent` rather than off the catalog
 * rows directly, so the percentage the shop advertises and the percentage the
 * till applies can never come from two different reads — the clamping included.
 *
 * Skips an inactive package: quoting a price off a tier nobody can subscribe to
 * advertises a saving the shopper has no way to obtain.
 */
function findBestShopDiscountTier(): { percent: number; tierName: string; packageId: string } | null {
  let best: { percent: number; tierName: string; packageId: string } | null = null;

  for (const pkg of membershipPackages) {
    if (!pkg.isActive) continue;
    const percent = resolveShopDiscountPercent({
      subscription: { isActive: true, packageId: pkg._id },
    });
    if (percent > 0 && (best === null || percent > best.percent)) {
      best = { percent, tierName: pkg.name, packageId: pkg._id };
    }
  }

  return best;
}

/**
 * The tier and percentage to advertise to THIS viewer, with no product in hand.
 *
 * `resolveMemberShopPrice` answers the same question but needs a price, so a
 * surface that only wants to say "Foreman · 10% off" had to invent one. Both read
 * the same catalogue through the same `resolveShopDiscountPercent`, so the pill in
 * a page header and the figure on a card can never name different tiers.
 *
 * Null when no active tier discounts the shop at all — never a 0% claim.
 */
export function resolveShopDiscountBadge(
  user: ShopDiscountUserInput | null | undefined
): { percent: number; tierName: string; isMember: boolean } | null {
  const ownPercent = user ? resolveShopDiscountPercent(user) : 0;
  if (ownPercent > 0) {
    const pkg = getPackageById(user?.subscription?.packageId ?? "");
    if (pkg) return { percent: ownPercent, tierName: pkg.name, isMember: true };
  }
  const best = findBestShopDiscountTier();
  return best ? { percent: best.percent, tierName: best.tierName, isMember: false } : null;
}

/**
 * What a member pays for this product — the shopper's own price when they hold a
 * tier, the best tier's price when they do not.
 *
 * Pure, so a listing card or a product page can state the figure with no
 * endpoint and no round trip. Both halves come from the functions checkout
 * itself runs: `resolveShopDiscountPercent` for the percentage, `priceCart` for
 * the money. A second copy of either is exactly how a shop ends up showing one
 * price and charging another.
 *
 * The figure is this line's own contribution. Checkout rounds the discount once
 * across the whole cart, so a mixed basket can land a cent either side of the
 * sum of these.
 */
export function resolveMemberShopPrice(
  priceDollars: number,
  user: ShopDiscountUserInput | null | undefined
): MemberShopPrice | null {
  // A giveaway row or a mispriced one has no member price worth stating.
  if (!Number.isFinite(priceDollars) || priceDollars <= 0) return null;

  let tier: { percent: number; tierName: string; isMember: boolean; packageId: string } | null = null;

  const ownPercent = user ? resolveShopDiscountPercent(user) : 0;
  if (ownPercent > 0) {
    const ownPackage = getPackageById(user?.subscription?.packageId ?? "");
    if (ownPackage)
      tier = {
        percent: ownPercent,
        tierName: ownPackage.name,
        isMember: true,
        packageId: ownPackage._id,
      };
  }

  if (!tier) {
    const best = findBestShopDiscountTier();
    if (best) tier = { ...best, isMember: false };
  }

  if (!tier) return null;

  const { subtotalCents, discountCents } = priceCart(
    [{ priceCents: dollarsToCents(priceDollars), quantity: 1 }],
    { shopDiscountPercent: tier.percent }
  );

  return {
    percent: tier.percent,
    priceLabel: `$${centsToDollars(subtotalCents - discountCents).toFixed(2)}`,
    tierName: tier.tierName,
    isMember: tier.isMember,
    packageId: tier.packageId,
    fullPriceLabel: `$${centsToDollars(subtotalCents).toFixed(2)}`,
    savingLabel: `$${centsToDollars(discountCents).toFixed(2)}`,
  };
}
