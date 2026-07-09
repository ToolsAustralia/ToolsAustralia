/** First→second purchase gap buckets, in display order. */
export const REPEAT_BUCKET_KEYS = [
  "same-day",
  "1-7d",
  "7-30d",
  "30-60d",
  "60-90d",
  "90-180d",
  "180d+",
] as const;
export type RepeatBucketKey = (typeof REPEAT_BUCKET_KEYS)[number];

/** Return-rate-by-window day thresholds. */
export const REPEAT_WINDOW_DAYS = [1, 7, 30, 60, 90, 180] as const;
export type RepeatWindowDays = (typeof REPEAT_WINDOW_DAYS)[number];

export interface RepeatBucketCount {
  bucket: RepeatBucketKey;
  users: number;
  /** Share of repeat buyers, 0–100 (0 when there are no repeat buyers). */
  sharePct: number;
  /** Repeat revenue (2nd-and-later purchases, dollars) from buyers in this bucket. Buckets sum to summary.repeatRevenue. */
  revenue: number;
}

export interface RepeatWindowRate {
  windowDays: RepeatWindowDays;
  eligible: number;
  returned: number;
  /** returned / eligible, 0–1 (0 when eligible is 0). */
  rate: number;
}

export interface RepeatPurchaseSummary {
  /** Distinct users with ≥1 countable one-time purchase in the cohort window. */
  oneTimeBuyers: number;
  /** Distinct users with ≥2 countable one-time purchases. */
  repeatBuyers: number;
  /** repeatBuyers / oneTimeBuyers, 0–1 (0 when no buyers). */
  repeatRate: number;
  /** Median daysToReturn across repeat buyers; null when there are none. */
  medianDaysToReturn: number | null;
  /** Sum of price (dollars) of 2nd-and-later countable purchases. */
  repeatRevenue: number;
  /** Repeat buyers whose becameMember flag is true. */
  becameMembers: number;
  /** Total countable one-time purchases (for context). */
  totalPurchases: number;
  buckets: RepeatBucketCount[];
  windows: RepeatWindowRate[];
}

export type RepeatSegment = "all" | "returned" | "not-returned";

/** Membership-conversion filter for the cohort list (see RepeatPurchaseUserRow.becameMember). */
export type RepeatMemberFilter = "all" | "member" | "non-member";

export interface RepeatPurchaseUserRow {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** ISO string of the anchor (first countable) purchase. */
  firstPurchaseAt: string;
  firstPackageId: string;
  firstPackageName?: string;
  /** ISO of the second countable purchase; absent when the user hasn't returned. */
  secondPurchaseAt?: string;
  secondPackageId?: string;
  secondPackageName?: string;
  /** ISO of the most-recent countable purchase (= first for single-purchase buyers). */
  lastPurchaseAt: string;
  lastPackageId: string;
  lastPackageName?: string;
  /** AEST calendar days anchor→second; absent when not returned. */
  daysToReturn?: number;
  bucket?: RepeatBucketKey;
  /** Countable one-time purchase count (all-time, refund-netted). */
  purchaseCount: number;
  /** Net one-time spend (dollars). */
  totalSpent: number;
  becameMember: boolean;
}

export interface RepeatPurchaseUsersResult {
  rows: RepeatPurchaseUserRow[];
  totalCount: number;
  page: number;
  limit: number;
}
