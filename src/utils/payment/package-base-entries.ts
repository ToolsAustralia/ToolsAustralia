import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";

/**
 * Pure, client-safe lookup of a package's base (pre-multiplier) entry count.
 *
 * Kept in its own file so client components can import this without dragging in
 * `UpsellMultiplierResolver` (which depends on Mongoose and must stay server-only).
 * See `upsell-entries-calculator.ts` for the async, multiplier-aware computation.
 */

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
