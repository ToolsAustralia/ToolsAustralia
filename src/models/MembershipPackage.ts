import mongoose, { Document, Schema } from "mongoose";

export interface IMembershipPackage extends Document {
  name: string;
  type: "subscription" | "one-time";
  price: number;
  description: string;
  features: string[];
  entriesPerMonth?: number; // For subscription packages
  totalEntries?: number; // For one-time packages
  shopDiscountPercent?: number; // Discount percentage for shop purchases
  partnerDiscountDays?: number; // Days of partner discount access
  isMemberOnly?: boolean; // Whether this package is for members only
  stripeProductId?: string;
  stripePriceId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipPackageSchema = new Schema<IMembershipPackage>(
  {
    name: {
      type: String,
      required: [true, "Package name is required"],
      trim: true,
      maxlength: [100, "Package name cannot be more than 100 characters"],
    },
    type: {
      type: String,
      enum: ["subscription", "one-time"],
      required: [true, "Package type is required"],
    },
    price: {
      type: Number,
      required: [true, "Package price is required"],
      min: [0, "Price cannot be negative"],
    },
    description: {
      type: String,
      required: [true, "Package description is required"],
      trim: true,
      maxlength: [1000, "Description cannot be more than 1000 characters"],
    },
    features: [
      {
        type: String,
        required: true,
        trim: true,
      },
    ],
    entriesPerMonth: {
      type: Number,
      min: [0, "Entries per month cannot be negative"],
    },
    totalEntries: {
      type: Number,
      min: [0, "Total entries cannot be negative"],
    },
    shopDiscountPercent: {
      type: Number,
      min: [0, "Shop discount cannot be negative"],
      max: [100, "Shop discount cannot exceed 100%"],
    },
    partnerDiscountDays: {
      type: Number,
      min: [0, "Partner discount days cannot be negative"],
    },
    isMemberOnly: {
      type: Boolean,
      default: false,
    },
    stripeProductId: {
      type: String,
      trim: true,
    },
    stripePriceId: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
MembershipPackageSchema.index({ type: 1 });
MembershipPackageSchema.index({ isActive: 1 });
MembershipPackageSchema.index({ price: 1 });

export default mongoose.models.MembershipPackage ||
  mongoose.model<IMembershipPackage>("MembershipPackage", MembershipPackageSchema);
