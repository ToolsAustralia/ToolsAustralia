/**
 * Formatting utilities for metrics display
 */

/**
 * Format currency value
 * @param amount - Amount in dollars
 * @param currency - Currency code (default: AUD)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage value
 * @param value - Percentage value (0-100)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format number with commas
 * @param value - Number to format
 * @returns Formatted number string
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-AU").format(value);
}

/**
 * Format ROAS value
 * @param roas - ROAS value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted ROAS string (e.g., "4.50x")
 */
export function formatROAS(roas: number, decimals: number = 2): string {
  return `${roas.toFixed(decimals)}x`;
}

/**
 * Format percentage change with sign
 * @param percentage - Percentage change value
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage change string (e.g., "+5.2%" or "-3.1%")
 */
export function formatPercentageChange(percentage: number, decimals: number = 1): string {
  const sign = percentage >= 0 ? "+" : "";
  return `${sign}${percentage.toFixed(decimals)}%`;
}

/** Compact AUD money for chart axes/totals, e.g. $4.22M, $214.8k, $820. */
export function fmtCompact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
}

