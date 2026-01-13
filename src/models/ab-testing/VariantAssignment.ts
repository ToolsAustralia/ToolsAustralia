import mongoose, { Document, Schema } from "mongoose";

/**
 * VariantAssignment Model
 * Tracks which variant each user (logged-in or anonymous) is assigned to
 * Ensures consistent variant assignment across visits
 */
export interface IVariantAssignment extends Document {
  experimentId: mongoose.Types.ObjectId;
  variantId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId; // Nullable for anonymous users
  anonymousId?: string; // Nullable for logged-in users (format: anon_<UUID>)
  assignedAt: Date;
  lastSeenAt: Date;
  mergedAt?: Date; // Timestamp when anonymous assignment was merged to user
}

const VariantAssignmentSchema = new Schema<IVariantAssignment>(
  {
    experimentId: {
      type: Schema.Types.ObjectId,
      ref: "Experiment",
      required: [true, "Experiment ID is required"],
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      required: [true, "Variant ID is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    anonymousId: {
      type: String,
      required: false,
      index: true,
      validate: {
        validator: function (value: string | undefined) {
          // If provided, must start with "anon_"
          return !value || value.startsWith("anon_");
        },
        message: "Anonymous ID must start with 'anon_'",
      },
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    mergedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: false, // We use custom timestamp fields
  }
);

// Validation: Must have either userId or anonymousId (but not both initially)
VariantAssignmentSchema.pre("save", function (next) {
  if (!this.userId && !this.anonymousId) {
    next(new Error("Either userId or anonymousId must be provided"));
    return;
  }
  next();
});

// Indexes for efficient queries
VariantAssignmentSchema.index({ experimentId: 1 });
VariantAssignmentSchema.index({ userId: 1 });
VariantAssignmentSchema.index({ anonymousId: 1 });
VariantAssignmentSchema.index({ experimentId: 1, userId: 1 });
VariantAssignmentSchema.index({ experimentId: 1, anonymousId: 1 });
VariantAssignmentSchema.index({ experimentId: 1, variantId: 1 });

// TTL index for cleanup of stale assignments (180 days)
VariantAssignmentSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 15552000 }); // 180 days in seconds

const VariantAssignment =
  mongoose.models.VariantAssignment || mongoose.model<IVariantAssignment>("VariantAssignment", VariantAssignmentSchema);

export default VariantAssignment;

