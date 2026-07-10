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

export interface RepeatPackageBreakdown {
  /** Grouping key (packageId, or packageName / "unknown" when the id is missing). */
  packageId: string;
  /** Display name (packageName, falling back to packageId / "Unknown"). */
  packageName: string;
  // ── "Started with this pack" (anchor-grouped: buyers whose FIRST one-time pack was this) ──
  /** Distinct buyers whose anchor (first) one-time purchase was this package — the rate denominator. */
  startedBuyers: number;
  /** Of those buyers, how many came back for a 2nd+ purchase. */
  startedReturned: number;
  /** startedReturned / startedBuyers, 0–1 (0 when no buyers). */
  startedRepeatRate: number;
  /** Of those buyers, how many later started a membership (see RepeatPurchaseUserRow.becameMember). */
  startedBecameMembers: number;
  /** startedBecameMembers / startedBuyers, 0–1 (0 when no buyers). */
  startedMemberRate: number;
  /** All one-time spend (dollars) from those buyers — first + repeat ("downstream"). */
  startedRevenue: number;
  // ── "All purchases" (per-purchase gross: this package, every time it was bought) ──
  /** Count of one-time purchase events of this package across the cohort. */
  purchases: number;
  /** Sum of price (dollars) of those purchases. */
  grossRevenue: number;
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
  /** Per one-time package: anchor-grouped rates/revenue + per-purchase gross. Sorted by startedBuyers desc. */
  packages: RepeatPackageBreakdown[];
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
