import mongoose, { Document, Schema } from "mongoose";

export type RedeemableIssuanceStatus = "active" | "redeemed" | "expired" | "cancelled";

export interface IRedeemableIssuance extends Document {
  campaignId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  monthKey: string;
  code?: string;
  status: RedeemableIssuanceStatus;
  source: "monthly-coupon";
  entriesAmount: number;
  metadata?: {
    targetingMode?: string;
    segmentReason?: string;
    issuedBy?: string;
  };
  issuedAt: Date;
  redeemedAt?: Date;
  expiresAt: Date;
  /**
   * Permanent "this grant is spent" marker. Set on first redemption via $min and
   * NEVER unset — the refund path restores status to "active" and $unsets
   * redeemedAt, so this is the only thing preventing a
   * buy -> redeem -> refund -> re-trigger loop from re-granting a one-per-lifetime code.
   */
  redeemedEverAt?: Date;
  /** The customer's FIRST qualification. Preserved across re-arms for audit. */
  firstIssuedAt?: Date;
  /** When the "Bonus Code Issued" Klaviyo event was accepted. null = not yet / failed. */
  notifiedAt?: Date | null;
  /** Last emit failure reason, for support. null when the last emit succeeded. */
  notifyError?: string | null;
  /**
   * When this customer last had this code APPLIED to a live checkout, written by
   * `attachTypedCodeToCheckout` immediately before it stamps Stripe.
   *
   * This is the server's own record that the customer asked for the code on a
   * purchase they were about to make. It exists because the browser caps the
   * attach request and gives up on it — observed live at `200 in 14903ms`
   * against a 15s cap: the server had answered, the browser had stopped
   * listening, the charge went through and the webhook saw no `campaignCode`.
   * The client cannot know whether the write landed; the server can, so the
   * server records it, and `checkAndRedeemCampaign` uses it to finish the job
   * after the fact. Never a substitute for the Stripe stamp — it is only read
   * when the paid object carries no code at all.
   *
   * `null`/absent means "no live intent": cleared whenever the customer REMOVES
   * an applied code, so a removal is honoured by the fallback too.
   */
  checkoutIntentAt?: Date | null;
  /**
   * The Stripe object (`sub_…` / `pi_…`) the intent above was stamped onto.
   * Diagnostic only — the fallback matches on the time window, and this is what
   * lets support tie a recovered grant back to the exact checkout.
   */
  checkoutIntentTargetId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const RedeemableIssuanceSchema = new Schema<IRedeemableIssuance>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "MonthlyEntryCampaign",
      required: [true, "campaignId is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    monthKey: {
      type: String,
      required: [true, "monthKey is required"],
      match: [/^\d{4}-\d{2}$/, "monthKey must be in YYYY-MM format"],
      trim: true,
    },
    code: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "Invalid issuance code format"],
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    source: {
      type: String,
      enum: ["monthly-coupon"],
      default: "monthly-coupon",
      required: true,
    },
    entriesAmount: {
      type: Number,
      required: [true, "entriesAmount is required"],
      min: [1, "entriesAmount must be at least 1"],
    },
    metadata: {
      targetingMode: { type: String },
      segmentReason: { type: String },
      issuedBy: { type: String },
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    redeemedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: [true, "expiresAt is required"],
      index: true,
    },
    redeemedEverAt: { type: Date },
    firstIssuedAt: { type: Date },
    notifiedAt: { type: Date, default: null },
    notifyError: { type: String, default: null },
    checkoutIntentAt: { type: Date, default: null },
    checkoutIntentTargetId: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

RedeemableIssuanceSchema.index({ campaignId: 1, userId: 1 }, { unique: true });
/**
 * PARTIAL, not sparse. This distinction is a launch-stopper, not a nicety.
 *
 * A COMPOUND sparse index indexes a document that has AT LEAST ONE of its keys.
 * `campaignId` is required, so a row with no `code` is not skipped — it is
 * indexed as `(campaignId, null)`. A `campaignMode: "global"` campaign never
 * writes `code` (`CampaignService.createIssuanceForUser`), so customer #2 into
 * such a campaign collides with customer #1 on `(campaignId, null)` and the
 * insert throws E11000. Proven empirically 2026-08-27 against a throwaway
 * collection carrying the identical index: the second insert was rejected with
 * `keyPattern {"campaignId":1,"code":1}`. All three live codes (BACKIN200 /
 * LOCKIN100 / EXTRA100) are global, so each could reach exactly ONE customer.
 *
 * `partialFilterExpression: { code: { $exists: true } }` leaves code-less rows
 * OUT of the index entirely, which is what "sparse" was always meant to do here.
 * Uniqueness for per-user codes (`campaignMode: "unique" | "both"`) is unchanged.
 *
 * A Mongoose declaration does NOT replace an index that already exists in a live
 * database — Mongo silently keeps the old options. Existing environments must run
 * `npm run migrate:issuance-partial-code-index` (see
 * `scripts/migrations/2026-08-27-redeemable-issuance-partial-code-index.ts`).
 */
RedeemableIssuanceSchema.index(
  { campaignId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $exists: true } } }
);
RedeemableIssuanceSchema.index({ userId: 1, status: 1, expiresAt: 1 });
RedeemableIssuanceSchema.index({ monthKey: 1, status: 1 });

const existingRedeemableIssuanceModel = mongoose.models.RedeemableIssuance as
  | mongoose.Model<IRedeemableIssuance>
  | undefined;

if (existingRedeemableIssuanceModel) {
  // In dev/hot-reload, clear the cached model when the schema shape is stale.
  // Mongoose strict mode drops undeclared paths SILENTLY, so a stale cached
  // model makes these fields look like they simply refuse to persist.
  // Keyed on the NEWEST field on the schema, not a historical one — a guard that
  // names an old field stops detecting staleness the moment a newer field lands.
  const newestPathExists = Boolean(existingRedeemableIssuanceModel.schema.path("checkoutIntentAt"));
  if (!newestPathExists) {
    delete mongoose.models.RedeemableIssuance;
  }
}

const RedeemableIssuance =
  (mongoose.models.RedeemableIssuance as mongoose.Model<IRedeemableIssuance>) ||
  mongoose.model<IRedeemableIssuance>("RedeemableIssuance", RedeemableIssuanceSchema);

export default RedeemableIssuance;
