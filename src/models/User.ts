import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  _id: string; // Explicitly define _id as string
  firstName: string;
  lastName: string;
  email: string;
  password?: string; // Made optional for passwordless users
  mobile?: string;
  state?: string; // Australian state/territory code (e.g., "NSW", "VIC", "ACT")
  profileSetupCompleted?: boolean; // Flag to track if user has completed profile setup
  role: "user" | "admin";

  // Stripe Integration Fields
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;

  // Saved Payment Methods (PCI-COMPLIANT: Only store Stripe payment method IDs)
  savedPaymentMethods: Array<{
    paymentMethodId: string; // Stripe payment method ID only - card details stored securely by Stripe
    isDefault: boolean;
    createdAt: Date;
    lastUsed?: Date;
  }>;

  // Subscription Information (only one active at a time)
  subscription?: {
    packageId: string; // Changed from ObjectId to string for static data (CURRENT package after any changes)
    startDate: Date;
    endDate?: Date;
    isActive: boolean;
    autoRenew?: boolean;
    status?: string;

    // NEW: Previous subscription for benefit preservation during downgrades
    // When user downgrades, Stripe subscription updates immediately, but we preserve old benefits until end date
    previousSubscription?: {
      packageId: string; // OLD package ID (before downgrade)
      packageName: string; // OLD package name
      benefits: {
        entriesPerMonth: number; // Cached for performance
        discountPercentage: number; // Cached for performance
      };
      startDate: Date; // When old package started
      endDate: Date; // When old benefits expire (original billing cycle end)
      downgradeDate: Date; // When downgrade happened (for audit trail)
    };

    // NEW: Pending subscription changes (ONLY for upgrades now - waiting for payment)
    // Downgrades no longer use pendingChange - they use previousSubscription instead
    pendingChange?: {
      newPackageId: string;
      changeType: "upgrade"; // ONLY upgrades now!
      stripeSubscriptionId?: string; // For upgrades - new subscription ID
      paymentIntentId?: string; // For upgrades - payment intent ID
      upgradeAmount?: number; // For upgrades - amount in cents
    };

    // SECURITY: Track last downgrade date to prevent gaming
    lastDowngradeDate?: Date;

    // SECURITY: Track last upgrade date to prevent webhook interference
    lastUpgradeDate?: Date;
  };

  // One-time packages (can have multiple)
  oneTimePackages: Array<{
    packageId: string; // Changed from ObjectId to string for static data
    purchaseDate: Date;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    entriesGranted: number;
  }>;

  // Mini-draw packages (can have multiple)
  miniDrawPackages?: Array<{
    packageId: string;
    packageName: string;
    miniDrawId?: mongoose.Types.ObjectId; // Link to specific MiniDraw
    purchaseDate: Date;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    entriesGranted: number;
    price: number;
    partnerDiscountHours: number;
    partnerDiscountDays: number;
    stripePaymentIntentId: string;
  }>;

  // Mini-draw participation tracking (similar to MajorDraw pattern)
  // Stores which minidraws the user is participating in and their entry counts
  miniDrawParticipation?: Array<{
    miniDrawId: mongoose.Types.ObjectId;
    totalEntries: number;
    entriesBySource: {
      "mini-draw-package"?: number;
      "free-entry"?: number; // Reserved for future use
    };
    firstParticipatedDate: Date;
    lastParticipatedDate: Date;
    isActive: boolean; // Whether the minidraw is still active (for quick filtering)
  }>;

  // Entry and Points System
  accumulatedEntries: number; // Total entries ever received
  entryWallet: number; // Free/unused entries from packages (deprecated - set to 0)
  rewardsPoints: number; // Earned from purchases

  // ✅ OPTION 1: Major Draw Entries removed - using single source of truth (majordraws.entries)

  // Shopping Cart - supports both products and ticket entries
  cart: Array<{
    type: "product" | "ticket";
    productId?: mongoose.Types.ObjectId; // For product items
    miniDrawId?: mongoose.Types.ObjectId; // For ticket entries
    quantity: number;
    price?: number; // Store price at time of adding to cart
  }>;

  // Account Verification
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  emailVerificationToken?: string;
  mobileVerificationToken?: string;

  // Email Verification (6-character codes)
  emailVerificationCode?: string;
  emailVerificationExpires?: Date;
  emailVerificationAttempts?: number;

  // SMS OTP for passwordless authentication
  smsOtpCode?: string;
  smsOtpExpires?: Date;
  smsOtpAttempts?: number;

  // Password Reset
  passwordResetToken?: string;
  passwordResetExpires?: Date;

  // Account Activity
  lastLogin?: Date;
  isActive: boolean;

  // ✅ REMOVED: Old atomic lock arrays - now using event-based idempotency via PaymentEvent model

  // Payment Processing Tracking (for additional safety)
  processedPayments?: string[];

  // Cancellation Upsell Tracking (one-time offer)
  cancellationUpsellRedeemed?: boolean;
  cancellationUpsellRedeemedAt?: Date;

  // Upsell Purchase Tracking
  upsellPurchases?: Array<{
    offerId: string;
    offerTitle: string;
    entriesAdded: number;
    amountPaid: number;
    purchaseDate: Date;
  }>;

  // Upsell Interaction Tracking
  upsellHistory?: Array<{
    offerId: string;
    action: string;
    triggerEvent: string;
    timestamp: Date;
  }>;

  // Upsell Statistics
  upsellStats?: {
    totalShown: number;
    totalAccepted: number;
    totalDeclined: number;
    totalDismissed: number;
    conversionRate: number;
    lastInteraction: Date | null;
  };

  referral?: {
    code: string;
    successfulConversions: number;
    totalEntriesAwarded: number;
  };

  // Points Redemption History
  redemptionHistory?: Array<{
    redemptionId?: string | null;
    redemptionType: "discount" | "entry" | "shipping" | "package";
    packageId?: string; // For package redemptions
    packageName?: string; // For package redemptions
    pointsDeducted: number;
    value: number; // Dollar value or entry count
    description: string;
    redeemedAt: Date;
    status: "completed" | "pending" | "cancelled";
  }>;

  // Partner Discount Queue System
  // Manages stacking of partner discount access periods from multiple purchases
  // Follows FIFO (First In, First Out) principle for automatic activation
  partnerDiscountQueue?: Array<{
    _id?: mongoose.Types.ObjectId; // Auto-generated ID for queue item
    packageId: string; // Package ID that granted this benefit
    packageName: string; // Package name for display
    packageType: "subscription" | "one-time" | "mini-draw" | "upsell"; // Source type
    discountDays: number; // Total days of partner discount access
    discountHours: number; // For more granular tracking (mini-draw packages use hours)
    purchaseDate: Date; // When the package was purchased
    startDate?: Date; // When this benefit period starts (null if queued)
    endDate?: Date; // When this benefit period ends (null if queued)
    status: "active" | "queued" | "expired" | "cancelled"; // Current status
    queuePosition: number; // Position in queue (0 = active, 1+ = queued)
    expiryDate: Date; // Must be used within 12 months of purchase
    stripePaymentIntentId?: string; // For refund tracking
  }>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot be more than 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot be more than 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v || v === "") return false; // Email is required
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: "Please enter a valid email address",
      },
    },
    password: {
      type: String,
      required: false, // Made optional for passwordless users
      minlength: [6, "Password must be at least 6 characters"],
    },
    mobile: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v || v === "") return true; // Allow empty (optional field)
          // Remove spaces and validate Australian mobile format
          const cleaned = v.replace(/\s+/g, "");
          return /^(\+61|61|0)?[4-5]\d{8}$/.test(cleaned);
        },
        message: "Please enter a valid Australian mobile number (e.g., 0412345678 or +61412345678)",
      },
    },
    state: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function (v: string) {
          if (!v || v === "") return true; // Allow empty (optional field)
          const validStates = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
          return validStates.includes(v);
        },
        message: "Please enter a valid Australian state or territory code (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)",
      },
    },
    profileSetupCompleted: {
      type: Boolean,
      default: false, // New users need to complete setup
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // Stripe Integration Fields
    stripeCustomerId: {
      type: String,
      trim: true,
      sparse: true, // Allows multiple null values
    },
    stripeSubscriptionId: {
      type: String,
      trim: true,
      sparse: true, // Allows multiple null values
    },

    // Saved Payment Methods (PCI-COMPLIANT: Only store Stripe payment method IDs)
    savedPaymentMethods: [
      {
        paymentMethodId: {
          type: String,
          required: true,
          trim: true,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        lastUsed: {
          type: Date,
        },
      },
    ],

    // Active subscription membership (only one at a time)
    subscription: {
      packageId: {
        type: Schema.Types.Mixed, // Allow both ObjectId and String for compatibility
        required: false, // Not required during registration - will be set during payment
      },
      startDate: Date,
      endDate: Date,
      isActive: {
        type: Boolean,
        default: false,
      },
      autoRenew: {
        type: Boolean,
        default: true,
      },
      status: {
        type: String,
        default: "incomplete",
      },

      // NEW: Previous subscription for benefit preservation during downgrades
      previousSubscription: {
        packageId: {
          type: String,
          required: false,
        },
        packageName: {
          type: String,
          required: false,
        },
        benefits: {
          entriesPerMonth: {
            type: Number,
            required: false,
          },
          discountPercentage: {
            type: Number,
            required: false,
          },
        },
        startDate: {
          type: Date,
          required: false,
        },
        endDate: {
          type: Date,
          required: false,
        },
        downgradeDate: {
          type: Date,
          required: false,
        },
      },

      // NEW: Pending subscription changes (ONLY for upgrades now - waiting for payment)
      pendingChange: {
        newPackageId: {
          type: String,
          required: false,
        },
        changeType: {
          type: String,
          enum: ["upgrade"], // ONLY upgrades now!
          required: false,
        },
        stripeSubscriptionId: {
          type: String,
          required: false,
        },
        paymentIntentId: {
          type: String,
          required: false,
        },
        upgradeAmount: {
          type: Number,
          required: false,
        },
      },

      // SECURITY: Track last downgrade date to prevent gaming
      lastDowngradeDate: {
        type: Date,
        required: false,
      },

      // SECURITY: Track last upgrade date to prevent webhook interference
      lastUpgradeDate: {
        type: Date,
        required: false,
      },
    },

    // One-time packages purchased (can have multiple)
    oneTimePackages: [
      {
        packageId: {
          type: Schema.Types.Mixed, // Allow both ObjectId and String for compatibility
          required: true,
        },
        purchaseDate: {
          type: Date,
          default: Date.now,
        },
        startDate: {
          type: Date,
          default: Date.now,
        },
        endDate: {
          type: Date,
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        entriesGranted: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Mini-draw packages (can have multiple)
    miniDrawPackages: {
      type: [
        {
          packageId: {
            type: String,
            required: true,
          },
          packageName: {
            type: String,
            required: true,
            trim: true,
          },
          miniDrawId: {
            type: Schema.Types.ObjectId,
            ref: "MiniDraw",
            required: false, // Optional for backward compatibility
          },
          purchaseDate: {
            type: Date,
            default: Date.now,
          },
          startDate: {
            type: Date,
            default: Date.now,
          },
          endDate: {
            type: Date,
            required: true,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
          entriesGranted: {
            type: Number,
            default: 0,
            min: [0, "Entries granted cannot be negative"],
          },
          price: {
            type: Number,
            required: true,
            min: [0, "Price cannot be negative"],
          },
          partnerDiscountHours: {
            type: Number,
            default: 0,
            min: [0, "Partner discount hours cannot be negative"],
          },
          partnerDiscountDays: {
            type: Number,
            default: 0,
            min: [0, "Partner discount days cannot be negative"],
          },
          stripePaymentIntentId: {
            type: String,
            required: true,
          },
        },
      ],
      default: [],
    },

    // Mini-draw participation tracking
    // Stores which minidraws the user is participating in and their entry counts
    miniDrawParticipation: {
      type: [
        {
          miniDrawId: {
            type: Schema.Types.ObjectId,
            ref: "MiniDraw",
            required: true,
          },
          totalEntries: {
            type: Number,
            required: true,
            min: [0, "Total entries cannot be negative"],
            default: 0,
          },
          entriesBySource: {
            "mini-draw-package": {
              type: Number,
              default: 0,
              min: [0, "Package entries cannot be negative"],
            },
            "free-entry": {
              type: Number,
              default: 0,
              min: [0, "Free entries cannot be negative"],
            },
          },
          firstParticipatedDate: {
            type: Date,
            default: Date.now,
          },
          lastParticipatedDate: {
            type: Date,
            default: Date.now,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
        },
      ],
      default: [],
    },

    // Entry and Points System
    accumulatedEntries: {
      type: Number,
      default: 0,
      min: [0, "Accumulated entries cannot be negative"],
    },
    entryWallet: {
      type: Number,
      default: 0,
      min: [0, "Entry wallet cannot be negative"],
    },
    rewardsPoints: {
      type: Number,
      default: 0,
      min: [0, "Rewards points cannot be negative"],
    },

    // ✅ OPTION 1: Major Draw Entries removed - using single source of truth (majordraws.entries)

    // Shopping Cart - supports both products and ticket entries
    cart: [
      {
        type: {
          type: String,
          enum: ["product", "ticket"],
          required: true,
        },
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: function (this: { type: string }) {
            return this.type === "product";
          },
        },
        miniDrawId: {
          type: Schema.Types.ObjectId,
          ref: "MiniDraw",
          required: function (this: { type: string }) {
            return this.type === "ticket";
          },
        },
        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity must be at least 1"],
        },
        price: {
          type: Number,
          min: [0, "Price cannot be negative"],
        },
      },
    ],

    // Account Verification
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isMobileVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    mobileVerificationToken: String,

    // Email Verification (6-character codes)
    emailVerificationCode: String,
    emailVerificationExpires: Date,
    emailVerificationAttempts: {
      type: Number,
      default: 0,
      min: [0, "Email verification attempts cannot be negative"],
    },

    // SMS OTP for passwordless authentication
    smsOtpCode: String,
    smsOtpExpires: Date,
    smsOtpAttempts: {
      type: Number,
      default: 0,
      min: [0, "OTP attempts cannot be negative"],
    },

    // Password Reset
    passwordResetToken: String,
    passwordResetExpires: Date,

    // Account Activity
    lastLogin: Date,
    isActive: {
      type: Boolean,
      default: true,
    },

    // ✅ REMOVED: Old atomic lock arrays - now using event-based idempotency via PaymentEvent model

    // Payment Processing Tracking (for additional safety)
    processedPayments: [String],

    // Cancellation Upsell Tracking (one-time offer)
    cancellationUpsellRedeemed: {
      type: Boolean,
      default: false,
    },
    cancellationUpsellRedeemedAt: {
      type: Date,
      required: false,
    },

    // Upsell Purchase Tracking
    upsellPurchases: [
      {
        offerId: {
          type: String,
          required: true,
        },
        offerTitle: {
          type: String,
          required: true,
        },
        entriesAdded: {
          type: Number,
          default: 0,
        },
        amountPaid: {
          type: Number,
          default: 0,
        },
        purchaseDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Upsell Interaction Tracking
    upsellHistory: [
      {
        offerId: {
          type: String,
          required: true,
        },
        action: {
          type: String,
          required: true,
        },
        triggerEvent: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Upsell Statistics
    upsellStats: {
      totalShown: {
        type: Number,
        default: 0,
      },
      totalAccepted: {
        type: Number,
        default: 0,
      },
      totalDeclined: {
        type: Number,
        default: 0,
      },
      totalDismissed: {
        type: Number,
        default: 0,
      },
      conversionRate: {
        type: Number,
        default: 0,
      },
      lastInteraction: {
        type: Date,
        default: null,
      },
    },

    referral: {
      code: {
        type: String,
        trim: true,
      },
      successfulConversions: {
        type: Number,
        default: 0,
        min: [0, "Successful referrals cannot be negative"],
      },
      totalEntriesAwarded: {
        type: Number,
        default: 0,
        min: [0, "Total referral entries cannot be negative"],
      },
    },

    // Points Redemption History
    redemptionHistory: {
      type: [
        {
          redemptionId: {
            type: String,
            required: false,
            default: null,
          },
          redemptionType: {
            type: String,
            enum: ["discount", "entry", "shipping", "package"],
            required: true,
          },
          packageId: {
            type: String,
            required: false,
          },
          packageName: {
            type: String,
            required: false,
          },
          pointsDeducted: {
            type: Number,
            required: true,
            min: [0, "Points deducted cannot be negative"],
          },
          value: {
            type: Number,
            required: true,
            min: [0, "Value cannot be negative"],
          },
          description: {
            type: String,
            required: true,
            trim: true,
          },
          redeemedAt: {
            type: Date,
            default: Date.now,
          },
          status: {
            type: String,
            enum: ["completed", "pending", "cancelled"],
            default: "completed",
          },
        },
      ],
      default: [],
    },

    // Partner Discount Queue System
    // Manages stacking of partner discount access from multiple purchases
    partnerDiscountQueue: {
      type: [
        {
          packageId: {
            type: String,
            required: true,
            trim: true,
          },
          packageName: {
            type: String,
            required: true,
            trim: true,
          },
          packageType: {
            type: String,
            enum: ["subscription", "one-time", "mini-draw", "upsell"],
            required: true,
          },
          discountDays: {
            type: Number,
            required: true,
            min: [0, "Discount days cannot be negative"],
          },
          discountHours: {
            type: Number,
            default: 0,
            min: [0, "Discount hours cannot be negative"],
          },
          purchaseDate: {
            type: Date,
            required: true,
            default: Date.now,
          },
          startDate: {
            type: Date,
            required: false, // Null when queued
          },
          endDate: {
            type: Date,
            required: false, // Null when queued
          },
          status: {
            type: String,
            enum: ["active", "queued", "expired", "cancelled"],
            default: "queued",
            required: true,
          },
          queuePosition: {
            type: Number,
            required: true,
            min: [0, "Queue position cannot be negative"],
          },
          expiryDate: {
            type: Date,
            required: true,
            // Default is 12 months from purchase
          },
          stripePaymentIntentId: {
            type: String,
            trim: true,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    strict: true, // ✅ Prevent fields not in schema from being saved
    strictQuery: true, // ✅ Prevent querying fields not in schema
  }
);

// Pre-save hook to normalize mobile number
UserSchema.pre("save", function (next) {
  if (this.mobile && typeof this.mobile === "string") {
    // Remove spaces and normalize mobile number format
    this.mobile = this.mobile.replace(/\s+/g, "");
  }

  // Ensure redemptionHistory is always properly initialized
  if (!this.redemptionHistory) {
    this.redemptionHistory = [];
  }

  // Clean up any null redemptionId entries
  if (this.redemptionHistory && Array.isArray(this.redemptionHistory)) {
    this.redemptionHistory = this.redemptionHistory.map((redemption) => {
      if (redemption.redemptionId === null || redemption.redemptionId === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { redemptionId: _redemptionId, ...rest } = redemption;
        return rest;
      }
      return redemption;
    });
  }

  next();
});

// Index for better query performance
// Note: email index is automatically created due to unique: true
UserSchema.index({ role: 1 });
UserSchema.index({ "subscription.isActive": 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ "referral.code": 1 }, { unique: true, sparse: true });
// ✅ OPTION 1: Major Draw Entries index removed - using single source of truth

// MiniDraw participation indexes
UserSchema.index({ "miniDrawParticipation.miniDrawId": 1 });
UserSchema.index({ "miniDrawParticipation.isActive": 1 });
UserSchema.index({ "miniDrawPackages.miniDrawId": 1 });

// Clear any cached model to ensure schema changes take effect
if (mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.model<IUser>("User", UserSchema);
