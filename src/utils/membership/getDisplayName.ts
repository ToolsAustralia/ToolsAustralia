import type { StaticMembershipPackage } from "@/data/membershipPackages";

/**
 * UI display name. Strips the "Additional " prefix used internally for member-only one-time packs.
 * Internal `name` and Stripe descriptions are unchanged.
 */
export function getPackageDisplayName(pkg: Pick<StaticMembershipPackage, "name">): string {
  return pkg.name.replace(/^Additional\s+/, "");
}
