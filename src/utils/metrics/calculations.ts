/**
 * Pure calculation functions for metrics
 * 
 * These functions are pure (no side effects) and easy to test.
 */

/**
 * Calculate ROAS (Return on Ad Spend)
 * @param revenue - Total revenue
 * @param adSpend - Total ad spend
 * @returns ROAS value (revenue / adSpend, or 0 if adSpend is 0)
 */
export function calculateROAS(revenue: number, adSpend: number): number {
  if (adSpend === 0) {
    return 0;
  }
  return revenue / adSpend;
}

/**
 * Calculate profit (Revenue - Ad Spend)
 * @param revenue - Total revenue
 * @param adSpend - Total ad spend
 * @returns Profit value
 */
export function calculateProfit(revenue: number, adSpend: number): number {
  return revenue - adSpend;
}

/**
 * Calculate CTR (Click-Through Rate) as percentage
 * @param clicks - Number of clicks
 * @param impressions - Number of impressions
 * @returns CTR percentage (0-100)
 */
export function calculateCTR(clicks: number, impressions: number): number {
  if (impressions === 0) {
    return 0;
  }
  return (clicks / impressions) * 100;
}

/**
 * Calculate CPC (Cost Per Click)
 * @param adSpend - Total ad spend
 * @param clicks - Number of clicks
 * @returns CPC value, or 0 if clicks is 0
 */
export function calculateCPC(adSpend: number, clicks: number): number {
  if (clicks === 0) {
    return 0;
  }
  return adSpend / clicks;
}

/**
 * Calculate percentage change between two values
 * @param current - Current value
 * @param previous - Previous value
 * @returns Percentage change (can be negative)
 */
export function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * Determine trend direction based on comparison
 * @param current - Current value
 * @param previous - Previous value
 * @returns "up", "down", or "neutral"
 */
export function getTrendDirection(current: number, previous: number): "up" | "down" | "neutral" {
  if (current > previous) {
    return "up";
  }
  if (current < previous) {
    return "down";
  }
  return "neutral";
}

