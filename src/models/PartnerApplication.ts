import mongoose, { Document, Schema } from "mongoose";

/**
 * Partner Application Model
 * Stores partner application submissions from the "Become a Partner" page
 */
export interface IPartnerApplication extends Document {
  // Basic Information
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;

  // Business Details (Optional)
  abn?: string; // Australian Business Number
  acn?: string; // Australian Company Number

  // Partnership Goals
  goals?: string;

  // Status and Processing
  status: "pending" | "under_review" | "approved" | "rejected" | "contacted";
  adminNotes?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;

  // Metadata
  submittedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerApplicationSchema = new Schema<IPartnerApplication>(
  {
    // Basic Information
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [100, "First name cannot be more than 100 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [100, "Last name cannot be more than 100 characters"],
    },
    businessName: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      maxlength: [200, "Business name cannot be more than 200 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      maxlength: [20, "Phone number cannot be more than 20 characters"],
    },

    // Business Details (Optional)
    abn: {
      type: String,
      trim: true,
      maxlength: [11, "ABN must be 11 digits"],
      validate: {
        validator: function (value: string) {
          if (!value) return true; // Optional field
          return /^\d{11}$/.test(value.replace(/\s/g, ""));
        },
        message: "ABN must be 11 digits",
      },
    },
    acn: {
      type: String,
      trim: true,
      maxlength: [9, "ACN must be 9 digits"],
      validate: {
        validator: function (value: string) {
          if (!value) return true; // Optional field
          return /^\d{9}$/.test(value.replace(/\s/g, ""));
        },
        message: "ACN must be 9 digits",
      },
    },

    // Partnership Goals
    goals: {
      type: String,
      trim: true,
      maxlength: [1000, "Goals cannot be more than 1000 characters"],
    },

    // Status and Processing
    status: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected", "contacted"],
      default: "pending",
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [1000, "Admin notes cannot be more than 1000 characters"],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: {
      type: Date,
    },

    // Metadata
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, "IP address cannot be more than 45 characters"],
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, "User agent cannot be more than 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
PartnerApplicationSchema.index({ status: 1 });
PartnerApplicationSchema.index({ submittedAt: -1 });
PartnerApplicationSchema.index({ email: 1 });
PartnerApplicationSchema.index({ businessName: 1 });
PartnerApplicationSchema.index({ reviewedBy: 1 });
PartnerApplicationSchema.index({ firstName: 1, lastName: 1 });

export default mongoose.models.PartnerApplication ||
  mongoose.model<IPartnerApplication>("PartnerApplication", PartnerApplicationSchema);
