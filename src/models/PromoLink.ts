import mongoose, { Document, Schema } from "mongoose";

/**
 * Promo Link Model
 *
 * This model represents shareable promo links with unique codes that grant bonus entries
 * when users make purchases. Similar to affiliate/referral codes but for bonus entries.
 *
 * Features:
 * - Auto-generated unique codes (format: BONUS + 6 alphanumeric)
 * - Expiration dates (optional)
 * - One-time use per user (tracked in usedBy array)
 * - Fixed bonus entries amount (default: 100)
 * - Package type selection (membership and/or one-time packages)
 */
export interface IPromoLink extends Document {
  code: string; // Unique promo code (e.g., "BONUS1A2B3C")
  bonusEntries: number; // Number of bonus entries to grant (default: 100)
  expiresAt?: Date; // Optional expiration date
  isActive: boolean; // Whether the promo link is active
  appliesToMembership: boolean; // Whether this promo applies to membership/subscription packages
  appliesToOneTime: boolean; // Whether this promo applies to one-time packages
  description?: string; // Optional admin notes
  createdBy: mongoose.Types.ObjectId; // Admin who created it
  usageCount: number; // Total number of times this code has been used
  usedBy: mongoose.Types.ObjectId[]; // Array of user IDs who have used this code (for one-time enforcement)
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  isExpired(): boolean; // Check if promo link is expired
  isUsedByUser(userId: string | mongoose.Types.ObjectId): boolean; // Check if user has already used this code
}

const PromoLinkSchema = new Schema<IPromoLink>(
  {
    code: {
      type: String,
      required: [true, "Promo code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^BONUS[A-Z0-9]{6}$/, "Promo code must be in format BONUS followed by 6 alphanumeric characters"],
    },
    bonusEntries: {
      type: Number,
      required: [true, "Bonus entries amount is required"],
      min: [1, "Bonus entries must be at least 1"],
      default: 100,
    },
    expiresAt: {
      type: Date,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    appliesToMembership: {
      type: Boolean,
      default: false,
    },
    appliesToOneTime: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      required: false,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    usageCount: {
      type: Number,
      default: 0,
      min: [0, "Usage count cannot be negative"],
    },
    usedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
// ✅ FIX: Removed duplicate index on code field - unique: true in field definition (line 40) already creates the index
// PromoLinkSchema.index({ code: 1 }, { unique: true }); // REMOVED - duplicate of unique: true in field definition
PromoLinkSchema.index({ isActive: 1, expiresAt: 1 }); // For finding active, non-expired links
PromoLinkSchema.index({ createdBy: 1 }); // For admin queries

// Validation: At least one package type must be selected when active
PromoLinkSchema.pre("save", function (next) {
  if (this.isActive && !this.appliesToMembership && !this.appliesToOneTime) {
    return next(new Error("At least one package type (membership or one-time) must be selected for active promo links"));
  }
  next();
});

/**
 * Check if promo link is expired
 * @returns true if expiresAt is set and current date is past expiration
 */
PromoLinkSchema.methods.isExpired = function (this: IPromoLink): boolean {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

/**
 * Check if a user has already used this promo link
 * @param userId - User ID to check
 * @returns true if user ID is in usedBy array
 */
PromoLinkSchema.methods.isUsedByUser = function (this: IPromoLink, userId: string | mongoose.Types.ObjectId): boolean {
  const userIdString = userId instanceof mongoose.Types.ObjectId ? userId.toString() : userId;
  return this.usedBy.some((id) => id.toString() === userIdString);
};

/**
 * Static method to find active, non-expired promo link by code
 * Used during payment processing to validate and retrieve promo links
 *
 * @param code - Promo code to search for
 * @returns Active promo link if found and valid, null otherwise
 */
PromoLinkSchema.statics.findActiveByCode = async function (code: string) {
  const normalizedCode = code.trim().toUpperCase();
  const promoLink = await this.findOne({ code: normalizedCode, isActive: true });

  if (!promoLink) return null;

  // Check if expired
  if (promoLink.expiresAt && new Date() > promoLink.expiresAt) {
    return null;
  }

  return promoLink;
};

// Add static method types
interface PromoLinkModel extends mongoose.Model<IPromoLink> {
  findActiveByCode(code: string): Promise<IPromoLink | null>;
}

const PromoLink =
  (mongoose.models.PromoLink as PromoLinkModel) ||
  mongoose.model<IPromoLink, PromoLinkModel>("PromoLink", PromoLinkSchema);

export default PromoLink;
