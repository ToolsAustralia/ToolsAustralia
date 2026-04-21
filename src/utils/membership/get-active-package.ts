import type { StaticMembershipPackage } from "@/data/membershipPackages";

/** API / account payloads omit static `createdAt` / `updatedAt` on embedded package snapshots. */
export type ActivePackagePackageData = Omit<StaticMembershipPackage, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

export type ActivePackageSource = "subscription" | "one-time" | null;

export interface ActivePackage {
  source: ActivePackageSource;
  isActive: boolean;
  packageData: ActivePackagePackageData | null;
  entriesPerMonth: number;
  pointsPerMonth: number;
  expiresAt: Date | null;
}

/** Minimal user slice needed to resolve the active membership / pack (matches my-account API user). */
export interface ActivePackageUserInput {
  subscription?: {
    isActive?: boolean;
    endDate?: string | Date;
    packageId?: unknown;
  } | null;
  subscriptionPackageData?: ActivePackagePackageData | null;
  enrichedOneTimePackages?: Array<{
    isActive: boolean;
    packageData: ActivePackagePackageData;
    purchaseDate?: string;
  }>;
  oneTimePackages?: Array<{ isActive: boolean }>;
}

export function getActivePackage(user: ActivePackageUserInput): ActivePackage {
  const activeSubscription = user.subscription?.isActive ? user.subscription : null;
  const activeOneTimeLegacy = user.oneTimePackages?.some((p) => p.isActive);

  if (activeSubscription && user.subscriptionPackageData) {
    const pkg = user.subscriptionPackageData;
    const end = user.subscription?.endDate;
    return {
      source: "subscription",
      isActive: true,
      packageData: pkg,
      entriesPerMonth: pkg.entriesPerMonth ?? 0,
      pointsPerMonth: 0,
      expiresAt: end ? new Date(end) : null,
    };
  }

  const activeOneTimeData = user.enrichedOneTimePackages?.find((pkg) => pkg.isActive);
  if (activeOneTimeData?.packageData) {
    const pkg = activeOneTimeData.packageData;
    return {
      source: "one-time",
      isActive: true,
      packageData: pkg,
      entriesPerMonth: 0,
      pointsPerMonth: 0,
      expiresAt: null,
    };
  }

  if (activeOneTimeLegacy || activeSubscription) {
    return {
      source: activeSubscription ? "subscription" : "one-time",
      isActive: true,
      packageData: null,
      entriesPerMonth: 0,
      pointsPerMonth: 0,
      expiresAt: null,
    };
  }

  return {
    source: null,
    isActive: false,
    packageData: null,
    entriesPerMonth: 0,
    pointsPerMonth: 0,
    expiresAt: null,
  };
}
