/**
 * Eligibility for the cancellation retention offer (100 free entries).
 * Must stay in sync with POST /api/cancellation-upsell/redeem.
 */

export function canOfferCancellationUpsellRedeem(user: {
  subscription?: { isActive?: boolean | null } | null;
  oneTimePackages?: Array<{ isActive?: boolean | null }> | null;
}): boolean {
  const hasActiveSubscription = user.subscription?.isActive === true;
  const hasActiveOneTime =
    user.oneTimePackages?.some((pkg) => pkg.isActive === true) ?? false;
  return hasActiveSubscription || hasActiveOneTime;
}
