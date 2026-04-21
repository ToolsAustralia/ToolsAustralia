import { getEffectivePromoType } from "@/utils/promo/get-effective-promo-type";

/**
 * Single place to decide which promo multiplier drives upsell hero art + entry math
 * when OriginalPurchaseContext does not include a stored multiplier.
 *
 * Uses the same channel as checkout: getEffectivePromoType (membership vs one-time vs mini).
 */
export function resolveUpsellPromoMultiplierForDisplay(params: {
  packageType: "membership" | "one-time" | "mini-draw";
  /** Canonical static package _id from purchase (e.g. additional-tradie-pack) */
  packageId: string | undefined;
  storedPromoMultiplier?: number | null;
  resolvedMembership: number | null;
  resolvedOneTime: number | null;
  resolvedMini: number | null;
  /** When true, subscription purchases fall back to current membership promo if metadata omitted */
  isMember: boolean;
}): number {
  const stored = params.storedPromoMultiplier;
  if (stored != null && stored > 1 && Number.isFinite(stored)) {
    return stored;
  }

  if (params.packageType === "membership") {
    return params.resolvedMembership ?? 1;
  }
  if (params.packageType === "mini-draw") {
    return params.resolvedMini ?? 1;
  }

  const pid = params.packageId?.trim();
  if (!pid) {
    return params.resolvedOneTime ?? 1;
  }

  const channel = getEffectivePromoType(pid, "one-time", params.isMember);
  if (channel === "membership-packages") {
    return params.resolvedMembership ?? 1;
  }
  return params.resolvedOneTime ?? 1;
}

/**
 * Prefer the purchase package id for upsell entry math; fall back to catalog trigger list.
 */
export function pickTriggeringPackageIdForUpsell(
  triggersOnPackageIds: string[] | undefined,
  contextPackageId: string | undefined
): string | undefined {
  if (contextPackageId) return contextPackageId;
  return triggersOnPackageIds?.[0];
}
