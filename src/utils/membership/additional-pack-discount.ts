import { membershipPackages } from "@/data/membershipPackages";

export interface AdditionalPackDiscount {
  regularPrice: number;
  discountedPrice: number;
  percentOff: number;
}

/**
 * Additional (member) packs are priced at a fraction of the matching
 * non-member `{tier}-pack` with the same entries. Returns the comparison
 * anchor + computed percentage, or null when there is no genuine discount
 * (regular one-time packs, subscriptions, inactive packs, unresolved pairs).
 *
 * Accepts ids with the `-member` suffix added by useMemberships.
 */
export function getAdditionalPackDiscount(planId: string): AdditionalPackDiscount | null {
  const id = planId.toLowerCase().replace(/-member$/, "");
  const match = id.match(/^additional-([a-z]+)-pack$/);
  if (!match) return null;

  const tier = match[1];
  const additionalId = `additional-${tier}-pack`;
  const regularId = `${tier}-pack`;

  const additional = membershipPackages.find((p) => p._id === additionalId);
  const regular = membershipPackages.find((p) => p._id === regularId);

  if (!additional || !regular || !additional.isActive) return null;
  if (!(regular.price > additional.price)) return null;

  return {
    regularPrice: regular.price,
    discountedPrice: additional.price,
    percentOff: Math.round((1 - additional.price / regular.price) * 100),
  };
}
