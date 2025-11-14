import mongoose, { Document, Schema } from "mongoose";

export interface IPartnerDiscount extends Document {
  name: string;
  brand: string;
  description: string;
  discountPercent: number;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validTo: Date;
  isActive: boolean;
  applicableCategories?: string[];
  imageUrl?: string;
  termsAndConditions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerDiscountSchema = new Schema<IPartnerDiscount>(
  {
    name: {
      type: String,
      required: [true, "Discount name is required"],
      trim: true,
      maxlength: [200, "Discount name cannot be more than 200 characters"],
    },
    brand: {
      type: String,
      required: [true, "Brand is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [1000, "Description cannot be more than 1000 characters"],
    },
    discountPercent: {
      type: Number,
      required: [true, "Discount percentage is required"],
      min: [0, "Discount percentage cannot be negative"],
      max: [100, "Discount percentage cannot exceed 100%"],
    },
    minPurchaseAmount: {
      type: Number,
      min: [0, "Minimum purchase amount cannot be negative"],
    },
    maxDiscountAmount: {
      type: Number,
      min: [0, "Maximum discount amount cannot be negative"],
    },
    validFrom: {
      type: Date,
      required: [true, "Valid from date is required"],
    },
    validTo: {
      type: Date,
      required: [true, "Valid to date is required"],
      validate: {
        validator: function (this: IPartnerDiscount, value: Date) {
          return value > this.validFrom;
        },
        message: "Valid to date must be after valid from date",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableCategories: [
      {
        type: String,
        trim: true,
      },
    ],
    imageUrl: {
      type: String,
      trim: true,
    },
    termsAndConditions: {
      type: String,
      trim: true,
      maxlength: [2000, "Terms and conditions cannot be more than 2000 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
PartnerDiscountSchema.index({ brand: 1 });
PartnerDiscountSchema.index({ isActive: 1 });
PartnerDiscountSchema.index({ validFrom: 1, validTo: 1 });
PartnerDiscountSchema.index({ applicableCategories: 1 });
PartnerDiscountSchema.index({ discountPercent: -1 });

export default mongoose.models.PartnerDiscount ||
  mongoose.model<IPartnerDiscount>("PartnerDiscount", PartnerDiscountSchema);

