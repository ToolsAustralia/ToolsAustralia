import mongoose, { Document, Schema } from "mongoose";

export type CampaignMode = "global" | "unique" | "both";
export type TargetingMode = "all-active-subscribers" | "manual-users" | "csv-users" | "dynamic-segment";
export type PurchaseRequirement = "none" | "membership" | "one-time" | "any";

export interface IMonthlyEntryCampaign extends Document {
  monthKey: string;
  name: string;
  displayLabel?: string;
  entriesAmount: number;
  campaignMode: CampaignMode;
  targetingMode: TargetingMode;
  startsAt: Date;
  endsAt?: Date;
  neverExpires: boolean;
  /**
   * Per-customer window in hours. When set, each issuance expires this many hours
   * after the instant it was issued (the marketing flow's webhook call), not at the
   * campaign's endsAt.
   * Mutually exclusive with neverExpires. Unset => legacy behaviour (copy endsAt).
   */
  validForHours?: number;
  isActive: boolean;
  code: string;
  requiresPurchase: boolean;
  purchaseRequirement: PurchaseRequirement;
  segmentConfig?: {
    minInactiveDays?: number;
    maxInactiveDays?: number;
    requiresEmailVerified?: boolean;
    requiresRecentPurchaseDays?: number;
    includeUserIds?: string[];
    excludeUserIds?: string[];
    /** Australian state codes (e.g. NSW, VIC) */
    states?: string[];
    /** Subscription package IDs: tradie-subscription, foreman-subscription, boss-subscription */
    membershipTiers?: string[];
    /** Top N% of users by entry count in the active major draw (1–100) */
    topEntriesPercent?: number;
  };
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyEntryCampaignSchema = new Schema<IMonthlyEntryCampaign>(
  {
    monthKey: {
      type: String,
      required: [true, "monthKey is required"],
      match: [/^\d{4}-\d{2}$/, "monthKey must be in YYYY-MM format"],
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Campaign name is required"],
      trim: true,
      maxlength: [120, "Campaign name cannot exceed 120 characters"],
    },
    displayLabel: {
      type: String,
      trim: true,
      maxlength: [60, "Display label cannot exceed 60 characters"],
    },
    entriesAmount: {
      type: Number,
      required: [true, "entriesAmount is required"],
      min: [1, "entriesAmount must be at least 1"],
    },
    campaignMode: {
      type: String,
      enum: ["global", "unique", "both"],
      required: [true, "campaignMode is required"],
      default: "both",
    },
    targetingMode: {
      type: String,
      enum: ["all-active-subscribers", "manual-users", "csv-users", "dynamic-segment"],
      required: [true, "targetingMode is required"],
      default: "all-active-subscribers",
    },
    startsAt: {
      type: Date,
      required: [true, "startsAt is required"],
    },
    endsAt: {
      type: Date,
      required: function (this: IMonthlyEntryCampaign) {
        return !this.neverExpires;
      },
    },
    neverExpires: {
      type: Boolean,
      default: false,
    },
    validForHours: {
      type: Number,
      min: [1, "validForHours must be at least 1"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    code: {
      type: String,
      required: [true, "Campaign code is required"],
      trim: true,
      uppercase: true,
      match: [
        /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
        "Campaign code must be 6-32 chars with A-Z, 0-9 and optional hyphen separators",
      ],
    },
    requiresPurchase: {
      type: Boolean,
      default: false,
    },
    purchaseRequirement: {
      type: String,
      enum: ["none", "membership", "one-time", "any"],
      default: "none",
    },
    segmentConfig: {
      minInactiveDays: { type: Number, min: 0 },
      maxInactiveDays: { type: Number, min: 0 },
      requiresEmailVerified: { type: Boolean, default: true },
      requiresRecentPurchaseDays: { type: Number, min: 1 },
      includeUserIds: [{ type: String, trim: true }],
      excludeUserIds: [{ type: String, trim: true }],
      states: [{ type: String, trim: true }],
      membershipTiers: [{ type: String, trim: true }],
      topEntriesPercent: { type: Number, min: 1, max: 100 },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

MonthlyEntryCampaignSchema.index({ monthKey: 1 });
MonthlyEntryCampaignSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
MonthlyEntryCampaignSchema.index({ monthKey: 1, isActive: 1 });
MonthlyEntryCampaignSchema.index({ code: 1 }, { unique: true });

MonthlyEntryCampaignSchema.pre("save", function (next) {
  if (!this.startsAt) {
    return next(new Error("Campaign start date is required"));
  }

  if (!this.neverExpires && !this.endsAt) {
    return next(new Error("Campaign end date is required unless neverExpires is enabled"));
  }

  if (!this.neverExpires && this.endsAt && this.startsAt >= this.endsAt) {
    return next(new Error("Campaign start must be before end"));
  }

  if (!this.code) {
    return next(new Error("code is required"));
  }

  // neverExpires and validForHours are mutually exclusive. NOTE: this guard only
  // covers the create path — updateCampaign uses findByIdAndUpdate(..., { runValidators:
  // true }), which runs schema validators but does NOT run pre("save") hooks, so an
  // update can still set both. The Zod refine at the route boundary is only a cheap
  // early gate that sees a single payload; the authoritative check for updates is
  // CampaignService.updateCampaign's own merged-state guard, which fetches the existing
  // document and rejects a MERGED neverExpires/validForHours pair that a partial PUT
  // would otherwise leave inconsistent.
  if (this.neverExpires && typeof this.validForHours === "number") {
    return next(new Error("neverExpires and validForHours are mutually exclusive"));
  }

  next();
});

const existingMonthlyEntryCampaignModel = mongoose.models.MonthlyEntryCampaign as
  | mongoose.Model<IMonthlyEntryCampaign>
  | undefined;

if (existingMonthlyEntryCampaignModel) {
  const codePathExists = Boolean(existingMonthlyEntryCampaignModel.schema.path("code"));
  const neverExpiresPathExists = Boolean(existingMonthlyEntryCampaignModel.schema.path("neverExpires"));
  const purchaseRequirementPathExists = Boolean(existingMonthlyEntryCampaignModel.schema.path("purchaseRequirement"));
  const validForHoursPathExists = Boolean(existingMonthlyEntryCampaignModel.schema.path("validForHours"));
  const endsAtPath = existingMonthlyEntryCampaignModel.schema.path("endsAt") as
    | (mongoose.SchemaType & { isRequired?: boolean | ((this: IMonthlyEntryCampaign) => boolean) })
    | undefined;
  const endsAtIsStaticallyRequired = endsAtPath?.isRequired === true;

  // In dev/hot-reload, clear cached model when schema shape is stale.
  if (
    !codePathExists ||
    !neverExpiresPathExists ||
    !purchaseRequirementPathExists ||
    !validForHoursPathExists ||
    endsAtIsStaticallyRequired
  ) {
    delete mongoose.models.MonthlyEntryCampaign;
  }
}

const MonthlyEntryCampaign =
  (mongoose.models.MonthlyEntryCampaign as mongoose.Model<IMonthlyEntryCampaign>) ||
  mongoose.model<IMonthlyEntryCampaign>("MonthlyEntryCampaign", MonthlyEntryCampaignSchema);

export default MonthlyEntryCampaign;
