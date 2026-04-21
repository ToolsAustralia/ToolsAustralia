/**
 * Server-Side Promo Queries
 *
 * Cached server-side functions for fetching promo data.
 * These functions use createCachedQuery to prevent duplicate queries
 * between generateMetadata and page components in the same request.
 *
 * Resolution order for display: Scheduled > Toggle Promo > Alternating > null.
 * Use getEffectivePromosForDisplay() when scheduled/toggle/alternating should all be considered.
 */

import { createCachedQuery } from "./server-queries";
import connectDB from "@/lib/mongodb";
import Promo, { IPromo } from "@/models/Promo";
import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";
import type { PromoMultiplier } from "@/types/promo-multiplier";

/**
 * Interface for promo data returned from server queries
 * Matches the format used by the API routes
 */
export interface ServerPromo {
  id: string;
  type: "membership-packages" | "one-time-packages" | "mini-packages";
  multiplier: PromoMultiplier;
  startDate: Date;
  endDate: Date;
  duration: number;
  isActive: boolean;
  timeRemaining: number;
  isExpired: boolean;
}

/**
 * Fetch all active promos from the database
 * Uses cached query to prevent duplicate fetches in the same request
 *
 * @returns Array of active promo objects
 */
export const getActivePromos = createCachedQuery(async (): Promise<ServerPromo[]> => {
  await connectDB();

  // Get all active promos (updated for toggle system - ignores dates)
  const activePromos = await Promo.find({
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .lean();

  // Map promos to response format (matching API route format)
  // Type assertion: lean() returns FlattenMaps which has _id as unknown
  return activePromos.map((promo) => {
    const typedPromo = promo as unknown as IPromo & { _id: { toString: () => string } };
    return {
      id: typedPromo._id.toString(),
      type: typedPromo.type,
      multiplier: typedPromo.multiplier,
      startDate: typedPromo.startDate || new Date(),
      endDate: typedPromo.endDate || new Date(),
      duration: typedPromo.duration || 24,
      isActive: typedPromo.isActive,
      timeRemaining: 0, // Not used in toggle system
      isExpired: false, // Not used in toggle system
    };
  });
});

/**
 * Get active promo by type
 * Uses cached query to prevent duplicate fetches in the same request
 *
 * @param type - The promo type to fetch
 * @returns Promo object or null if not found
 */
export const getPromoByType = createCachedQuery(
  async (type: "membership-packages" | "one-time-packages" | "mini-packages"): Promise<ServerPromo | null> => {
    await connectDB();

    // Find active promo by type
    const promo = await Promo.findOne({
      type,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!promo) {
      return null;
    }

    // Map to response format
    // Type assertion: lean() returns FlattenMaps which has _id as unknown
    const typedPromo = promo as unknown as IPromo & { _id: { toString: () => string } };
    return {
      id: typedPromo._id.toString(),
      type: typedPromo.type,
      multiplier: typedPromo.multiplier,
      startDate: typedPromo.startDate || new Date(),
      endDate: typedPromo.endDate || new Date(),
      duration: typedPromo.duration || 24,
      isActive: typedPromo.isActive,
      timeRemaining: 0, // Not used in toggle system
      isExpired: false, // Not used in toggle system
    };
  }
);

const PACKAGE_TYPES = [
  "membership-packages",
  "one-time-packages",
  "mini-packages",
] as const;

/**
 * Fetch effective promos for display (scheduled > toggle > alternating).
 * Use this for SSR/initial data so scheduled promos are included.
 * Returns one ServerPromo-like object per type that has a non-null multiplier.
 */
export const getEffectivePromosForDisplay = createCachedQuery(async (): Promise<ServerPromo[]> => {
  await connectDB();

  const resolver = new PromoMultiplierResolverService();
  const effective = await resolver.getEffectiveMultipliers();

  const result: ServerPromo[] = [];

  for (const type of PACKAGE_TYPES) {
    const { multiplier } = effective[type];
    if (multiplier !== null && multiplier !== undefined) {
      result.push({
        id: `effective-${type}`,
        type,
        multiplier: multiplier as PromoMultiplier,
        startDate: new Date(),
        endDate: new Date(),
        duration: 24,
        isActive: true,
        timeRemaining: 0,
        isExpired: false,
      });
    }
  }

  return result;
});
