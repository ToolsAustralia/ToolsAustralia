/**
 * Shared contract for the admin Marketing Efficiency Ratio (MER) table.
 *
 * MER = New Revenue ÷ Ad Spend, per major draw. "New Revenue" is acquisition
 * revenue only — subscription renewals ("Updates" in the client's wording) are
 * excluded upstream (see revenueAggregator / attributedRevenue.newRevenue). The
 * blended numerator is ALL acquisition revenue (every platform incl. direct /
 * organic), which is what makes it a *blended* MER rather than a per-platform ROAS.
 *
 * Lives in src/types so the server service and the client hook share one shape
 * without the hook importing a Mongoose-backed service module.
 */
import type { AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";

export type { AttributedPlatformKey };

/** Ad platforms offered in the top-level platform toggle (channels with — or destined for — ad spend). */
export type MerAdPlatform = "meta" | "tiktok" | "snapchat";

/**
 * Spend availability for one platform in one draw:
 * - `amount`   — paid channel with synced ad spend (Meta today).
 * - `awaiting` — paid channel whose spend sync isn't live yet (TikTok/Snapchat).
 * - `owned`    — no ad spend by nature (Klaviyo) or unattributed (Direct).
 */
export type MerSpendStatus = "amount" | "awaiting" | "owned";

export interface MerPlatformBreakdown {
  platform: AttributedPlatformKey;
  /** Acquisition revenue attributed to this platform (dollars, renewals excluded). */
  newRevenue: number;
  /** Ad spend in dollars; null when `spendStatus` is `awaiting` or `owned`. */
  adSpend: number | null;
  spendStatus: MerSpendStatus;
  /** newRevenue ÷ adSpend; null when there is no spend denominator. */
  mer: number | null;
}

export interface MerDrawRow {
  drawId: string;
  drawName: string;
  /** Draw window in UTC ISO (AEST activationDate → drawDate). periodEnd may be in the future for the in-progress draw. */
  periodStart: string;
  periodEnd: string;
  /** True for the active/frozen (current) draw — its window is still accumulating. */
  inProgress: boolean;
  /** Blended acquisition revenue across ALL platforms incl. direct (renewals excluded). */
  newRevenue: number;
  /** Blended ad spend across all ad channels (Meta only today). */
  adSpend: number;
  /** Blended New MER = newRevenue ÷ adSpend; null when there is no spend. */
  mer: number | null;
  /** Per-platform split — powers the toggle columns and the click-to-expand breakdown. */
  platforms: MerPlatformBreakdown[];
}

export interface MerByDrawResponse {
  success: boolean;
  rows: MerDrawRow[];
  error?: string;
}
