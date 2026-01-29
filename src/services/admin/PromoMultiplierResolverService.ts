/**
 * Promo Multiplier Resolver Service
 *
 * Centralized service for resolving promo multipliers with priority logic.
 * Priority: Scheduled Promo > Toggle Promo > Alternating Multiplier > null (no promo)
 *
 * This service ensures consistent multiplier resolution across:
 * - Frontend display components (PromoBanner, PromoHero)
 * - Payment processing (webhook, one-time purchases, upsells)
 * - Package calculations
 */

import Promo from "@/models/Promo";
import ScheduledPromo from "@/models/ScheduledPromo";
import AlternatingPromoMultiplier from "@/models/AlternatingPromoMultiplier";
import { getAlternatingMultiplier } from "@/utils/promo-banner/alternating-multiplier-manager";
import connectDB from "@/lib/mongodb";

export type ResolverSource = "scheduled" | "toggle" | "alternating" | "none";

export interface ResolvedMultiplierWithSource {
  multiplier: number | null;
  source: ResolverSource;
  promoId?: string;
}

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
   * Get active promo multiplier for a package type.
   * Priority: Scheduled (if now in range) > Toggle Promo > null.
   * Does not include alternating; use resolveMultiplierForDisplay/ForPayment for full chain.
   *
   * @param type - Package type (short form)
   * @returns Active promo multiplier or null if no scheduled/toggle promo
   */
  async getActivePromoMultiplier(type: PackageTypeShort): Promise<number | null> {
    try {
      await connectDB();
      const fullType = convertPackageType(type);

      const now = new Date();
      const scheduled = await ScheduledPromo.getActiveByTypeAndDate(fullType, now);
      if (scheduled) {
        return scheduled.multiplier;
      }

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
   * Resolve multiplier at a specific date (for payment reconciliation).
   * Priority: Scheduled at date > Toggle Promo (current) > null.
   *
   * @param type - Package type (short form)
   * @param date - Date to resolve at (e.g. purchase time)
   * @returns Resolved multiplier or null
   */
  async getActivePromoMultiplierAt(type: PackageTypeShort, date: Date): Promise<number | null> {
    try {
      await connectDB();
      const fullType = convertPackageType(type);

      const scheduled = await ScheduledPromo.getActiveByTypeAndDate(fullType, date);
      if (scheduled) {
        return scheduled.multiplier;
      }

      const activePromo = await Promo.findOne({
        type: fullType,
        isActive: true,
      }).sort({ createdAt: -1 });

      return activePromo ? activePromo.multiplier : null;
    } catch (error) {
      console.error(`Error fetching active promo multiplier at date for ${type}:`, error);
      return null;
    }
  }

  /**
   * Resolve multiplier with source (for logging and effective endpoint).
   * Priority: Scheduled > Toggle > Alternating > none.
   */
  async getResolvedMultiplierWithSource(type: PackageTypeShort): Promise<ResolvedMultiplierWithSource> {
    try {
      await connectDB();
      const fullType = convertPackageType(type);
      const now = new Date();

      const scheduled = await ScheduledPromo.getActiveByTypeAndDate(fullType, now);
      if (scheduled) {
        return {
          multiplier: scheduled.multiplier,
          source: "scheduled",
          promoId: String(scheduled._id),
        };
      }

      const togglePromo = await Promo.findOne({
        type: fullType,
        isActive: true,
      }).sort({ createdAt: -1 });
      if (togglePromo) {
        return {
          multiplier: togglePromo.multiplier,
          source: "toggle",
          promoId: togglePromo._id.toString(),
        };
      }

      const config = await AlternatingPromoMultiplier.findOne({
        type: fullType,
        isEnabled: true,
      });
      if (config) {
        const multiplier = getAlternatingMultiplier(config.multipliers);
        return { multiplier, source: "alternating" };
      }

      return { multiplier: null, source: "none" };
    } catch (error) {
      console.error(`Error resolving multiplier with source for ${type}:`, error);
      return { multiplier: null, source: "none" };
    }
  }

  /**
   * Get effective multipliers for all package types (for admin effective endpoint).
   */
  async getEffectiveMultipliers(): Promise<
    Record<PackageType, { multiplier: number | null; source: ResolverSource; promoId?: string }>
  > {
    const types: PackageTypeShort[] = ["membership", "one-time", "mini-draw"];
    const result = {} as Record<PackageType, { multiplier: number | null; source: ResolverSource; promoId?: string }>;

    for (const shortType of types) {
      const fullType = convertPackageType(shortType);
      const resolved = await this.getResolvedMultiplierWithSource(shortType);
      result[fullType] = {
        multiplier: resolved.multiplier,
        source: resolved.source,
        promoId: resolved.promoId,
      };
    }

    return result;
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
   * Priority: Scheduled > Toggle Promo > Alternating > null (no promo, use 1x)
   * Logs resolution for incident response and Stripe reconciliation.
   *
   * @param type - Package type (short form)
   * @returns Resolved multiplier or null if no active/alternating promo (should use 1x in payment)
   */
  async resolveMultiplierForPayment(type: PackageTypeShort): Promise<number | null> {
    const resolved = await this.getResolvedMultiplierWithSource(type);

    if (process.env.NODE_ENV !== "test") {
      console.info("[PromoMultiplierResolver] Payment resolution", {
        type,
        multiplier: resolved.multiplier,
        source: resolved.source,
        ...(resolved.promoId && { promoId: resolved.promoId }),
      });
    }

    return resolved.multiplier;
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

