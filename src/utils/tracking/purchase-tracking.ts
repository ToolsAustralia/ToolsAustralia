/**
 * Purchase Tracking Utilities
 * Tracks recent purchases in sessionStorage to avoid modal conflicts
 */

/**
 * Mark that a purchase has been completed.
 * Prevents special packages modal from popping immediately after a purchase.
 */
export const markPurchaseCompleted = (): void => {
  if (typeof window === "undefined") return;

  const timestamp = Date.now().toString();
  try {
    sessionStorage.setItem("recentPurchaseTimestamp", timestamp);
  } catch {
    // Ignore storage errors (e.g., private mode)
  }

  console.log("🛒 Purchase completed - marked timestamp:", timestamp);
};

/**
 * Check if a purchase was completed recently.
 * @param maxAgeMs Maximum age in milliseconds (default: 15 seconds)
 * @returns true if purchase was completed within the time window
 */
export const hasRecentPurchase = (maxAgeMs: number = 15000): boolean => {
  if (typeof window === "undefined") return false;

  try {
    const purchaseTimestamp = sessionStorage.getItem("recentPurchaseTimestamp");
    if (!purchaseTimestamp) return false;

    const purchaseTime = Number(purchaseTimestamp);
    if (Number.isNaN(purchaseTime)) {
      sessionStorage.removeItem("recentPurchaseTimestamp");
      return false;
    }

    const timeSincePurchase = Date.now() - purchaseTime;
    const isRecent = timeSincePurchase < maxAgeMs;

    console.log("🔍 Recent purchase check:", {
      purchaseTimestamp,
      currentTime: Date.now(),
      timeSincePurchase,
      isRecent,
    });

    if (!isRecent) {
      sessionStorage.removeItem("recentPurchaseTimestamp");
    }

    return isRecent;
  } catch {
    // If storage is unavailable, assume no recent purchase
    return false;
  }
};
