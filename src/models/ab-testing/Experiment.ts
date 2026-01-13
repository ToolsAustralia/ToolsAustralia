import mongoose, { Document, Schema } from "mongoose";

/**
 * Experiment Model
 * Represents an A/B testing experiment for promotions landing pages
 */
export interface IExperiment extends Document {
  name: string;
  status: "draft" | "active" | "paused" | "ended";
  slugTargets: string[]; // Array of prize slugs or ["*"] for all pages
  startDate?: Date;
  endDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

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
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
ExperimentSchema.index({ status: 1 });
ExperimentSchema.index({ slugTargets: 1 });
ExperimentSchema.index({ startDate: 1 });
ExperimentSchema.index({ endDate: 1 });
ExperimentSchema.index({ status: 1, startDate: 1, endDate: 1 });

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

