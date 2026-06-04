/**
 * Pure MER computation for one draw — DB-free so it is unit-testable via tsx.
 *
 * Takes the per-range `adChannels` (spend) + `attributedRevenue` (newRevenue)
 * already produced by readStatsForRange and folds them into a MerDrawRow.
 *
 * Two deliberate rules (both verified against the client's spec):
 *  1. Blended numerator = Σ newRevenue across ALL attributed platforms incl.
 *     direct/other — a *blended* MER, NOT the paid-channel-only ROAS the
 *     Advertising card computes. (Total Revenue − Updates ÷ Ad Spend.)
 *  2. Ratios are computed from summed totals, never averaged across days — the
 *     caller already summed spend and revenue over the draw window.
 */
import {
  ATTRIBUTED_PLATFORM_KEYS,
  type AttributedPlatformKey,
} from "@/models/DashboardStatsDailySnapshot";
import { PLATFORM_TO_AD_CHANNEL_KEY } from "../dashboard-stats/snapshotSchema";
import type { MerDrawRow, MerPlatformBreakdown } from "@/types/admin/mer";

const toFinite = (n: number | undefined | null): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

export interface ComputeDrawMerInput {
  draw: {
    drawId: string;
    drawName: string;
    periodStart: string;
    periodEnd: string;
    inProgress: boolean;
  };
  /** Ad-channel spend keyed by provider key ("facebook" = Meta). Other fields ignored. */
  adChannels: Record<string, { spend: number } & Record<string, unknown>>;
  /** Per-platform acquisition revenue keyed by convertingPlatform. Other fields ignored. */
  attributedRevenue: Record<AttributedPlatformKey, { newRevenue: number } & Record<string, unknown>>;
}

export function computeDrawMerRow(input: ComputeDrawMerInput): MerDrawRow {
  const { draw, adChannels, attributedRevenue } = input;

  // Blended New Revenue = Σ acquisition revenue across every attributed platform
  // (incl. direct/other). This is the client's "Total Revenue − Updates".
  let newRevenue = 0;
  for (const p of ATTRIBUTED_PLATFORM_KEYS) {
    newRevenue += toFinite(attributedRevenue?.[p]?.newRevenue);
  }

  // Blended Ad Spend = Σ spend across all ad channels (only "facebook" populated today).
  let adSpend = 0;
  for (const key of Object.keys(adChannels ?? {})) {
    adSpend += toFinite(adChannels[key]?.spend);
  }

  const mer = adSpend > 0 ? newRevenue / adSpend : null;

  const platforms: MerPlatformBreakdown[] = ATTRIBUTED_PLATFORM_KEYS.map((p) => {
    const rev = toFinite(attributedRevenue?.[p]?.newRevenue);
    const channelKey = PLATFORM_TO_AD_CHANNEL_KEY[p];

    // Owned (Klaviyo) or unattributed (Direct/Other/Google-no-spend) → no ad spend by nature.
    if (channelKey == null) {
      return { platform: p, newRevenue: rev, adSpend: null, spendStatus: "owned", mer: null };
    }

    const spend = adChannels?.[channelKey]?.spend;
    if (typeof spend === "number" && Number.isFinite(spend) && spend > 0) {
      return { platform: p, newRevenue: rev, adSpend: spend, spendStatus: "amount", mer: rev / spend };
    }

    // Paid channel whose spend isn't synced yet (TikTok/Snapchat today) → "awaiting".
    return { platform: p, newRevenue: rev, adSpend: null, spendStatus: "awaiting", mer: null };
  });

  return {
    drawId: draw.drawId,
    drawName: draw.drawName,
    periodStart: draw.periodStart,
    periodEnd: draw.periodEnd,
    inProgress: draw.inProgress,
    newRevenue,
    adSpend,
    mer,
    platforms,
  };
}
