/**
 * Subscription Type Definitions
 *
 * Type definitions for subscription-related data structures,
 * including accumulated entries tracking.
 */

export interface SubscriptionWithAccumulatedEntries {
  packageId: string;
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
  autoRenew?: boolean;
  status?: string;
  lastMonthAccumulatedEntries?: number;
  previousSubscription?: {
    packageId: string;
    packageName: string;
    benefits: {
      entriesPerMonth: number;
      discountPercentage: number;
    };
    startDate: Date;
    endDate: Date;
    downgradeDate: Date;
  };
  pendingChange?: {
    newPackageId: string;
    changeType: "upgrade";
    stripeSubscriptionId?: string;
    paymentIntentId?: string;
    upgradeAmount?: number;
  };
  lastDowngradeDate?: Date;
  lastUpgradeDate?: Date;
}


