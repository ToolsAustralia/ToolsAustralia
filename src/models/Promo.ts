import mongoose, { Document, Schema } from "mongoose";

export interface IPromo extends Document {
  type: "one-time-packages" | "mini-packages";
  multiplier: 2 | 3 | 5 | 10;
  startDate: Date;
  endDate: Date;
  duration: number; // in hours
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PromoSchema = new Schema<IPromo>(
  {
    type: {
      type: String,
      enum: ["one-time-packages", "mini-packages"],
      required: [true, "Promo type is required"],
    },
    multiplier: {
      type: Number,
      enum: [2, 3, 5, 10],
      required: [true, "Multiplier is required"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [1, "Duration must be at least 1 hour"],
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Index for efficient queries
PromoSchema.index({ type: 1, isActive: 1 });
PromoSchema.index({ endDate: 1 });

// Virtual to check if promo has expired
PromoSchema.virtual("isExpired").get(function (this: IPromo) {
  return new Date() > this.endDate;
});

// Method to deactivate promo
PromoSchema.methods.deactivate = async function (this: IPromo) {
  this.isActive = false;
  await this.save();
};

// Static method to get active promos
PromoSchema.statics.getActivePromos = async function () {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gt: now },
  }).sort({ createdAt: -1 });
};

// Static method to get active promo by type
PromoSchema.statics.getActivePromoByType = async function (type: "one-time-packages" | "mini-packages") {
  const now = new Date();
  return this.findOne({
    type,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gt: now },
  }).sort({ createdAt: -1 });
};

// Middleware to auto-deactivate expired promos on query
PromoSchema.pre(/^find/, async function (next) {
  const now = new Date();
  await Promo.updateMany(
    {
      isActive: true,
      endDate: { $lte: now },
    },
    {
      $set: { isActive: false },
    }
  );
  next();
});

const Promo = mongoose.models.Promo || mongoose.model<IPromo>("Promo", PromoSchema);

export default Promo;
