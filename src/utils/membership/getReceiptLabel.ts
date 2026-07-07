import type { StaticMembershipPackage } from "@/data/membershipPackages";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";

/**
 * Label suitable for receipts, order history, refund summaries — anywhere the same
 * display name may collide across SKUs and the user needs to tell purchases apart.
 *
 * - Mini-scoped Additional packs: appends "(Mini Draw)"
 * - Major-draw Additional packs (member-only): appends "(Member)"
 * - Regular packs: returns name unchanged
 *
 * For Stripe descriptions and admin views, use `pkg.name` directly — do NOT use this helper.
 */
export function getReceiptLabel(pkg: StaticMembershipPackage | MiniDrawPackage): string {
  // MiniDrawPackage path — has displayName when it's a mini-scoped Additional pack
  if ("displayName" in pkg && pkg.displayName) {
    return `${pkg.displayName} (Mini Draw)`;
  }
  if (!("type" in pkg)) {
    // Vanilla MiniDrawPackage (Mini Pack 1–3 etc.) — show its name as-is
    return (pkg as MiniDrawPackage).name;
  }
  // StaticMembershipPackage path — strip "Additional " and append "(Member)" when member-only
  const mp = pkg as StaticMembershipPackage;
  if (mp.isAdditional === true && mp.name.startsWith("Additional ")) {
    return `${mp.name.replace(/^Additional\s+/, "")} (Member)`;
  }
  return mp.name;
}

/**
 * Convenience wrapper for an order line that only has a packageId (resolves via
 * the static data and falls back to a sensible label if not found).
 */
export function getReceiptLabelByPackageId(
  packageId: string,
  resolvers: {
    membership?: (id: string) => StaticMembershipPackage | undefined;
    mini?: (id: string) => MiniDrawPackage | undefined;
  }
): string {
  const mini = resolvers.mini?.(packageId);
  if (mini) return getReceiptLabel(mini);
  const membership = resolvers.membership?.(packageId);
  if (membership) return getReceiptLabel(membership);
  return packageId; // fallback to id if no resolver matched
}
