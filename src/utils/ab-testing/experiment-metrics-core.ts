/**
 * Experiment metrics core — PURE, DB-free.
 *
 * Computes per-variant experiment metrics the way mature experimentation
 * platforms do (GrowthBook / Eppo / Statsig): the analysis unit is the USER,
 * the denominator is the set of EXPOSED users (from the assignment table), and
 * conversions / revenue are measured PER-USER within a conversion window after
 * first exposure. This replaces the old event-count reconstruction.
 *
 * Why this lives in utils as a pure function: it has zero DB or Date.now
 * dependencies, so every rule below (windowing, renewal separation, partial
 * refund netting, per-user capping, attribution-by-exposure) is unit-testable
 * with fixtures. `ExperimentMetricsService` is the thin DB wrapper that feeds
 * real rows into `computeExperimentMetrics`.
 *
 * Findings this design eliminates (see docs/superpowers/plans/2026-06-12-ab-affiliate-remediation.md):
 *   C1 (all-time truncation), C2 (event-count-as-converter + denominator),
 *   H1 (renewal leak — renewals are a SEPARATE line, never a conversion),
 *   H2 (attribution follows the user's ASSIGNED variant, not the payment's
 *   stamped variant), H3 (unique visitors come from assignments, no $max),
 *   M2 (partial-refund netting), M5 (one human = one exposed user).
 */

/** One row of the durable assignment (exposure) table. */
export interface AssignmentRow {
  variantId: string;
  /** Stringified User._id, or null for an unmerged anonymous assignment. */
  userId: string | null;
  /** anon_<uuid>, or null once merged to a user. */
  anonymousId: string | null;
  assignedAt: Date;
}

/** One durable PaymentEvent row (BenefitsGranted / RefundProcessed / RefundPartial). */
export interface PaymentRow {
  paymentIntentId: string;
  /** Stringified User._id (always present on PaymentEvent). */
  userId: string;
  /** experimentId/variantId stamped at purchase — may disagree with the
   *  user's true assigned variant; we prefer the assignment when we can. */
  variantId: string | null;
  eventType: "BenefitsGranted" | "RefundProcessed" | "RefundPartial" | string;
  /** data.price, in DOLLARS (BenefitsGranted only). */
  priceDollars: number | null;
  /** data.refundAmount, in CENTS (RefundPartial only). */
  refundAmountCents: number | null;
  /** Renewals (subscription_cycle) — excluded from conversion + first-purchase revenue. */
  isRenewal: boolean;
  timestamp: Date;
}

export type RevenueCap =
  | { type: "none" }
  /** Cap each user's first-purchase revenue at the p-th percentile of the
   *  CONVERTER distribution (pooled across variants). Robust to low conversion
   *  rates (a percentile over all exposed users would be 0 and zero everyone). */
  | { type: "percentile"; percentile: number }
  /** Cap each user's first-purchase revenue at an absolute dollar value. */
  | { type: "absolute"; dollars: number };

export interface ExperimentMetricsOptions {
  /** Days after first exposure within which a first purchase counts. */
  conversionWindowDays: number;
  /** Per-user winsorization for first-purchase revenue. Default p99 over converters. */
  revenueCap?: RevenueCap;
}

export interface VariantMetrics {
  variantId: string;
  /** Distinct exposed identities (users or unmerged anon), from assignments. */
  exposedUsers: number;
  /** Distinct users who made an attributed first purchase within the window. */
  converters: number;
  /** converters / exposedUsers, in [0,1]. */
  conversionRate: number;
  /** Sum of per-user, capped, net first-purchase revenue (dollars). */
  firstPurchaseRevenue: number;
  /** firstPurchaseRevenue / exposedUsers (dollars). */
  revenuePerUser: number;
  /** Downstream recurring (renewal) revenue attributed to the exposed variant —
   *  reported separately, NEVER folded into conversion or firstPurchaseRevenue. */
  recurringRevenue: number;
}

export interface ExperimentMetricsInput {
  /** All variant ids in the experiment (so zero-exposure variants still appear). */
  variantIds: string[];
  assignments: AssignmentRow[];
  payments: PaymentRow[];
  options: ExperimentMetricsOptions;
}

export interface ExperimentMetricsResult {
  variants: VariantMetrics[];
  windowDays: number;
  appliedCapDollars: number | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CAP: RevenueCap = { type: "percentile", percentile: 99 };

/** Linear-interpolation percentile of a numeric array. `p` is 0..100. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clampedP = Math.max(0, Math.min(100, p));
  const rank = (clampedP / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Canonical identity for de-duplicating exposed users. */
function identityOf(a: AssignmentRow): string | null {
  if (a.userId) return `u:${a.userId}`;
  if (a.anonymousId) return `a:${a.anonymousId}`;
  return null;
}

/**
 * Compute per-variant metrics from durable assignment + payment rows.
 * Pure: no DB, no clock — all time logic derives from row timestamps.
 */
export function computeExperimentMetrics(input: ExperimentMetricsInput): ExperimentMetricsResult {
  const { variantIds, assignments, payments, options } = input;
  const windowMs = options.conversionWindowDays * MS_PER_DAY;
  const cap = options.revenueCap ?? DEFAULT_CAP;
  const variantSet = new Set(variantIds);

  // ── Exposure (denominator) ────────────────────────────────────────────────
  const exposedByVariant = new Map<string, Set<string>>();
  // userId → earliest assignment (variant + assignedAt). Earliest is the canonical
  // exposure if split-brain rows exist (the Phase-4 unique index prevents new ones).
  const assignmentByUser = new Map<string, { variantId: string; assignedAt: Date }>();
  for (const v of variantIds) exposedByVariant.set(v, new Set());

  for (const a of assignments) {
    if (!variantSet.has(a.variantId)) continue;
    const id = identityOf(a);
    if (id) exposedByVariant.get(a.variantId)!.add(id);
    if (a.userId) {
      const prev = assignmentByUser.get(a.userId);
      if (!prev || a.assignedAt < prev.assignedAt) {
        assignmentByUser.set(a.userId, { variantId: a.variantId, assignedAt: a.assignedAt });
      }
    }
  }

  // ── Refund index ──────────────────────────────────────────────────────────
  const fullyRefundedPIs = new Set<string>();
  const partialRefundCentsByPI = new Map<string, number>();
  for (const p of payments) {
    if (p.eventType === "RefundProcessed") fullyRefundedPIs.add(p.paymentIntentId);
    else if (p.eventType === "RefundPartial") {
      partialRefundCentsByPI.set(
        p.paymentIntentId,
        (partialRefundCentsByPI.get(p.paymentIntentId) ?? 0) + (p.refundAmountCents ?? 0)
      );
    }
  }

  /** Net dollars for a BenefitsGranted row, after partial refunds; null if fully refunded. */
  function netDollars(p: PaymentRow): number | null {
    if (fullyRefundedPIs.has(p.paymentIntentId)) return null; // fully refunded → not a sale
    const gross = p.priceDollars ?? 0;
    const partial = (partialRefundCentsByPI.get(p.paymentIntentId) ?? 0) / 100;
    return Math.max(0, gross - partial);
  }

  /**
   * Resolve which variant a purchase belongs to, preferring the user's ASSIGNED
   * variant (authority) and enforcing the conversion window. Falls back to the
   * payment's stamped variant for unmerged-anon buyers (no assignment by userId).
   * Returns null when unattributable. `enforceWindow` is false for renewals.
   */
  function resolveVariant(p: PaymentRow, enforceWindow: boolean): string | null {
    const assigned = assignmentByUser.get(p.userId);
    if (assigned) {
      if (enforceWindow) {
        const end = new Date(assigned.assignedAt.getTime() + windowMs);
        if (p.timestamp < assigned.assignedAt || p.timestamp > end) return null;
      }
      return assigned.variantId;
    }
    if (p.variantId && variantSet.has(p.variantId)) return p.variantId; // unmerged-anon fallback
    return null;
  }

  // ── First-purchase conversions + revenue (per user) ───────────────────────
  const convertersByVariant = new Map<string, Set<string>>();
  const perUserRevenue = new Map<string, Map<string, number>>(); // variant → user → net $
  const recurringByVariant = new Map<string, number>();
  for (const v of variantIds) {
    convertersByVariant.set(v, new Set());
    perUserRevenue.set(v, new Map());
    recurringByVariant.set(v, 0);
  }

  for (const p of payments) {
    if (p.eventType !== "BenefitsGranted") continue;

    if (p.isRenewal) {
      // Recurring: attribute to the exposed variant, no window, no cap, no conversion.
      const v = resolveVariant(p, false);
      if (!v) continue;
      const net = netDollars(p);
      if (net === null) continue;
      recurringByVariant.set(v, (recurringByVariant.get(v) ?? 0) + net);
      continue;
    }

    // First purchase: must fall inside the conversion window.
    const v = resolveVariant(p, true);
    if (!v) continue;
    const net = netDollars(p);
    if (net === null) continue; // fully refunded → not a conversion
    convertersByVariant.get(v)!.add(p.userId);
    const userMap = perUserRevenue.get(v)!;
    userMap.set(p.userId, (userMap.get(p.userId) ?? 0) + net);
  }

  // ── Per-user capping (winsorization) over the pooled converter distribution ─
  const allConverterValues: number[] = [];
  for (const userMap of perUserRevenue.values()) {
    for (const val of userMap.values()) if (val > 0) allConverterValues.push(val);
  }
  let capDollars: number | null = null;
  if (cap.type === "percentile" && allConverterValues.length >= 2) {
    capDollars = percentile(allConverterValues, cap.percentile);
  } else if (cap.type === "absolute") {
    capDollars = cap.dollars;
  }
  const applyCap = (val: number) => (capDollars === null ? val : Math.min(val, capDollars));

  // ── Assemble ──────────────────────────────────────────────────────────────
  const variants: VariantMetrics[] = variantIds.map((v) => {
    const exposedUsers = exposedByVariant.get(v)!.size;
    const converters = convertersByVariant.get(v)!.size;
    let firstPurchaseRevenue = 0;
    for (const val of perUserRevenue.get(v)!.values()) firstPurchaseRevenue += applyCap(val);
    return {
      variantId: v,
      exposedUsers,
      converters,
      conversionRate: exposedUsers > 0 ? converters / exposedUsers : 0,
      firstPurchaseRevenue,
      revenuePerUser: exposedUsers > 0 ? firstPurchaseRevenue / exposedUsers : 0,
      recurringRevenue: recurringByVariant.get(v)!,
    };
  });

  return { variants, windowDays: options.conversionWindowDays, appliedCapDollars: capDollars };
}
