import mongoose, { Document, Schema } from "mongoose";

export interface IAlternatingPromoMultiplier extends Document {
  type: "membership-packages" | "one-time-packages" | "mini-packages";
  multipliers: [number, number]; // Tuple of exactly 2 multipliers (e.g., [5, 10])
  isEnabled: boolean;
  createdBy: mongoose.Types.ObjectId;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AlternatingPromoMultiplierSchema = new Schema<IAlternatingPromoMultiplier>(
  {
    type: {
      type: String,
      enum: ["membership-packages", "one-time-packages", "mini-packages"],
      required: [true, "Package type is required"],
      unique: true, // Only one config per package type (creates index automatically)
    },
    multipliers: {
      type: [Number],
      required: [true, "Multipliers are required"],
      validate: {
        validator: function (multipliers: number[]) {
          // Must have exactly 2 multipliers
          if (multipliers.length !== 2) return false;
          // Each multiplier must be a valid value (2, 3, 5, or 10)
          const validMultipliers = [2, 3, 5, 10];
          return multipliers.every((m) => validMultipliers.includes(m));
        },
        message: "Must have exactly 2 multipliers, each must be 2, 3, 5, or 10",
      },
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    description: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Additional index for efficient queries (type index already created by unique: true)
AlternatingPromoMultiplierSchema.index({ isEnabled: 1 });

const AlternatingPromoMultiplier =
  mongoose.models.AlternatingPromoMultiplier ||
  mongoose.model<IAlternatingPromoMultiplier>("AlternatingPromoMultiplier", AlternatingPromoMultiplierSchema);

export default AlternatingPromoMultiplier;

