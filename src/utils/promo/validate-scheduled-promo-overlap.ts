import ScheduledPromo from "@/models/ScheduledPromo";
import type { ScheduledPromoType } from "@/models/ScheduledPromo";

/**
 * Check if a date range overlaps any existing scheduled promo of the same type.
 * Used by create/update routes to disallow overlapping phases per type.
 *
 * @param type - Package type
 * @param startDate - Start of the new/updated range
 * @param endDate - End of the new/updated range
 * @param excludeId - Optional document ID to exclude (for updates)
 * @returns Existing overlapping document if found, null otherwise
 */
export async function validateScheduledPromoOverlap(
  type: ScheduledPromoType,
  startDate: Date,
  endDate: Date,
  excludeId?: string
): Promise<InstanceType<typeof ScheduledPromo> | null> {
  const query: Record<string, unknown> = {
    type,
    isActive: true,
    deletedAt: { $in: [null, undefined] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  };

  if (excludeId) {
    const mongoose = await import("mongoose");
    if (mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }
  }

  const existing = await ScheduledPromo.findOne(query).sort({ createdAt: -1 });
  return existing;
}
