/**
 * Shared types for SubscriptionManagementModal sub-components.
 *
 * These mirror shapes that lived inline in the original flat file
 * (1487 LOC). Lifting them into a dedicated module keeps the orchestrator
 * and the section components in lock-step on a single source of truth.
 */

export interface SubMgmtUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  subscription?: {
    packageId:
      | string
      | {
          _id: string;
          name: string;
          type: "subscription";
          price: number;
          description: string;
          features: string[];
          entriesPerMonth?: number;
          shopDiscountPercent?: number;
          partnerDiscountDays?: number;
          isActive: boolean;
        };
    isActive: boolean;
    startDate: string;
    endDate?: string;
    autoRenew: boolean;
    status?: string;
  };
  oneTimePackages?: Array<{
    packageId:
      | string
      | {
          _id: string;
          name: string;
          type: "one-time";
          price: number;
          description: string;
          features: string[];
          totalEntries?: number;
          shopDiscountPercent?: number;
          partnerDiscountDays?: number;
          isActive: boolean;
        };
    purchaseDate: string;
    startDate?: string | undefined;
    endDate?: string | undefined;
    isActive: boolean;
    entriesGranted?: number;
  }>;
  subscriptionPackageData?: {
    _id: string;
    name: string;
    type: "subscription" | "one-time";
    price: number;
    description: string;
    features: string[];
    entriesPerMonth?: number;
    shopDiscountPercent?: number;
    partnerDiscountDays?: number;
    isActive: boolean;
  };
  enrichedOneTimePackages?: Array<{
    packageId: string;
    isActive: boolean;
    purchaseDate: string;
    packageData: {
      _id: string;
      name: string;
      type: "subscription" | "one-time";
      price: number;
      description: string;
      features: string[];
      totalEntries?: number;
      shopDiscountPercent?: number;
      partnerDiscountDays?: number;
      isActive: boolean;
    };
  }>;
  cancellationUpsellRedeemed?: boolean;
  cancellationUpsellRedeemedAt?: Date;
}

export interface UpgradeOption {
  packageId: string;
  name: string;
  price: number;
  entriesPerMonth: number;
  shopDiscountPercent: number;
  partnerDiscountDays: number;
  description: string;
}

export type DowngradeOption = UpgradeOption;

export interface SubscriptionBenefits {
  currentBenefits: {
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
    packageName: string;
    packageId: string;
    isPendingChange: boolean;
    pendingChange?: {
      newPackageId: string;
      newPackageName: string;
      effectiveDate: string;
      changeType: "upgrade" | "downgrade";
    };
  } | null;
  availableUpgrades: UpgradeOption[];
  availableDowngrades: DowngradeOption[];
  pendingChangeMessage: string | null;
  hasActiveSubscription: boolean;
  subscriptionStatus: string;
  autoRenew: boolean;
  nextBillingDate?: string;
  isCancelled: boolean;
  endDate?: string;
  /**
   * Live, active Stripe subscription discount (e.g. the accepted retention
   * "50% off / 2 months" coupon). Read best-effort from Stripe on the
   * benefits endpoint; omitted entirely when there is no active discount or
   * the Stripe read failed. `endsAt` is only present when Stripe truly
   * provides/derives the discount end (ISO string).
   */
  discount?: {
    couponId: string;
    percentOff: number;
    endsAt?: string;
  };
}

/** Active subscription branch — narrowed shape used by the section components. */
export type ActiveSubscription = NonNullable<SubMgmtUser["subscription"]>;

/** The membership package object resolved by the orchestrator from various sources. */
export interface ResolvedMembershipPackage {
  _id?: string;
  name: string;
  type?: "subscription" | "one-time";
  price: number;
  description?: string;
  features?: unknown[];
  entriesPerMonth?: number;
  shopDiscountPercent?: number;
  partnerDiscountDays?: number;
  isActive?: boolean;
}
