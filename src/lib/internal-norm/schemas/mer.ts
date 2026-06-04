import { z } from "zod";

/**
 * Norm projection of the Marketing Efficiency Ratio (MER) table.
 * Draw-level aggregates only — no PII. Mirrors the MerDrawRow contract in
 * src/types/admin/mer.ts; the drawId (opaque Mongo id) is intentionally omitted.
 */

export const NormMerPlatformBreakdownSchema = z.object({
  /** convertingPlatform key: meta | tiktok | snapchat | klaviyo_email | klaviyo_sms | google | direct | other. */
  platform: z.string(),
  newRevenue: z.number(),
  /** Ad spend (dollars); null when spendStatus is "awaiting" or "owned". */
  adSpend: z.number().nullable(),
  /** amount = synced spend (Meta); awaiting = paid channel not yet synced (TikTok/Snapchat); owned = no ad spend by nature (Klaviyo/Direct). */
  spendStatus: z.enum(["amount", "awaiting", "owned"]),
  /** newRevenue ÷ adSpend; null when there is no spend denominator. */
  mer: z.number().nullable(),
});

export const NormMerDrawRowSchema = z.object({
  drawName: z.string(),
  /** Draw window in UTC ISO (AEST activationDate → drawDate). periodEnd may be future for the in-progress draw. */
  periodStart: z.string(),
  periodEnd: z.string(),
  inProgress: z.boolean(),
  /** Blended acquisition revenue across all platforms incl. direct (renewals excluded). */
  newRevenue: z.number(),
  /** Blended ad spend across all ad channels (Meta only today). */
  adSpend: z.number(),
  /** Blended New MER = newRevenue ÷ adSpend; null when there is no spend. */
  mer: z.number().nullable(),
  platforms: z.array(NormMerPlatformBreakdownSchema),
});

export const NormMerByDrawSchema = z.object({
  rows: z.array(NormMerDrawRowSchema),
});
