/**
 * Shared trend types for admin dashboard metrics
 */

export interface TrendData {
  /** Percentage change (e.g., 23 for +23%) */
  value: number;
  /** Direction for display (up = green, down = red, neutral = gray) */
  direction: "up" | "down" | "neutral";
  /** Optional: raw previous value for context */
  previousValue?: number;
}

export interface TrendConfig {
  /** true for metrics where "up" is bad (e.g., cancellations) */
  invertedPositive?: boolean;
  /** Below this %, show as neutral (default: 0.5) */
  neutralThreshold?: number;
}

export type TrendableMetric =
  | "revenue"
  | "signups"
  | "cancellations"
  | "conversionRate"
  | "adSpend"
  | "roas"
  | "membershipPurchase"
  | "membershipRenewal"
  | "oneTimePurchase"
  | "additionalOneTimePurchase"
  | "miniDraw"
  | "upsell";
