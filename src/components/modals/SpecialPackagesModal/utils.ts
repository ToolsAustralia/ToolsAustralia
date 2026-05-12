/**
 * Shared color helpers used by SpecialPackagesModal sub-components.
 * Extracted verbatim from the original flat-file modal.
 */

export const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const darkenHex = (hex: string, amount: number) => {
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp(parseInt(hex.slice(1, 3), 16) - amount);
  const g = clamp(parseInt(hex.slice(3, 5), 16) - amount);
  const b = clamp(parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

/** Align with MembershipSection: hide/list uses canonical `_id` or `*-member` plan ids from variant config. */
export function isPackageHiddenByVariant(packageId: string, hidePackages: string[] | undefined): boolean {
  if (!hidePackages?.length) return false;
  if (hidePackages.includes(packageId)) return true;
  if (hidePackages.includes(`${packageId}-member`)) return true;
  return false;
}

export function variantDisplayOrderRank(packageId: string, displayOrder: string[] | undefined): number {
  if (!displayOrder?.length) return Number.POSITIVE_INFINITY;
  const orderMap = new Map(displayOrder.map((id, index) => [id, index]));
  const direct = orderMap.get(packageId);
  const memberSuffixed = orderMap.get(`${packageId}-member`);
  return Math.min(direct ?? Number.POSITIVE_INFINITY, memberSuffixed ?? Number.POSITIVE_INFINITY);
}
