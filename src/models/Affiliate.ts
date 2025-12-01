import mongoose, { Document, Schema } from "mongoose";

export interface IAffiliate extends Document {
  // Basic Information (set by admin)
  name: string;
  email: string;
  phone?: string;
  username: string; // Unique username for login
  password: string; // Hashed password

  // Affiliate Link Information
  affiliateCode: string; // Unique code for affiliate links (e.g., "AFF123")
  affiliateLink: string; // Full affiliate link (e.g., "https://tools-australia.com/?aff=AFF123")

  // Bank Details (optional, filled by affiliate)
  bankDetails?: {
    accountName?: string;
    bsb?: string;
    accountNumber?: string;
    bankName?: string;
  };

  // Account Status
  isActive: boolean; // Whether affiliate account is active (admin can enable/disable)

  // Commission Rate (set by admin, editable per affiliate)
  commissionRate: number; // Commission rate as decimal (0.3 = 30%), default 0.3

  // Statistics (updated automatically)
  totalSignups: number; // Total users referred
  totalSales: number; // Total sales amount in cents
  totalCommissions: number; // Total commissions earned in cents (unpaid only, resets after payout)

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const AffiliateSchema = new Schema<IAffiliate>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot be more than 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: "Please enter a valid email address",
      },
    },
    phone: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [50, "Username cannot be more than 50 characters"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    affiliateCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    affiliateLink: {
      type: String,
      required: true,
      trim: true,
    },
    bankDetails: {
      accountName: {
        type: String,
        trim: true,
      },
      bsb: {
        type: String,
        trim: true,
      },
      accountNumber: {
        type: String,
        trim: true,
      },
      bankName: {
        type: String,
        trim: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    commissionRate: {
      type: Number,
      default: 0.3, // 30% default commission rate
      min: 0,
      max: 1,
    },
    totalSignups: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalSales: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCommissions: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Indexes for performance
// Note: unique indexes are automatically created by Mongoose when unique: true is set in field definition
AffiliateSchema.index({ isActive: 1 });

// Clear any cached model to ensure schema changes take effect
if (mongoose.models.Affiliate) {
  delete mongoose.models.Affiliate;
}

export default mongoose.model<IAffiliate>("Affiliate", AffiliateSchema);
