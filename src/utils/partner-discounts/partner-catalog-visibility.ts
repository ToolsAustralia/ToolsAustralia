import type { IUser } from "@/models/User";
import type { UserData } from "@/hooks/queries/useUserQueries";
import { getPackageById } from "@/data/membershipPackages";
import { getUpsellPackageById } from "@/data/upsellPackages";
import { derivePlanIdFromPackage } from "@/utils/package-colors/packageColorScheme";

type QueueItem = {
  packageId: string;
  packageType: string;
  status: string;
  endDate?: Date | string;
  purchaseDate?: Date | string;
};

type UserWithPartnerCatalogContext = (Partial<UserData> | Partial<IUser>) & {
  subscription?: { isActive?: boolean };
  subscriptionPackageData?: UserData["subscriptionPackageData"];
  enrichedOneTimePackages?: UserData["enrichedOneTimePackages"];
  partnerDiscountQueue?: QueueItem[];
};

/**
 * Partner catalog access percent for a package/plan id (subscriptions, one-time, plus upsells).
 * Subscriptions: Tradie 50%, Foreman 75%, Boss 100%.
 * One-time ladder (6 tiers): VIP 100%, Power 85%, Boss 70%, Foreman 55%, Tradie 40%, Apprentice 25%.
 * Subscription-plus upsells align with base subscription tiers.
 */
export function getPartnerCatalogAccessPercentForPlanId(planId: string): number {
  const l = planId.toLowerCase();

  if (l.includes("plus-package") || l.endsWith("-plus-pack")) {
    if (l.includes("foreman")) return 75;
    if (l.includes("boss")) return 100;
    if (l.includes("tradie")) return 50;
  }

  if (l.includes("subscription")) {
    if (l.includes("foreman")) return 75;
    if (l.includes("boss")) return 100;
    if (l.includes("tradie")) return 50;
    return 100;
  }

  if (l.includes("vip")) return 100;
  if (l.includes("power")) return 85;
  if (l.includes("boss")) return 70;
  if (l.includes("foreman")) return 55;
  if (l.includes("tradie")) return 40;
  if (l.includes("apprentice")) return 25;

  // Mini draw: 8 packs map to 6 partner tiers (same % as one-time ladder). Tier 1 = best → mini-pack-8, tier 2 → mini-pack-7.
  const miniMatch = l.match(/mini-pack-(\d+)/);
  if (miniMatch) {
    const n = parseInt(miniMatch[1], 10);
    if (n === 8) return 100; // Tier 1
    if (n === 7) return 85; // Tier 2
    if (n === 6) return 70; // Tier 3
    if (n === 5) return 55; // Tier 4
    if (n === 3 || n === 4) return 40; // Tier 5 (two price points)
    return 25; // Tier 6 — mini-pack-1 & 2
  }

  return 100;
}

/**
 * Partner catalog access % for membership package ids used in subscription UI.
 * Prefer resolving via {@link getPackageById} + {@link derivePlanIdFromPackage} so slug ids
 * and DB-shaped ids both map to the same tier rules as {@link getPartnerCatalogAccessPercentForPlanId}.
 */
export function getPartnerCatalogAccessPercentForMembershipPackageId(packageId: string): number {
  const pkg = getPackageById(packageId);
  if (pkg) {
    const planId = derivePlanIdFromPackage(pkg, pkg.type === "subscription" ? "subscription" : "one-time");
    return getPartnerCatalogAccessPercentForPlanId(planId);
  }
  return getPartnerCatalogAccessPercentForPlanId(packageId);
}

function partnerCatalogSummaryFromPercent(pct: number): string {
  return `${pct}% of partner offers`;
}

/**
 * Visible partner-offer count (deterministic: first k in catalog order).
 * Foreman subscription uses round(75% N); other fractional tiers use ceil.
 */
export function getPartnerCatalogVisibleSliceLength(totalPartners: number, planId: string | null): number {
  if (totalPartners <= 0) return 0;
  if (!planId) return totalPartners;

  const pct = getPartnerCatalogAccessPercentForPlanId(planId);
  if (pct >= 100) return totalPartners;

  const l = planId.toLowerCase();
  if (pct === 75 && l.includes("foreman") && l.includes("subscription")) {
    return Math.round(totalPartners * 0.75);
  }
  return Math.ceil(totalPartners * (pct / 100));
}

/**
 * Same precedence as partner discount queue: higher catalog tier % wins between membership and one-time;
 * ties favor membership. Otherwise active one-time from queue + enriched one-time packages.
 */
export function resolvePartnerCatalogPlanId(user: UserWithPartnerCatalogContext | null | undefined): string | null {
  if (!user) return null;

  const queue = user.partnerDiscountQueue ?? [];
  const now = new Date();

  const hasSub = Boolean(user.subscription?.isActive && user.subscriptionPackageData);
  const subPct = hasSub
    ? getPartnerCatalogAccessPercentForPlanId(
        derivePlanIdFromPackage(user.subscriptionPackageData!, "subscription")
      )
    : -1;

  const competing = queue.filter((i) => {
    if (!["one-time", "mini-draw", "upsell"].includes(i.packageType)) return false;
    if (i.status === "expired" || i.status === "cancelled") return false;
    if (i.status === "queued") return true;
    if (i.status === "active") {
      const end = i.endDate ? new Date(i.endDate) : null;
      return Boolean(end && end > now);
    }
    return false;
  });

  let best: QueueItem | null = null;
  let bestTier = -1;
  for (const i of competing) {
    const t = getPartnerCatalogAccessPercentForPlanId(i.packageId);
    if (t > bestTier) {
      bestTier = t;
      best = i;
    } else if (t === bestTier && best) {
      const iPd = i.purchaseDate ? new Date(i.purchaseDate).getTime() : 0;
      const bPd = best.purchaseDate ? new Date(best.purchaseDate).getTime() : 0;
      if (iPd < bPd) best = i;
    }
  }

  if (hasSub && best && bestTier > subPct) {
    const enriched = user.enrichedOneTimePackages;
    const fromEnriched = enriched
      ?.filter((p) => p.isActive && p.packageData && String(p.packageId) === String(best!.packageId))
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
    if (fromEnriched?.packageData) {
      return derivePlanIdFromPackage(fromEnriched.packageData, "one-time");
    }
    const staticPkg = getPackageById(best.packageId);
    if (staticPkg) {
      return derivePlanIdFromPackage(staticPkg, "one-time");
    }
    return best.packageId;
  }

  if (hasSub && user.subscriptionPackageData) {
    return derivePlanIdFromPackage(user.subscriptionPackageData, "subscription");
  }

  const enriched = user.enrichedOneTimePackages;
  if (enriched?.length) {
    const activeIds = new Set(
      queue
        .filter((i) => i.status === "active" && ["one-time", "mini-draw", "upsell"].includes(i.packageType))
        .map((i) => String(i.packageId))
    );
    const pkg = enriched
      .filter((p) => p.isActive && p.packageData && activeIds.has(String(p.packageId)))
      .sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime())[0];
    if (pkg?.packageData) {
      return derivePlanIdFromPackage(pkg.packageData, "one-time");
    }
  }

  return null;
}

/**
 * Klaviyo / UI: short summary for transactional copy.
 */
export function getPartnerDiscountCatalogSummaryForPackageId(packageId: string): string {
  return partnerCatalogSummaryFromPercent(getPartnerCatalogAccessPercentForPlanId(packageId));
}

/**
 * Single benefit line for post-purchase success UI when the package includes partner discount access.
 */
export function getPartnerDiscountBenefitTextForPackageId(packageId: string | undefined): string | null {
  if (!packageId?.trim()) return null;

  const l = packageId.toLowerCase();
  if (l.includes("mini-draw") && !l.includes("mini-pack")) {
    return null;
  }

  const staticPkg = getPackageById(packageId);
  const upsellPkg = getUpsellPackageById(packageId);

  if (staticPkg) {
    const grantsPartner =
      staticPkg.type === "subscription" || (staticPkg.partnerDiscountDays ?? 0) > 0;
    if (!grantsPartner) return null;
  } else if (upsellPkg) {
    const days = upsellPkg.partnerDiscountDays ?? 0;
    const hours = "partnerDiscountHours" in upsellPkg ? Number((upsellPkg as { partnerDiscountHours?: number }).partnerDiscountHours ?? 0) : 0;
    if (days <= 0 && hours <= 0) return null;
  } else if (!/mini-pack-\d+/i.test(packageId)) {
    return null;
  }

  const pct = getPartnerCatalogAccessPercentForPlanId(packageId);
  return `${pct}% access to partner discount offers`;
}
