import mongoose, { Document, Schema } from "mongoose";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";
import type { CountdownMode } from "@/utils/promo-banner/countdown-mode";
import type { COLOR_KEYS } from "@/utils/package-colors/packageColorScheme";

/** Package slots for one-time tab (main + additional one-time packs) */
export type OneTimePackageSlot =
  | "apprentice-pack"
  | "tradie-pack"
  | "foreman-pack"
  | "boss-pack"
  | "power-pack"
  | "vip-pack"
  | "black-pack"
  | "mint-pack"
  | "cash-prize";

/** Package slots for membership tab */
export type MembershipPackageSlot =
  | "apprentice-pack"
  | "tradie-pack"
  | "foreman-pack"
  | "boss-pack"
  | "power-pack"
  | "vip-pack";

/**
 * Variant Configuration Interface
 * Defines the structure for variant-specific configurations
 */
export interface VariantConfig {
  hero?: {
    /**
     * Override hero background image
     * Supports both single path (string) for backward compatibility
     * and separate mobile/desktop paths (PromoImagePaths) for responsive images
     */
    imageSrc?: string | PromoImagePaths;
    /**
     * Per-slug overrides for hero image. Used when one experiment targets
     * multiple landing pages (e.g. /promotions/dewalt and /promotions/dewalt-milwaukee)
     * and each page needs its own creative.
     *
     * Both `desktop` and `mobile` are independently optional so a single variant
     * can override just one viewport — e.g. a mobile-only A/B test leaves desktop
     * undefined and `PromoHero` falls through to the theme-aware default
     * landing-image-resolver for that slot.
     *
     * Resolution order per (slug, viewport):
     *   1. imageSrcBySlug[slug].{desktop|mobile} if present
     *   2. imageSrc (variant-wide override)
     *   3. Default landing-image-resolver (theme-aware)
     */
    imageSrcBySlug?: Record<string, { desktop?: string; mobile?: string }>;
    messaging?: string; // Optional hero text overlay
    ctaText?: string; // "ENTER NOW" button text override
    ctaStyle?: {
      backgroundColor?: string;
      textColor?: string;
    };
    /**
     * A/B test: when true, the promo hero renders the STATIC landing still and
     * suppresses the brand hero video (for "static image vs video" experiments).
     * The still falls through to the theme-aware default resolver, so the only
     * difference vs the video arm is motion. Default false (video plays where
     * assets exist and reduced-motion/Save-Data allow). Independent of
     * `imageSrcBySlug` (which also suppresses video, but by pinning a custom still).
     */
    disableVideo?: boolean;
  };
  banner?: {
    /** Override promo banner left image (full URL, e.g. Cloudinary) */
    leftImageUrl?: string;
    multiplier?: number; // Override multiplier display (2x, 3x, 5x, 10x)
    showCountdown?: boolean; // Toggle countdown visibility
    countdownMode?: CountdownMode;
    /** Custom label for static_urgency mode; required when countdownMode is "static_urgency" */
    countdownLabel?: string;
  };
  packages?: {
    displayOrder?: string[]; // Reorder package IDs
    highlightPackage?: string; // Package ID to highlight/emphasize
    hidePackages?: string[]; // Package IDs to hide
  };
  membershipModal?: {
    showPackageSelectionFirst?: boolean; // Toggle package selection modal on step 2 (for landing/promotion pages)
  };
  /** Package color overrides for split testing - one slot maps to one COLOR_KEYS value */
  packageColors?: {
    oneTime?: Partial<Record<OneTimePackageSlot, COLOR_KEYS>>;
    membership?: Partial<Record<MembershipPackageSlot, COLOR_KEYS>>;
  };
  /**
   * A/B test: when forceLight is true, the membership section renders in light
   * mode regardless of the global dark-mode schedule/toggle.
   */
  membershipTheme?: {
    forceLight?: boolean;
  };
  /**
   * A/B test: the theme a bucketed visitor is defaulted into on promo landings.
   * Applied only when the visitor has never used the theme toggle; a manual
   * toggle wins permanently. Control carries "light" explicitly so the admin
   * UI reads unambiguously rather than relying on an absent key.
   *
   * NOTE: `config` is Schema.Types.Mixed, so there is no schema-side change —
   * but this key MUST also be added to VariantConfigService (merge + default +
   * validate) or it is stripped before it reaches the client.
   */
  promoTheme?: {
    defaultTheme?: "light" | "dark";
  };
}

/**
 * Variant Model
 * Represents a single variant within an experiment
 */
export interface IVariant extends Document {
  experimentId: mongoose.Types.ObjectId;
  name: string; // e.g., "Control", "Variant A"
  trafficPercentage: number; // Percentage of traffic (0-100)
  config: VariantConfig;
  isControl: boolean; // Whether this is the control variant
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema<IVariant>(
  {
    experimentId: {
      type: Schema.Types.ObjectId,
      ref: "Experiment",
      required: [true, "Experiment ID is required"],
    },
    name: {
      type: String,
      required: [true, "Variant name is required"],
      trim: true,
      maxlength: [100, "Variant name cannot exceed 100 characters"],
    },
    trafficPercentage: {
      type: Number,
      required: [true, "Traffic percentage is required"],
      min: [0, "Traffic percentage cannot be negative"],
      max: [100, "Traffic percentage cannot exceed 100"],
    },
    config: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    isControl: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
// Note: experimentId_1 removed - redundant with compound index experimentId_1_isControl_1
VariantSchema.index({ isControl: 1 });
VariantSchema.index({ experimentId: 1, isControl: 1 });

const Variant = mongoose.models.Variant || mongoose.model<IVariant>("Variant", VariantSchema);

export default Variant;
