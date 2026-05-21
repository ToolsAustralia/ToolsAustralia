/**
 * Subscription Entries Calculator
 *
 * Handles subscription entry calculation for:
 * - Initial subscriptions (with promo multiplier)
 * - Renewals (without promo, accumulating)
 * - Upgrades (Mode A — stacks lastMonthAccumulated; Mode B — legacy, used when
 *   a membership grant already landed in the active major draw)
 * - Resubscriptions (with promo multiplier, continuing from last accumulated)
 *
 * Examples:
 * - Initial: baseEntries × promoMultiplier (e.g. 100 × 10 = 1000)
 * - Renewal: lastMonthAccumulated + baseEntries (e.g. 1000 + 100 = 1100)
 * - Upgrade Mode A: lastMonthAccumulated + (newBase × promo) (e.g. 1115 + 500 = 1615)
 * - Upgrade Mode B: newBase × promo (e.g. 500), accum += grant
 * - Resubscribe: lastMonthAccumulated + (baseEntries × promoMultiplier)
 */

export interface CalculateSubscriptionEntriesParams {
  billingReason: "subscription_create" | "subscription_cycle";
  baseEntries: number;
  lastMonthAccumulatedEntries?: number;
  isResubscribe: boolean;
  promoMultiplier?: number;
  isUpgrade: boolean;
  currentAccumulatedEntries?: number;
  /**
   * True when the user already received a membership-source entry grant
   * in the currently active major draw before this upgrade event.
   * When true, the upgrade falls back to the legacy formula (newBase × promo)
   * to avoid double-crediting the draw. When false (default), the upgrade
   * stacks the lastMonthAccumulatedEntries baseline into the grant.
   * Only consulted when isUpgrade === true.
   */
  hasMembershipGrantInCurrentDrawPeriod?: boolean;
}

export interface CalculateSubscriptionEntriesResult {
  entriesToGrant: number;
  newLastMonthAccumulatedEntries: number;
  calculationType: "initial" | "renewal" | "upgrade" | "resubscribe";
}

/**
 * Calculate initial subscription entries with promo multiplier
 *
 * @param baseEntries - Base entries per month for the package
 * @param promoMultiplier - Active promo multiplier (defaults to 1 if not provided)
 * @returns Calculation result with entries to grant and new accumulated value
 */
export function calculateInitialSubscriptionEntries(
  baseEntries: number,
  promoMultiplier: number = 1
): CalculateSubscriptionEntriesResult {
  // Validate inputs
  if (baseEntries < 0) {
    // console.warn(`Invalid baseEntries: ${baseEntries}, defaulting to 0`);
    baseEntries = 0;
  }

  if (promoMultiplier < 1) {
    // console.warn(`Invalid promoMultiplier: ${promoMultiplier}, defaulting to 1`);
    promoMultiplier = 1;
  }

  const entriesToGrant = baseEntries * promoMultiplier;
  const newLastMonthAccumulatedEntries = entriesToGrant;

  return {
    entriesToGrant,
    newLastMonthAccumulatedEntries,
    calculationType: "initial",
  };
}

/**
 * Calculate renewal entries (accumulating from previous month)
 *
 * @param baseEntries - Base entries per month for the package
 * @param lastMonthAccumulatedEntries - Accumulated entries from last renewal
 * @returns Calculation result with entries to grant and new accumulated value
 */
export function calculateRenewalEntries(
  baseEntries: number,
  lastMonthAccumulatedEntries?: number
): CalculateSubscriptionEntriesResult {
  // Validate baseEntries
  if (baseEntries < 0) {
    // console.warn(`Invalid baseEntries: ${baseEntries}, defaulting to 0`);
    baseEntries = 0;
  }

  // Fallback: If lastMonthAccumulatedEntries is missing, assume no promo was applied initially
  // This handles edge cases where data might be missing (e.g., legacy users, data migration issues)
  const lastAccumulated = lastMonthAccumulatedEntries ?? baseEntries;

  // Validate lastAccumulated
  if (lastAccumulated < 0) {
    // console.warn(`Invalid lastMonthAccumulatedEntries: ${lastAccumulated}, defaulting to baseEntries: ${baseEntries}`);
    const fallbackAccumulated = baseEntries;
    const entriesToGrant = fallbackAccumulated + baseEntries;
    return {
      entriesToGrant,
      newLastMonthAccumulatedEntries: entriesToGrant,
      calculationType: "renewal",
    };
  }

  const entriesToGrant = lastAccumulated + baseEntries;
  const newLastMonthAccumulatedEntries = entriesToGrant;

  return {
    entriesToGrant,
    newLastMonthAccumulatedEntries,
    calculationType: "renewal",
  };
}

/**
 * Calculate upgrade entries.
 *
 * Mode A — no prior membership grant in the active draw (common case):
 *   entriesToGrant          = lastMonthAccumulated + (newBase × promo)
 *   newLastMonthAccumulated = entriesToGrant
 *
 * Mode B — a membership grant already landed in the active draw (rare edge
 * case: renewal-then-upgrade within the same draw period). Falls back to the
 * legacy formula so we do not double-credit the draw:
 *   entriesToGrant          = newBase × promo
 *   newLastMonthAccumulated = lastMonthAccumulated + entriesToGrant
 *
 * @param newBaseEntries - Base entries per month for the new package
 * @param lastMonthAccumulatedEntries - User's last month accumulated entries
 * @param promoMultiplier - Active promo multiplier (defaults to 1)
 * @param hasMembershipGrantInCurrentDrawPeriod - True if a membership grant
 *   already landed in the active major draw before this upgrade fires
 * @returns Calculation result with entries to grant and new accumulated value
 */
export function calculateUpgradeEntries(
  newBaseEntries: number,
  lastMonthAccumulatedEntries: number = 0,
  promoMultiplier: number = 1,
  hasMembershipGrantInCurrentDrawPeriod: boolean = false
): CalculateSubscriptionEntriesResult {
  if (newBaseEntries < 0) {
    newBaseEntries = 0;
  }
  if (lastMonthAccumulatedEntries < 0) {
    lastMonthAccumulatedEntries = 0;
  }
  if (promoMultiplier < 1) {
    promoMultiplier = 1;
  }

  const promoEntries = newBaseEntries * promoMultiplier;

  if (hasMembershipGrantInCurrentDrawPeriod) {
    // Mode B — legacy formula
    const entriesToGrant = promoEntries;
    const newLastMonthAccumulatedEntries = lastMonthAccumulatedEntries + entriesToGrant;
    return {
      entriesToGrant,
      newLastMonthAccumulatedEntries,
      calculationType: "upgrade",
    };
  }

  // Mode A — stack
  const entriesToGrant = lastMonthAccumulatedEntries + promoEntries;
  const newLastMonthAccumulatedEntries = entriesToGrant;
  return {
    entriesToGrant,
    newLastMonthAccumulatedEntries,
    calculationType: "upgrade",
  };
}

/**
 * Calculate resubscribe entries (continuing from where they left off with promo)
 *
 * @param baseEntries - Base entries per month for the package
 * @param lastMonthAccumulatedEntries - Accumulated entries from before cancellation
 * @param promoMultiplier - Active promo multiplier (defaults to 1 if not provided)
 * @returns Calculation result with entries to grant and new accumulated value
 */
export function calculateResubscribeEntries(
  baseEntries: number,
  lastMonthAccumulatedEntries: number,
  promoMultiplier: number = 1
): CalculateSubscriptionEntriesResult {
  // Validate inputs
  if (baseEntries < 0) {
    // console.warn(`Invalid baseEntries: ${baseEntries}, defaulting to 0`);
    baseEntries = 0;
  }

  if (lastMonthAccumulatedEntries < 0) {
    // console.warn(
    //   `Invalid lastMonthAccumulatedEntries: ${lastMonthAccumulatedEntries}, defaulting to baseEntries: ${baseEntries}`
    // );
    lastMonthAccumulatedEntries = baseEntries;
  }

  if (promoMultiplier < 1) {
    // console.warn(`Invalid promoMultiplier: ${promoMultiplier}, defaulting to 1`);
    promoMultiplier = 1;
  }

  const promoEntries = baseEntries * promoMultiplier;

  // ✅ FIX: entriesToGrant should be ONLY the new promo entries (for processPaymentBenefits increment)
  // newLastMonthAccumulatedEntries should be the total (for next renewal calculation)
  // This ensures processPaymentBenefits adds only the new entries, not the preserved + new
  const entriesToGrant = promoEntries; // Only the new entries to add
  const newLastMonthAccumulatedEntries = lastMonthAccumulatedEntries + promoEntries; // Total for next renewal

  return {
    entriesToGrant, // New promo entries only (e.g., 400)
    newLastMonthAccumulatedEntries, // Total for next renewal (e.g., 150 + 400 = 550)
    calculationType: "resubscribe",
  };
}

/**
 * Main function to calculate subscription entries based on scenario
 *
 * This function determines the correct calculation method based on the provided parameters
 * and returns the appropriate result.
 *
 * @param params - Parameters for entry calculation
 * @returns Calculation result with entries to grant and new accumulated value
 */
export function calculateSubscriptionEntries(
  params: CalculateSubscriptionEntriesParams
): CalculateSubscriptionEntriesResult {
  const {
    billingReason,
    baseEntries,
    lastMonthAccumulatedEntries,
    isResubscribe,
    promoMultiplier = 1,
    isUpgrade,
    currentAccumulatedEntries: _currentAccumulatedEntries = 0,
  } = params;

  // Handle upgrade scenario (takes precedence)
  if (isUpgrade) {
    return calculateUpgradeEntries(
      baseEntries,
      lastMonthAccumulatedEntries ?? 0,
      promoMultiplier,
      params.hasMembershipGrantInCurrentDrawPeriod ?? false
    );
  }

  // Handle resubscribe scenario
  if (isResubscribe && lastMonthAccumulatedEntries !== undefined) {
    return calculateResubscribeEntries(baseEntries, lastMonthAccumulatedEntries, promoMultiplier);
  }

  // Handle initial subscription (subscription_create)
  if (billingReason === "subscription_create") {
    return calculateInitialSubscriptionEntries(baseEntries, promoMultiplier);
  }

  // Handle renewal (subscription_cycle)
  if (billingReason === "subscription_cycle") {
    return calculateRenewalEntries(baseEntries, lastMonthAccumulatedEntries);
  }

  // Fallback: Treat as initial subscription if billing reason is unknown
  // console.warn(
  //   `Unknown billing reason "${billingReason}" - defaulting to initial subscription calculation`
  // );
  return calculateInitialSubscriptionEntries(baseEntries, promoMultiplier);
}
