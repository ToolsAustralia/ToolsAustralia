import mongoose, { Document, Schema } from "mongoose";

/**
 * Experiment Model
 * Represents an A/B testing experiment for promotions landing pages
 */
/**
 * Stopping Rules Configuration
 * Defines when an experiment should automatically end
 */
export interface StoppingRules {
  minConversions?: number; // Minimum conversions per variant before stopping
  confidenceThreshold?: number; // Statistical significance threshold (80, 90, 95, 99)
  maxDuration?: number; // Maximum duration in days
  autoEndEnabled?: boolean; // Whether to automatically end when rules are met
}

/**
 * Statistical Results (cached)
 * Stores calculated statistical metrics for performance
 */
export interface StatisticalResults {
  pValue?: number; // P-value from chi-square test
  confidence?: number; // Confidence level (1 - p-value) * 100
  significant?: boolean; // Whether results are statistically significant
  lift?: number; // Percentage lift vs control variant
  confidenceInterval?: {
    lower: number; // Lower bound of confidence interval
    upper: number; // Upper bound of confidence interval
  };
  calculatedAt?: Date; // When these results were calculated
}

export interface IExperiment extends Document {
  name: string;
  status: "draft" | "active" | "paused" | "ended";
  slugTargets: string[]; // Array of prize slugs or ["*"] for all pages
  startDate?: Date;
  endDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // Professional A/B Testing Features
  stoppingRules?: StoppingRules; // Automatic stopping rules configuration
  winnerVariantId?: mongoose.Types.ObjectId; // Declared winner variant
  endedReason?: "manual" | "date_reached" | "stopping_rule_met" | "auto_significant"; // Why experiment ended
  statisticalResults?: StatisticalResults; // Cached statistical analysis
  archived?: boolean; // Whether experiment is archived

  // Instance methods
  isActive(): boolean;
  isLocked(): boolean;
  matchesSlug(slug: string): boolean;
}

const ExperimentSchema = new Schema<IExperiment>(
  {
    name: {
      type: String,
      required: [true, "Experiment name is required"],
      trim: true,
      maxlength: [200, "Experiment name cannot exceed 200 characters"],
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "ended"],
      default: "draft",
      required: true,
    },
    slugTargets: {
      type: [String],
      required: [true, "Slug targets are required"],
      validate: {
        validator: function (targets: string[]) {
          return targets.length > 0;
        },
        message: "At least one slug target is required",
      },
    },
    startDate: {
      type: Date,
      required: false,
    },
    endDate: {
      type: Date,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    // Professional A/B Testing Features
    stoppingRules: {
      type: {
        minConversions: { type: Number, required: false, min: 0 },
        confidenceThreshold: { type: Number, required: false, min: 0, max: 100 },
        maxDuration: { type: Number, required: false, min: 1 },
        autoEndEnabled: { type: Boolean, required: false, default: false },
      },
      required: false,
      _id: false,
    },
    winnerVariantId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      required: false,
    },
    endedReason: {
      type: String,
      enum: ["manual", "date_reached", "stopping_rule_met", "auto_significant"],
      required: false,
    },
    statisticalResults: {
      type: {
        pValue: { type: Number, required: false, min: 0, max: 1 },
        confidence: { type: Number, required: false, min: 0, max: 100 },
        significant: { type: Boolean, required: false },
        lift: { type: Number, required: false },
        confidenceInterval: {
          type: {
            lower: { type: Number, required: false },
            upper: { type: Number, required: false },
          },
          required: false,
          _id: false,
        },
        calculatedAt: { type: Date, required: false },
      },
      required: false,
      _id: false,
    },
    archived: {
      type: Boolean,
      default: false,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
// Note: status_1 removed - redundant with compound indexes status_1_archived_1, status_1_startDate_1_endDate_1
ExperimentSchema.index({ slugTargets: 1 });
ExperimentSchema.index({ startDate: 1 });
ExperimentSchema.index({ endDate: 1 });
ExperimentSchema.index({ status: 1, startDate: 1, endDate: 1 });
ExperimentSchema.index({ winnerVariantId: 1 });
ExperimentSchema.index({ archived: 1 });
ExperimentSchema.index({ status: 1, archived: 1 }); // For filtering active/ended experiments

// Instance methods
ExperimentSchema.methods.isActive = function (this: IExperiment): boolean {
  if (this.status !== "active") return false;
  
  const now = new Date();
  
  // If startDate is set, check if we're past it
  if (this.startDate && now < this.startDate) return false;
  
  // If endDate is set, check if we're before it
  if (this.endDate && now > this.endDate) return false;
  
  return true;
};

ExperimentSchema.methods.isLocked = function (this: IExperiment): boolean {
  // Experiments are locked when active or ended
  return this.status === "active" || this.status === "ended";
};

ExperimentSchema.methods.matchesSlug = function (this: IExperiment, slug: string): boolean {
  // If slugTargets contains "*", match all slugs
  if (this.slugTargets.includes("*")) return true;
  
  // Otherwise, check if slug is in the targets array
  return this.slugTargets.includes(slug);
};

const Experiment = mongoose.models.Experiment || mongoose.model<IExperiment>("Experiment", ExperimentSchema);

export default Experiment;

