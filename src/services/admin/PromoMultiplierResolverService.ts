/**
 * Promo Multiplier Resolver Service
 * 
 * Centralized service for resolving promo multipliers with priority logic.
 * Priority: Active Promo > Alternating Multiplier > null (no promo)
 * 
 * This service ensures consistent multiplier resolution across:
 * - Frontend display components (PromoBanner, PromoHero)
 * - Payment processing (webhook, one-time purchases, upsells)
 * - Package calculations
 */

import Promo from "@/models/Promo";
import AlternatingPromoMultiplier from "@/models/AlternatingPromoMultiplier";
import { getAlternatingMultiplier } from "@/utils/promo-banner/alternating-multiplier-manager";
import connectDB from "@/lib/mongodb";

export type PackageType = "membership-packages" | "one-time-packages" | "mini-packages";
export type PackageTypeShort = "membership" | "one-time" | "mini-draw";

/**
 * Convert short package type to full type
 */
function convertPackageType(type: PackageTypeShort): PackageType {
  switch (type) {
    case "membership":
      return "membership-packages";
    case "one-time":
      return "one-time-packages";
    case "mini-draw":
      return "mini-packages";
    default:
      throw new Error(`Invalid package type: ${type}`);
  }
}

export class PromoMultiplierResolverService {
  /**
   * Get active promo multiplier for a package type
   * @param type - Package type (short form)
   * @returns Active promo multiplier or null if no active promo
   */
  async getActivePromoMultiplier(type: PackageTypeShort): Promise<number | null> {
    try {
      await connectDB();
      const fullType = convertPackageType(type);

      const activePromo = await Promo.findOne({
        type: fullType,
        isActive: true,
      }).sort({ createdAt: -1 });

      return activePromo ? activePromo.multiplier : null;
    } catch (error) {
      console.error(`Error fetching active promo multiplier for ${type}:`, error);
      return null;
    }
  }

  /**
   * Get alternating multiplier for a package type (if enabled and no active promo)
   * @param type - Package type (short form)
   * @returns Alternating multiplier or null if disabled or active promo exists
   */
  async getAlternatingMultiplier(type: PackageTypeShort): Promise<number | null> {
    try {
      await connectDB();
      const fullType = convertPackageType(type);

      // First check if there's an active promo - if so, don't use alternating
      const activePromo = await this.getActivePromoMultiplier(type);
      if (activePromo !== null) {
        return null; // Active promo takes precedence
      }

      // Get alternating config
      const config = await AlternatingPromoMultiplier.findOne({
        type: fullType,
        isEnabled: true,
      });

      if (!config) {
        return null;
      }

      // Calculate current alternating multiplier based on date
      return getAlternatingMultiplier(config.multipliers);
    } catch (error) {
      console.error(`Error fetching alternating multiplier for ${type}:`, error);
      return null;
    }
  }

  /**
   * Resolve multiplier for display context (UI components)
   * Priority: Active Promo > Alternating > null (no promo)
   * 
   * @param type - Package type (short form)
   * @returns Resolved multiplier or null if no active/alternating promo
   */
  async resolveMultiplierForDisplay(type: PackageTypeShort): Promise<number | null> {
    // Priority 1: Active promo
    const activePromo = await this.getActivePromoMultiplier(type);
    if (activePromo !== null) {
      return activePromo;
    }

    // Priority 2: Alternating multiplier
    const alternating = await this.getAlternatingMultiplier(type);
    if (alternating !== null) {
      return alternating;
    }

    // No promo active
    return null;
  }

  /**
   * Resolve multiplier for payment context (payment processing)
   * Priority: Active Promo > Alternating > null (no promo, use 1x)
   * 
   * @param type - Package type (short form)
   * @returns Resolved multiplier or null if no active/alternating promo (should use 1x in payment)
   */
  async resolveMultiplierForPayment(type: PackageTypeShort): Promise<number | null> {
    // Priority 1: Active promo
    const activePromo = await this.getActivePromoMultiplier(type);
    if (activePromo !== null) {
      return activePromo;
    }

    // Priority 2: Alternating multiplier
    const alternating = await this.getAlternatingMultiplier(type);
    if (alternating !== null) {
      return alternating;
    }

    // No promo active (returns null, caller should use 1x)
    return null;
  }

  /**
   * Get current alternating multipliers for all enabled types
   * Used by public API to fetch current multipliers for frontend
   * @returns Object mapping package types to current multipliers
   */
  async getCurrentAlternatingMultipliers(): Promise<Record<PackageType, number | null>> {
    try {
      await connectDB();

      const configs = await AlternatingPromoMultiplier.find({
        isEnabled: true,
      });

      const result: Record<PackageType, number | null> = {
        "membership-packages": null,
        "one-time-packages": null,
        "mini-packages": null,
      };

      // Check for active promos first - if active promo exists, don't return alternating
      for (const config of configs) {
        const shortType: PackageTypeShort =
          config.type === "membership-packages"
            ? "membership"
            : config.type === "one-time-packages"
            ? "one-time"
            : "mini-draw";

        const activePromo = await this.getActivePromoMultiplier(shortType);
        
        // Debug logging (development only)
        if (process.env.NODE_ENV === "development") {
          console.log(`🔍 Resolver: ${config.type}`, {
            hasConfig: true,
            isEnabled: config.isEnabled,
            multipliers: config.multipliers,
            activePromo,
            willUseAlternating: activePromo === null,
          });
        }
        
        if (activePromo === null) {
          // No active promo, so alternating can be used
          const calculatedMultiplier = getAlternatingMultiplier(config.multipliers);
          result[config.type as PackageType] = calculatedMultiplier;
          
          if (process.env.NODE_ENV === "development") {
            console.log(`✅ Resolver: Setting ${config.type} to ${calculatedMultiplier}x`);
          }
        } else {
          // If active promo exists, result[config.type] remains null
          if (process.env.NODE_ENV === "development") {
            console.log(`🚫 Resolver: Active promo (${activePromo}x) exists for ${config.type}, skipping alternating`);
          }
        }
      }

      return result;
    } catch (error) {
      console.error("Error fetching current alternating multipliers:", error);
      return {
        "membership-packages": null,
        "one-time-packages": null,
        "mini-packages": null,
      };
    }
  }
}

