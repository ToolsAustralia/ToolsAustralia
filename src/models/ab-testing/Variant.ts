import mongoose, { Document, Schema } from "mongoose";
import type { PromoImagePaths } from "@/utils/promo/promo-hero-types";
import type { CountdownMode } from "@/utils/promo-banner/countdown-mode";

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
    messaging?: string; // Optional hero text overlay
    ctaText?: string; // "ENTER NOW" button text override
    ctaStyle?: {
      backgroundColor?: string;
      textColor?: string;
    };
  };
  banner?: {
    badgeText?: string; // Override badge text (default: BONUS ENTRIES)
    multiplier?: number; // Override multiplier display (2x, 3x, 5x, 10x)
    showCountdown?: boolean; // Toggle countdown visibility
    countdownMode?: CountdownMode;
  };
  packages?: {
    displayOrder?: string[]; // Reorder package IDs
    highlightPackage?: string; // Package ID to highlight/emphasize
    hidePackages?: string[]; // Package IDs to hide
  };
  membershipModal?: {
    showPackageSelectionFirst?: boolean; // Toggle package selection modal on step 2 (for landing/promotion pages)
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
VariantSchema.index({ experimentId: 1 });
VariantSchema.index({ isControl: 1 });
VariantSchema.index({ experimentId: 1, isControl: 1 });

const Variant = mongoose.models.Variant || mongoose.model<IVariant>("Variant", VariantSchema);

export default Variant;
