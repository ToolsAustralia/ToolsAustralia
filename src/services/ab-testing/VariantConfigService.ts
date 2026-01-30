import { VariantConfig } from "@/models/ab-testing/Variant";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";

/**
 * Variant Config Service
 * Handles variant configuration merging and validation
 */
export class VariantConfigService {
  /**
   * Get default/control config structure
   */
  getDefaultConfig(): VariantConfig {
    return {
      hero: {
        // Defaults: use existing component logic
      },
      banner: {
        // Defaults: use existing component logic
      },
      packages: {
        // Defaults: use existing component logic
      },
      membershipModal: {
        // Defaults: use existing component logic (same pattern as hero/banner/packages)
      },
    };
  }

  /**
   * Merge variant config with defaults
   * Variant config overrides defaults
   */
  mergeVariantConfig(baseConfig: VariantConfig, variantConfig: VariantConfig): VariantConfig {
    return {
      hero: {
        ...baseConfig.hero,
        ...variantConfig.hero,
        ctaStyle: {
          ...baseConfig.hero?.ctaStyle,
          ...variantConfig.hero?.ctaStyle,
        },
      },
      banner: {
        ...baseConfig.banner,
        ...variantConfig.banner,
      },
      packages: {
        ...baseConfig.packages,
        ...variantConfig.packages,
      },
      membershipModal: {
        ...baseConfig.membershipModal,
        ...variantConfig.membershipModal,
      },
    };
  }

  /**
   * Validate variant config structure
   */
  validateVariantConfig(config: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config || typeof config !== "object") {
      return { valid: false, errors: ["Config must be an object"] };
    }

    const cfg = config as Record<string, unknown>;

    // Validate hero config
    if (cfg.hero) {
      if (typeof cfg.hero !== "object") {
        errors.push("Hero config must be an object");
      } else {
        const hero = cfg.hero as Record<string, unknown>;
        // Validate imageSrc: can be string or PromoImagePaths object
        if (hero.imageSrc) {
          const imageSrc = hero.imageSrc;
          if (typeof imageSrc !== "string" && typeof imageSrc !== "object") {
            errors.push("Hero imageSrc must be a string or an object with desktop and mobile properties");
          } else if (typeof imageSrc === "object") {
            // Validate PromoImagePaths structure
            const paths = imageSrc as Record<string, unknown>;
            if (typeof paths.desktop !== "string" || typeof paths.mobile !== "string") {
              errors.push("Hero imageSrc object must have desktop and mobile string properties");
            }
          }
        }
        if (hero.messaging && typeof hero.messaging !== "string") {
          errors.push("Hero messaging must be a string");
        }
        if (hero.ctaText && typeof hero.ctaText !== "string") {
          errors.push("Hero ctaText must be a string");
        }
      }
    }

    // Validate banner config
    if (cfg.banner) {
      if (typeof cfg.banner !== "object") {
        errors.push("Banner config must be an object");
      } else {
        const banner = cfg.banner as Record<string, unknown>;
        if (banner.badgeText && typeof banner.badgeText !== "string") {
          errors.push("Banner badgeText must be a string");
        }
        if (banner.multiplier !== undefined && typeof banner.multiplier !== "number") {
          errors.push("Banner multiplier must be a number");
        }
        if (banner.showCountdown !== undefined && typeof banner.showCountdown !== "boolean") {
          errors.push("Banner showCountdown must be a boolean");
        }
        const validCountdownModes = ["default", "limited_time_only", "scheduled_end", "ending"];
        if (
          banner.countdownMode !== undefined &&
          (typeof banner.countdownMode !== "string" || !validCountdownModes.includes(banner.countdownMode as string))
        ) {
          errors.push("Banner countdownMode must be one of: default, limited_time_only, scheduled_end, ending");
        }
      }
    }

    // Validate packages config
    if (cfg.packages) {
      if (typeof cfg.packages !== "object") {
        errors.push("Packages config must be an object");
      } else {
        const packages = cfg.packages as Record<string, unknown>;
        if (packages.displayOrder && !Array.isArray(packages.displayOrder)) {
          errors.push("Packages displayOrder must be an array");
        }
        if (packages.highlightPackage && typeof packages.highlightPackage !== "string") {
          errors.push("Packages highlightPackage must be a string");
        }
        if (packages.hidePackages && !Array.isArray(packages.hidePackages)) {
          errors.push("Packages hidePackages must be an array");
        }
      }
    }

    // Validate membershipModal config
    if (cfg.membershipModal) {
      if (typeof cfg.membershipModal !== "object") {
        errors.push("MembershipModal config must be an object");
      } else {
        const membershipModal = cfg.membershipModal as Record<string, unknown>;
        if (membershipModal.showPackageSelectionFirst !== undefined && typeof membershipModal.showPackageSelectionFirst !== "boolean") {
          errors.push("MembershipModal showPackageSelectionFirst must be a boolean");
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default new VariantConfigService();

