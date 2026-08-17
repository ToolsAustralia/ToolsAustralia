import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  _id: string; // Explicitly define _id as string
  firstName: string;
  lastName: string;
  email: string;
  password?: string; // Made optional for passwordless users
  mobile?: string;
  state?: string; // Australian state/territory code (e.g., "NSW", "VIC", "ACT")
  profession?: string; // User's profession (e.g., "Builder", "Electrician", "Other", or custom value)
  birthdate?: Date; // User's date of birth (required for setup; used for age-based eligibility)
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
    packageId: string | null; // Changed from ObjectId to string for static data (CURRENT package after any changes), can be null to clear
    startDate: Date;
    endDate?: Date;
    cancelledAt?: Date; // Track when user actually triggered the cancellation (not the endDate which is future)
    /** Set when subscription first enters past_due (failed renewal); used for admin activity log */
    pastDueAt?: Date;
    /** Stripe invoice id of the last past-due recovery we reanchored for (idempotency marker). */
    lastReanchoredInvoiceId?: string;
    isActive: boolean;
    autoRenew?: boolean;
    status?: string;

    /**
     * Retention-pause window — set when a member accepts the 30-day `pause_30d` offer.
     * The pause begins at the member's period END (they keep the paid period they already
     * bought) and runs ~30 days. While `pausedFrom <= now < pausedUntil` the member is
     * FROZEN: `status="paused"` + `isActive=false` — no charge, no access/perks, no new
     * entry accrual. Existing accumulated entries are UNTOUCHED (they were paid for).
     * Cleared when the member resumes (early or at `pausedUntil` via the auto-billed cycle).
     */
    pausedFrom?: Date;
    pausedUntil?: Date;

    /** Non-canonical Stripe subscription created during initial checkout. */
    pendingStripeSubscriptionId?: string;
    pendingStripeSubscriptionRequestId?: string;
    pendingStripeSubscriptionCreatedAt?: Date;

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

    // Accumulated entries tracking for subscription renewals
    // Tracks accumulated entries for next renewal calculation
    // Persists even when subscription is cancelled (for resubscribe continuation)
    lastMonthAccumulatedEntries?: number;

    // Timestamp of the most recent resubscribe event (when the user reactivated
    // after a cancellation). Drives the carry-over banner on the success page
    // and the activity-card sub-line. Optional — only set on resubscribe.
    lastResubscribedAt?: Date;

    /** Membership Streak: consecutive paid renewals (join = month 0). Written ONLY by the
     *  Stripe webhook writers + the backfill script. See docs/superpowers/specs/2026-07-07-membership-streak-design.md */
    streakMonths?: number;
    /** Increments on each out-of-grace resubscribe reset; scopes milestone re-earning. */
    streakGeneration?: number;
    /** Invoice id of the last subscription_create the streak start/reset writer consumed (idempotency marker). */
    lastStreakStartInvoiceId?: string;
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
    /**
     * Chosen product variant (size / colour). Part of the cart line's identity:
     * two sizes of the same product are two lines, not one. Absent on ticket
     * items and on product lines added before variants existed.
     */
    sku?: string;
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

  /** Previous email to merge from in Klaviyo after verified email change (cleared after merge) */
  pendingKlaviyoMergeFromEmail?: string;

  // SMS OTP for passwordless authentication
  smsOtpCode?: string;
  smsOtpExpires?: Date;
  smsOtpAttempts?: number;

  // Login Code (passwordless sign-in via emailed code)
  loginCode?: string;
  loginCodeExpires?: Date;
  loginCodeAttempts?: number;

  // Password Reset
  passwordResetToken?: string;
  passwordResetExpires?: Date;

  // Account Activity
  lastLogin?: Date;
  isActive: boolean;

  /**
   * When false, the user should not receive Klaviyo marketing/promotional email.
   * Omitted/undefined means opted in (legacy users and default). Not synced from Klaviyo unsubscribe links alone.
   */
  acceptsPromotionalEmail?: boolean;

  // ✅ REMOVED: Old atomic lock arrays - now using event-based idempotency via PaymentEvent model

  // Payment Processing Tracking (for additional safety)
  processedPayments?: string[];

  // Cancellation Upsell Tracking (one-time offer)
  cancellationUpsellRedeemed?: boolean;
  cancellationUpsellRedeemedAt?: Date;

  // Retention Offer Consumption Flags (new cancellation flow one-time offers)
  // +100 entries offer reuses the legacy cancellationUpsellRedeemed flag above
  retentionOffersConsumed?: { pause30d?: boolean; discount50_2mo?: boolean };

  // Upsell Purchase Tracking
  upsellPurchases?: Array<{
    offerId: string;
    offerTitle: string;
    entriesAdded: number;
    amountPaid: number;
    purchaseDate: Date;
    /** Original purchase PaymentIntent id that triggered this upsell (one purchase per appearance) */
    triggeringPaymentIntentId?: string;
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

  // Affiliate tracking (for users referred by affiliates)
  // Note: Affiliates are separate from users - this is just a reference link
  affiliateReferral?: {
    affiliateId: mongoose.Types.ObjectId; // Links to Affiliate model
    affiliateCode: string; // Affiliate code used during signup
    referredAt: Date; // When user was referred
    firstPurchaseCompleted: boolean; // Whether first purchase has been completed
    membershipTied: boolean; // Whether membership is permanently tied to affiliate
  };

  // Signup attribution (which promotion page led to registration)
  signupAttribution?: {
    promotionPageType?: "evergreen" | "toolset";
    promotionSlug?: string;
    /** Prize the visitor had assembled in "Build your prize" when they registered. */
    builtPrizeSlug?: string;
    visitedAt: Date;
    anonymousId?: string;
    // UTM snapshot at signup (e.g. klaviyo, facebook for channel attribution)
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    // Platform-specific IDs (from ad URLs: campaign_id, adset_id, ad_id)
    campaignId?: string;
    adsetId?: string;
    adId?: string;
    /**
     * Paid platform whose CLICK ID (`_fbc` / `ttclid` / `_sc_click`) was present in the
     * request cookies at registration. The resolved platform ONLY — the raw click id is
     * deliberately not stored, so signup-source analytics get click-verified confidence
     * (the same basis purchases use) without adding a new identifier to the user record.
     * Absent for organic signups and for pre-2026-07-24 accounts.
     */
    clickPlatform?: "meta" | "tiktok" | "snapchat" | "google";
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
  // One-time access: higher partner tier first, then FIFO within tier; subscriptions override one-time
  partnerDiscountQueue?: Array<{
    _id?: mongoose.Types.ObjectId; // Auto-generated ID for queue item
    packageId: string; // Package ID that granted this benefit
    packageName: string; // Package name for display
    packageType: "membership" | "one-time" | "mini-draw" | "upsell"; // Source type
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

  // Partner-portal (MyRewards) data-sharing consent.
  // The legal record that this member agreed to the fields the SSO hand-off sends.
  // `scopeVersion` pins WHICH field set they saw — a bump re-prompts everyone.
  // See utils/partner-discounts/partner-consent.ts.
  partnerDiscountConsent?: {
    scopeVersion: number;
    acceptedAt: Date;
    fields: string[];
  };

  // Staff RBAC (see docs/auth/roles.md)
  roleId?: mongoose.Types.ObjectId | null; // null = customer
  userType: "customer" | "staff" | "admin"; // default "customer"
  /** True for non-human service accounts (e.g. Norm AI). Hides the user from the human-staff list. */
  serviceAccount?: boolean;

  // Staff invitation flow
  inviteToken?: string;
  inviteTokenExpires?: Date;
  invitedBy?: mongoose.Types.ObjectId;
  invitedAt?: Date;

  /**
   * Bumped whenever the user's effective permissions change (role reassignment,
   * staff removal, or any permission edit on the role they hold). The JWT
   * callback compares its stored value to the DB value on each request and
   * forces a sign-out when they differ. See docs/auth/roles.md.
   */
  tokenVersion: number;

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
          return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
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
    profession: {
      type: String,
      trim: true,
      maxlength: [100, "Profession cannot be more than 100 characters"],
    },
    birthdate: {
      type: Date,
      required: false,
      validate: {
        validator: function (v: Date) {
          if (!v) return true; // Optional for backward compatibility
          const d = new Date(v);
          return d.getTime() <= Date.now() && !isNaN(d.getTime());
        },
        message: "Birthdate cannot be in the future",
      },
    },
    profileSetupCompleted: {
      type: Boolean,
      default: false, // New users need to complete setup
    },
    acceptsPromotionalEmail: {
      type: Boolean,
      required: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // Staff RBAC fields (see docs/auth/roles.md)
    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      default: null,
    },
    userType: {
      type: String,
      enum: ["customer", "staff", "admin"],
      default: "customer",
    },
    serviceAccount: { type: Boolean, default: false },
    inviteToken: {
      type: String,
      trim: true,
    },
    inviteTokenExpires: Date,
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    invitedAt: Date,
    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Stripe Integration Fields
    stripeCustomerId: {
      type: String,
      trim: true,
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
      cancelledAt: {
        type: Date,
        required: false, // Track when user actually triggered the cancellation (not the endDate which is future)
      },
      pastDueAt: {
        type: Date,
        required: false,
      },
      lastReanchoredInvoiceId: {
        type: String,
        required: false,
      },
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
      // Retention-pause window (see the subscription interface doc above). Set on pause_30d accept:
      // pausedFrom = period end (freeze begins), pausedUntil = auto-resume date (~30d later). Cleared on resume.
      pausedFrom: {
        type: Date,
        required: false,
      },
      pausedUntil: {
        type: Date,
        required: false,
      },
      pendingStripeSubscriptionId: {
        type: String,
        required: false,
      },
      pendingStripeSubscriptionRequestId: {
        type: String,
        required: false,
      },
      pendingStripeSubscriptionCreatedAt: {
        type: Date,
        required: false,
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

      // Accumulated entries tracking for subscription renewals
      // Tracks accumulated entries for next renewal calculation
      // Persists even when subscription is cancelled (for resubscribe continuation)
      lastMonthAccumulatedEntries: {
        type: Number,
        required: false,
        min: [0, "Last month accumulated entries cannot be negative"],
      },

      // Timestamp of most recent resubscribe — see interface comment.
      lastResubscribedAt: {
        type: Date,
        required: false,
      },

      // Membership Streak (see interface comments). Defaults keep legacy docs valid.
      streakMonths: {
        type: Number,
        required: false,
        default: 0,
        min: [0, "Streak months cannot be negative"],
      },
      streakGeneration: {
        type: Number,
        required: false,
        default: 1,
        min: [1, "Streak generation starts at 1"],
      },
      lastStreakStartInvoiceId: {
        type: String,
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
        // Part of the line's identity — see the interface note above. Must exist
        // on the schema or Mongoose strict mode drops it silently on save.
        sku: {
          type: String,
          trim: true,
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

    pendingKlaviyoMergeFromEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // SMS OTP for passwordless authentication
    smsOtpCode: String,
    smsOtpExpires: Date,
    smsOtpAttempts: {
      type: Number,
      default: 0,
      min: [0, "OTP attempts cannot be negative"],
    },

    // Login Code (passwordless sign-in via emailed code)
    loginCode: String,
    loginCodeExpires: Date,
    loginCodeAttempts: {
      type: Number,
      default: 0,
      min: [0, "Login code attempts cannot be negative"],
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

    // Retention Offer Consumption Flags (new cancellation flow one-time offers)
    // +100 entries offer reuses the legacy cancellationUpsellRedeemed flag above
    retentionOffersConsumed: {
      pause30d: { type: Boolean, default: false },
      discount50_2mo: { type: Boolean, default: false },
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
        // Original purchase PaymentIntent id that triggered this upsell — the
        // /api/upsell/purchase one-purchase-per-appearance dedup keys on it.
        // Rows written before 2026-07-10 lack it (strict mode stripped it).
        triggeringPaymentIntentId: {
          type: String,
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

    // Affiliate tracking (for users referred by affiliates)
    affiliateReferral: {
      affiliateId: {
        type: Schema.Types.ObjectId,
        ref: "Affiliate",
      },
      affiliateCode: {
        type: String,
        trim: true,
        uppercase: true,
      },
      referredAt: {
        type: Date,
      },
      firstPurchaseCompleted: {
        type: Boolean,
        default: false,
      },
      membershipTied: {
        type: Boolean,
        default: false,
      },
    },

    signupAttribution: {
      promotionPageType: {
        type: String,
        enum: ["evergreen", "toolset"],
      },
      promotionSlug: {
        type: String,
        trim: true,
        lowercase: true,
      },
      builtPrizeSlug: {
        type: String,
        trim: true,
        lowercase: true,
      },
      visitedAt: {
        type: Date,
      },
      anonymousId: {
        type: String,
      },
      utmSource: { type: String, trim: true },
      utmMedium: { type: String, trim: true },
      utmCampaign: { type: String, trim: true },
      utmContent: { type: String, trim: true },
      utmTerm: { type: String, trim: true },
      campaignId: { type: String, trim: true },
      adsetId: { type: String, trim: true },
      adId: { type: String, trim: true },
      // Paid platform whose CLICK ID was present in the request cookies at registration
      // (derived from extractPaidClickSignals). Stores the resolved platform only — never
      // the raw click id — so signup-source analytics gain click-verified confidence
      // without enlarging the PII footprint held on the user record.
      clickPlatform: {
        type: String,
        enum: ["meta", "tiktok", "snapchat", "google"],
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
            enum: ["membership", "one-time", "mini-draw", "upsell"],
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

    // Partner-portal (MyRewards) data-sharing consent — the legal record.
    // `_id: false` because this is a single embedded record, not a collection item.
    // No default: ABSENT means "never consented", which is the fail-closed state
    // `hasValidPartnerConsent` relies on.
    partnerDiscountConsent: {
      type: {
        scopeVersion: {
          type: Number,
          required: true,
        },
        acceptedAt: {
          type: Date,
          required: true,
        },
        // The field keys the member actually saw when they agreed.
        fields: {
          type: [String],
          required: true,
        },
      },
      _id: false,
      required: false,
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
    // Remove spaces first
    const cleaned = this.mobile.replace(/\s+/g, "");
    
    // Normalize to +61 format for consistency across all systems
    if (cleaned.startsWith("+61")) {
      // Already in +61 format
      this.mobile = cleaned;
    } else if (cleaned.startsWith("61") && cleaned.length > 2) {
      // 61412345678 -> +61412345678
      this.mobile = `+${cleaned}`;
    } else if (cleaned.startsWith("0")) {
      // 0412345678 -> +61412345678
      this.mobile = `+61${cleaned.substring(1)}`;
    } else if (cleaned.startsWith("4") || cleaned.startsWith("5")) {
      // 412345678 -> +61412345678
      this.mobile = `+61${cleaned}`;
    } else {
      // Keep as-is if format is unrecognized (validation will catch it)
      this.mobile = cleaned;
    }
  }

  // Ensure redemptionHistory is always properly initialized
  if (!this.redemptionHistory) {
    this.redemptionHistory = [];
  }

  // Clean up null redemptionId entries in-place to avoid marking the array dirty
  // when nothing actually changed (which would trigger __v version conflicts)
  if (this.redemptionHistory && Array.isArray(this.redemptionHistory)) {
    let hasNullIds = false;
    for (const r of this.redemptionHistory) {
      if (r.redemptionId === null || r.redemptionId === undefined) {
        hasNullIds = true;
        break;
      }
    }
    if (hasNullIds) {
      for (let i = 0; i < this.redemptionHistory.length; i++) {
        const r = this.redemptionHistory[i];
        if (r.redemptionId === null || r.redemptionId === undefined) {
          delete r.redemptionId;
        }
      }
      this.markModified("redemptionHistory");
    }
  }

  next();
});

// Index for better query performance
// Note: email index is automatically created due to unique: true
UserSchema.index({ role: 1 });
UserSchema.index({ "subscription.isActive": 1 });
// Note: isActive_1 removed - redundant with compound indexes (isActive_1_createdAt_-1, etc.)
// MongoDB Atlas recommended: compound index for subscription-related queries
UserSchema.index({
  isActive: 1,
  "subscription.lastUpgradeDate": -1,
  "subscription.lastDowngradeDate": -1,
  "subscription.cancelledAt": -1,
});
UserSchema.index({ isActive: 1, "subscription.pastDueAt": -1 });
// MongoDB Atlas recommended: compound index for active users sorted by creation date
UserSchema.index({ isActive: 1, createdAt: -1 });
// Performance Advisor: mobile lookups (register, update-profile duplicate checks)
UserSchema.index({ mobile: 1 });
// Performance Advisor: subscription status/autoRenew/endDate filtering (projected income, renewals, etc.)
UserSchema.index({
  isActive: 1,
  "subscription.isActive": 1,
  "subscription.status": 1,
  "subscription.endDate": 1,
  "subscription.autoRenew": 1,
});
// Performance Advisor: createdAt sorting for admin user list/search (when not filtering by isActive)
UserSchema.index({ createdAt: -1 });
UserSchema.index({ "referral.code": 1 }, { unique: true, sparse: true });
UserSchema.index({ stripeCustomerId: 1 }, { sparse: true });
UserSchema.index({ "signupAttribution.promotionSlug": 1, createdAt: 1 });
// Partner-discount analytics joins a visit row to the account it produced on this field —
// `PartnerDiscountVisit.anonymousId` -> `signupAttribution.anonymousId` — which is what lets
// the `/discount` funnel be measured without adding a new attribution field to this model.
//
// PLAIN, not partial, and deliberately unlike the `builtPrizeSlug` index directly below. That
// one is partial because its query filters `$exists: true`, whose bounds span a non-sparse
// index's whole key range (panel F-021). This one is only ever queried as an `$in` of concrete
// anonymousId strings — an equality match, which a plain index answers exactly. A partial
// index would additionally depend on the planner proving the predicate implies the filter
// expression, which buys nothing here and is a behaviour this codebase has not measured.
UserSchema.index({ "signupAttribution.anonymousId": 1 });
// PARTIAL, not plain (panel F-021). The built-prize signup aggregation filters
// `"signupAttribution.builtPrizeSlug": { $exists: true }`, which a NON-sparse index cannot narrow
// (a missing field is indexed as `null`, so the bounds span the whole key range). The plain index
// was measured worse than useless: the planner correctly rejected it, and forcing it examined 128
// keys / 127 docs. Measured on dev (895 users, 1 carrying the field), this partial index is chosen
// unprompted and examines 1 key / 1 doc. The NAME must differ from the superseded
// `signupAttribution.builtPrizeSlug_1_createdAt_1` — mongoose cannot alter an index in place;
// re-declaring the same NAME with a changed `partialFilterExpression` is rejected by the server
// (measured: code 86, "An existing index has the same name as the requested index"; commonly cited
// as IndexOptionsConflict/85) and autoIndex swallows it, so the index would silently never build.
// Superseded index dropped by scripts/migrations/2026-07-29-partial-build-prize-indexes.ts.
UserSchema.index(
  { "signupAttribution.builtPrizeSlug": 1, createdAt: 1 },
  {
    name: "signupBuiltPrize_createdAt_partial",
    partialFilterExpression: { "signupAttribution.builtPrizeSlug": { $exists: true } },
  }
);
// ✅ OPTION 1: Major Draw Entries index removed - using single source of truth

// MiniDraw participation indexes
UserSchema.index({ "miniDrawParticipation.miniDrawId": 1 });
UserSchema.index({ "miniDrawParticipation.isActive": 1 });
UserSchema.index({ "miniDrawPackages.miniDrawId": 1 });

// Staff RBAC indexes
UserSchema.index({ userType: 1 });
UserSchema.index({ roleId: 1 }, { sparse: true });
UserSchema.index({ inviteToken: 1 }, { sparse: true, unique: true });

// Clear any cached model to ensure schema changes take effect
if (mongoose.models.User) {
  delete mongoose.models.User;
}

export default mongoose.model<IUser>("User", UserSchema);
