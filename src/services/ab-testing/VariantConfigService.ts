import { VariantConfig } from "@/models/ab-testing/Variant";

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
        disableVideo: false,
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
      packageColors: {
        oneTime: {},
        membership: {},
      },
      membershipTheme: {
        forceLight: false,
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
        // Merge per-slug image maps so a partial variant config doesn't clobber base entries.
        imageSrcBySlug: {
          ...baseConfig.hero?.imageSrcBySlug,
          ...variantConfig.hero?.imageSrcBySlug,
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
      packageColors: {
        oneTime: {
          ...baseConfig.packageColors?.oneTime,
          ...variantConfig.packageColors?.oneTime,
        },
        membership: {
          ...baseConfig.packageColors?.membership,
          ...variantConfig.packageColors?.membership,
        },
      },
      membershipTheme: {
        ...baseConfig.membershipTheme,
        ...variantConfig.membershipTheme,
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
        if (hero.disableVideo !== undefined && typeof hero.disableVideo !== "boolean") {
          errors.push("Hero disableVideo must be a boolean");
        }
        if (hero.imageSrcBySlug !== undefined) {
          if (typeof hero.imageSrcBySlug !== "object" || Array.isArray(hero.imageSrcBySlug) || hero.imageSrcBySlug === null) {
            errors.push("Hero imageSrcBySlug must be a plain object mapping slug → { desktop?, mobile? }");
          } else {
            for (const [slug, paths] of Object.entries(hero.imageSrcBySlug as Record<string, unknown>)) {
              if (!slug.trim()) {
                errors.push("Hero imageSrcBySlug contains an empty slug key");
                continue;
              }
              if (!paths || typeof paths !== "object") {
                errors.push(`Hero imageSrcBySlug["${slug}"] must be an object with optional desktop and mobile string properties`);
                continue;
              }
              const p = paths as Record<string, unknown>;
              if (p.desktop !== undefined && typeof p.desktop !== "string") {
                errors.push(`Hero imageSrcBySlug["${slug}"].desktop must be a string when present`);
              }
              if (p.mobile !== undefined && typeof p.mobile !== "string") {
                errors.push(`Hero imageSrcBySlug["${slug}"].mobile must be a string when present`);
              }
              if (p.desktop === undefined && p.mobile === undefined) {
                errors.push(`Hero imageSrcBySlug["${slug}"] must override at least one of desktop or mobile`);
              }
            }
          }
        }
      }
    }

    // Validate banner config
    if (cfg.banner) {
      if (typeof cfg.banner !== "object") {
        errors.push("Banner config must be an object");
      } else {
        const banner = cfg.banner as Record<string, unknown>;
        if (banner.leftImageUrl !== undefined && typeof banner.leftImageUrl !== "string") {
          errors.push("Banner leftImageUrl must be a string");
        }
        if (
          typeof banner.leftImageUrl === "string" &&
          banner.leftImageUrl.length > 2048
        ) {
          errors.push("Banner leftImageUrl must be at most 2048 characters");
        }
        if (banner.multiplier !== undefined && typeof banner.multiplier !== "number") {
          errors.push("Banner multiplier must be a number");
        }
        if (banner.showCountdown !== undefined && typeof banner.showCountdown !== "boolean") {
          errors.push("Banner showCountdown must be a boolean");
        }
        const validCountdownModes = ["default", "limited_time_only", "scheduled_end", "ending", "static_urgency"];
        if (
          banner.countdownMode !== undefined &&
          (typeof banner.countdownMode !== "string" || !validCountdownModes.includes(banner.countdownMode as string))
        ) {
          errors.push("Banner countdownMode must be one of: default, limited_time_only, scheduled_end, ending, static_urgency");
        }
        if (banner.countdownMode === "static_urgency") {
          const label = banner.countdownLabel;
          if (!label || typeof label !== "string" || !label.trim()) {
            errors.push("Banner countdownLabel is required when countdownMode is static_urgency");
          } else if (label.length > 50) {
            errors.push("Banner countdownLabel must be 50 characters or less");
          }
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

    // Validate packageColors config (split test)
    if (cfg.packageColors !== undefined) {
      if (typeof cfg.packageColors !== "object") {
        errors.push("PackageColors config must be an object");
      } else {
        const packageColors = cfg.packageColors as Record<string, unknown>;
        if (packageColors.oneTime !== undefined && typeof packageColors.oneTime !== "object") {
          errors.push("PackageColors oneTime must be an object");
        }
        if (packageColors.membership !== undefined && typeof packageColors.membership !== "object") {
          errors.push("PackageColors membership must be an object");
        }
      }
    }

    // Validate membershipTheme config (A/B dark-mode test)
    if (cfg.membershipTheme !== undefined) {
      if (typeof cfg.membershipTheme !== "object" || cfg.membershipTheme === null) {
        errors.push("MembershipTheme config must be an object");
      } else {
        const membershipTheme = cfg.membershipTheme as Record<string, unknown>;
        if (
          membershipTheme.forceLight !== undefined &&
          typeof membershipTheme.forceLight !== "boolean"
        ) {
          errors.push("MembershipTheme forceLight must be a boolean");
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

const variantConfigService = new VariantConfigService();
export default variantConfigService;

