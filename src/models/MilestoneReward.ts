import mongoose, { Document, Schema } from "mongoose";

export type MilestoneType = "spend-amount" | "entries-gained" | "loyalty-days" | "streak-months";

export interface IMilestoneReward extends Document {
  name: string;
  displayLabel?: string;
  milestoneType: MilestoneType;
  threshold: number;
  entriesAmount: number;
  code: string;
  isActive: boolean;
  neverExpires: boolean;
  startsAt?: Date;
  endsAt?: Date;
  isRecurring: boolean;
  /** Recurrence cadence for recurring rewards. Unset → legacy "every whole
   *  multiple of threshold" (floor(metric/threshold) cycles). Set (e.g. 12 for
   *  the Membership Streak) → the rung repeats every `recurrencePeriod` metric
   *  units AFTER its threshold: fires at threshold, threshold+12, threshold+24…
   *  This is how the full streak ladder cycles annually (month 14 ≡ month 2). */
  recurrencePeriod?: number;
  /** When true the issuance is granted straight into the Major Draw on issue —
   *  no manual claim step. Used by the Membership Streak rungs (streak-months). */
  autoGrant: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneRewardSchema = new Schema<IMilestoneReward>(
  {
    name: {
      type: String,
      required: [true, "Reward name is required"],
      trim: true,
      maxlength: [120, "Reward name cannot exceed 120 characters"],
    },
    displayLabel: {
      type: String,
      trim: true,
      maxlength: [60, "Display label cannot exceed 60 characters"],
    },
    milestoneType: {
      type: String,
      enum: ["spend-amount", "entries-gained", "loyalty-days", "streak-months"],
      required: [true, "milestoneType is required"],
    },
    threshold: {
      type: Number,
      required: [true, "threshold is required"],
      min: [1, "threshold must be at least 1"],
    },
    entriesAmount: {
      type: Number,
      required: [true, "entriesAmount is required"],
      min: [1, "entriesAmount must be at least 1"],
    },
    code: {
      type: String,
      required: [true, "Reward code is required"],
      trim: true,
      uppercase: true,
      match: [
        /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
        "Reward code must be 6-32 chars with A-Z, 0-9 and optional hyphen separators",
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    neverExpires: {
      type: Boolean,
      default: false,
    },
    startsAt: {
      type: Date,
    },
    endsAt: {
      type: Date,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurrencePeriod: {
      type: Number,
      required: false,
      min: [1, "recurrencePeriod must be at least 1"],
    },
    autoGrant: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

MilestoneRewardSchema.index({ code: 1 }, { unique: true });
MilestoneRewardSchema.index({ milestoneType: 1, isActive: 1 });
MilestoneRewardSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

MilestoneRewardSchema.pre("save", function (next) {
  if (this.startsAt && !this.neverExpires && !this.endsAt) {
    return next(new Error("end date is required unless neverExpires is enabled"));
  }
  if (this.startsAt && this.endsAt && this.startsAt >= this.endsAt) {
    return next(new Error("Reward start must be before end"));
  }
  next();
});

const MilestoneReward =
  (mongoose.models.MilestoneReward as mongoose.Model<IMilestoneReward>) ||
  mongoose.model<IMilestoneReward>("MilestoneReward", MilestoneRewardSchema);

export default MilestoneReward;
