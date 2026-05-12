export type RedeemableTierId = "tradie-subscription" | "foreman-subscription" | "boss-subscription";

export interface CampaignTargetingSegmentPersisted {
  states?: string[];
  membershipTiers?: RedeemableTierId[];
  topEntriesPercent?: number;
  requiresEmailVerified: boolean;
  minInactiveDays?: number;
  maxInactiveDays?: number;
}

export interface CampaignTargetingConfirmPayload {
  includeUserIds: string[];
  segmentConfig: CampaignTargetingSegmentPersisted;
}

export interface FilterUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  state?: string;
  subscription: {
    packageId: string;
    packageName: string | null;
    isActive: boolean;
    status: string;
  } | null;
  majorDrawEntries: number;
}

export interface PaginationState {
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
}

export type SubscriptionStatusValue = "active" | "inactive" | "any";

export const SUBSCRIPTION_STATUS_OPTIONS: { value: SubscriptionStatusValue; label: string }[] = [
  { value: "active", label: "Active subscription" },
  { value: "inactive", label: "Inactive / no subscription" },
  { value: "any", label: "Any (account active)" },
];

export const TIER_OPTIONS: { id: RedeemableTierId; label: string }[] = [
  { id: "tradie-subscription", label: "Tradie" },
  { id: "foreman-subscription", label: "Foreman" },
  { id: "boss-subscription", label: "Boss" },
];
