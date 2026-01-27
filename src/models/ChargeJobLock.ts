import mongoose, { Document, Schema } from "mongoose";

export interface IChargeJobLock extends Document {
  _id: string;
  isLocked: boolean;
  lockedUntil: Date;
  lockedBy?: mongoose.Types.ObjectId;
  lockedAt?: Date;
}

const ChargeJobLockSchema = new Schema<IChargeJobLock>(
  {
    _id: {
      type: String,
      default: "charge-job-lock",
    },
    isLocked: {
      type: Boolean,
      default: false,
      required: true,
    },
    lockedUntil: {
      type: Date,
      required: true,
    },
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    lockedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: false,
  }
);

// Clear cached model to ensure schema updates are applied
const modelName = "ChargeJobLock";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IChargeJobLock>(modelName, ChargeJobLockSchema);
