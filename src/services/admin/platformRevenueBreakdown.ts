// src/services/admin/platformRevenueBreakdown.ts
// Per-platform acquisition-revenue breakdown by source category + the matching
// per-user buyer list. Powers the Advertising card's hover popover + click modal,
// and the Norm `dashboard.revenue-details.by-platform` tool.
//
// Honors the Advertising Analytics Suite invariants (master spec §3.1):
//  - platform basis = convertingPlatform (null/missing folded into "direct")
//  - renewals excluded via data.billingReason === "subscription_cycle" (NOT isRenewal)
//  - whole-row refund netting via fetchNetBenefitsGrantedWithMatch (added Task 2)

import { fetchNetBenefitsGrantedWithMatch } from "@/utils/payment/payment-event-net-queries";
import { hydrateRevenueUserRows } from "@/services/admin/dashboardSlices";
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
import type { RevenueDetailsUserRow } from "@/services/admin/dashboardSlices";

/** Lean projection of a net BenefitsGranted event used by the classifier/bucketer. */
export type LeanRevenueEvent = {
  _id?: string;
  userId?: unknown;
  packageType?: string;
  packageId?: string;
  packageName?: string;
  data?: { price?: number; billingReason?: string; [k: string]: unknown };
  timestamp?: Date;
};

/** The 5 acquisition source categories (renewals are excluded entirely). */
export type AcquisitionCategory =
  | "membership-purchase"
  | "one-time-purchase"
  | "additional-one-time"
  | "mini-draw"
  | "upsell";

export const ACQUISITION_CATEGORIES: AcquisitionCategory[] = [
  "membership-purchase",
  "one-time-purchase",
  "additional-one-time",
  "mini-draw",
  "upsell",
];

/**
 * Classify one net BenefitsGranted event into an acquisition category, or null to
 * exclude it (membership renewal, or an unknown package type). This MIRRORS the
 * snapshot bucketer `classifyRevenueBucket` (dashboard-stats/snapshotSchema.ts) — NOT
 * getRevenueDetails (whose one-time matcher is narrower) — because the Advertising
 * card's per-platform revenue comes from the daily snapshot. Keeping these two
 * classifiers in lockstep is what makes the drill-down bars sum to the card's row
 * total (the test asserts that agreement). Reconciliation also relies on
 * PaymentEvent.packageType being enum-constrained, so any new packageType must be
 * added here AND in classifyRevenueBucket together.
 */
export function classifyAcquisitionCategory(event: LeanRevenueEvent): AcquisitionCategory | null {
  const pt = event.packageType;
  if (pt === "membership") {
    return event.data?.billingReason === "subscription_cycle" ? null : "membership-purchase";
  }
  if (pt === "mini-draw") return "mini-draw";
  if (pt === "upsell") return "upsell";
  if (pt === "one-time") {
    return (event.packageId ?? "").startsWith("additional-") ? "additional-one-time" : "one-time-purchase";
  }
  return null;
}

export interface PlatformByCategoryEntry {
  category: AcquisitionCategory;
  revenue: number;
  purchaseCount: number;
  userCount: number;
}

/** Zero-filled 5-bucket summary over a set of events (pure; the bars' source of truth). */
export function buildByCategory(events: LeanRevenueEvent[]): PlatformByCategoryEntry[] {
  const acc = new Map<AcquisitionCategory, { revenue: number; purchaseCount: number; users: Set<string> }>();
  for (const c of ACQUISITION_CATEGORIES) acc.set(c, { revenue: 0, purchaseCount: 0, users: new Set() });
  for (const e of events) {
    const cat = classifyAcquisitionCategory(e);
    if (!cat) continue;
    const bucket = acc.get(cat)!;
    bucket.revenue += e.data?.price || 0;
    bucket.purchaseCount += 1;
    const uid = e.userId?.toString();
    if (uid) bucket.users.add(uid);
  }
  return ACQUISITION_CATEGORIES.map((category) => {
    const b = acc.get(category)!;
    return { category, revenue: b.revenue, purchaseCount: b.purchaseCount, userCount: b.users.size };
  });
}

export interface PlatformRevenueBreakdownInput {
  platform: AttributedPlatformKey;
  startDate: Date;
  endDate: Date;
  category?: AcquisitionCategory; // omitted → list spans all 5
  page: number;
  limit: number;
  summaryOnly?: boolean; // hover path: skip the buyer-list hydration
}

export interface PlatformRevenueBreakdownData {
  platform: AttributedPlatformKey;
  byCategory: PlatformByCategoryEntry[]; // always full (all 5) — powers bars + header total
  totalRevenue: number; // list-scoped (respects category filter); == platform total when no filter
  totalPurchases: number;
  totalUsers: number;
  users: RevenueDetailsUserRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/** convertingPlatform clause; null/missing folds into "direct" (master-spec invariant #1). */
function platformMatchClause(platform: AttributedPlatformKey): Record<string, unknown> {
  if (platform === "direct") return { convertingPlatform: { $in: ["direct", null] } };
  return { convertingPlatform: platform };
}

export async function getPlatformRevenueBreakdown(
  input: PlatformRevenueBreakdownInput,
): Promise<PlatformRevenueBreakdownData> {
  const { platform, startDate, endDate, category, page, limit, summaryOnly } = input;

  const match: Record<string, unknown> = {
    timestamp: { $gte: startDate, $lte: endDate },
    ...platformMatchClause(platform),
    // Acquisition only: any non-membership acquisition type, OR a non-renewal membership.
    $or: [
      { packageType: { $in: ["one-time", "mini-draw", "upsell"] } },
      { packageType: "membership", "data.billingReason": { $ne: "subscription_cycle" } },
    ],
  };

  const events = (await fetchNetBenefitsGrantedWithMatch(match, {
    userId: 1,
    packageType: 1,
    packageId: 1,
    packageName: 1,
    data: 1,
    timestamp: 1,
    _id: 1,
  })) as LeanRevenueEvent[];

  const byCategory = buildByCategory(events);

  if (summaryOnly) {
    return {
      platform,
      byCategory,
      totalRevenue: byCategory.reduce((s, b) => s + b.revenue, 0),
      totalPurchases: byCategory.reduce((s, b) => s + b.purchaseCount, 0),
      totalUsers: 0,
      users: [],
      pagination: { currentPage: 1, totalPages: 0, totalCount: 0, limit, hasNextPage: false, hasPrevPage: false },
    };
  }

  // List scope: filter to the selected category (or all valid acquisition), newest first.
  const listEvents = events
    .filter((e) => {
      const cat = classifyAcquisitionCategory(e);
      return cat !== null && (category ? cat === category : true);
    })
    .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime());

  const { users, totalUsers, totalPurchases, totalRevenue, pagination } = await hydrateRevenueUserRows(
    listEvents,
    page,
    limit,
  );

  return { platform, byCategory, totalRevenue, totalPurchases, totalUsers, users, pagination };
}
