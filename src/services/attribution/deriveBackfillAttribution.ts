// src/services/attribution/deriveBackfillAttribution.ts
// Pure derivation for the historical backfill (spec §3.6 / D4). Maps an OLD
// PaymentEvent's available fields to a single-platform decision. Confidence is
// ALWAYS "inferred_backfill" — these rows predate click-ID capture, so they can
// never be click/utm_only (which the live resolver reserves).
import type { ConvertingPlatform } from "@/types/attribution";
import { normalizeUtmToPlatform } from "./normalizePlatform";
import { classifyIsRenewal } from "./classifyIsRenewal";

export interface BackfillSourceRow {
  utmSource?: string | null;
  utmMedium?: string | null;
  billingReason?: string | null;
  /** True when any indexed Meta-shaped ad-id (attributionAdId/AdsetId/CampaignId) is set. */
  hasMetaAdAttribution?: boolean;
}

export function deriveBackfillAttribution(row: BackfillSourceRow): {
  convertingPlatform: ConvertingPlatform;
  attributionConfidence: "inferred_backfill";
  isRenewal: boolean;
} {
  let platform = normalizeUtmToPlatform(row.utmSource, row.utmMedium);
  if (platform == null) {
    // No utm_source — Meta ad-ids are the only other historical signal.
    platform = row.hasMetaAdAttribution ? "meta" : "direct";
  }
  return {
    convertingPlatform: platform,
    attributionConfidence: "inferred_backfill",
    isRenewal: classifyIsRenewal({ billingReason: row.billingReason ?? undefined }),
  };
}
