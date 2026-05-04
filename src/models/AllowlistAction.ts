import mongoose, { Document, Schema, Types } from "mongoose";

export type AllowlistActionKind = "added" | "skipped" | "removed";

export type AllowlistActionReason =
  | "auto_eligible"
  | "manual_admin"
  | "manual_admin_override"
  | "filter_not_member"
  | "filter_fraud_signal"
  | "filter_permanent_issue"
  | "manual_reversal";

export type AllowlistActionSource = "webhook" | "admin_bulk" | "admin_reversal";

export interface IAllowlistAction extends Document {
  _id: Types.ObjectId;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  userId: Types.ObjectId | null;
  customerEmail: string | null;
  action: AllowlistActionKind;
  reason: AllowlistActionReason;
  declineCode: string | null;
  failureCode: string | null;
  triggeringPaymentIntentId: string | null;
  triggeringChargeId: string | null;
  stripeListItemId: string | null;
  source: AllowlistActionSource;
  performedByUserId: Types.ObjectId | null;
  createdAt: Date;
}

const AllowlistActionSchema = new Schema<IAllowlistAction>(
  {
    cardFingerprint: { type: String, required: true },
    cardLast4: { type: String, required: true },
    cardBrand: { type: String, required: true },
    stripeCustomerId: { type: String, default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    customerEmail: { type: String, default: null },
    action: {
      type: String,
      required: true,
      enum: ["added", "skipped", "removed"],
    },
    reason: {
      type: String,
      required: true,
      enum: [
        "auto_eligible",
        "manual_admin",
        "manual_admin_override",
        "filter_not_member",
        "filter_fraud_signal",
        "filter_permanent_issue",
        "manual_reversal",
      ],
    },
    declineCode: { type: String, default: null },
    failureCode: { type: String, default: null },
    triggeringPaymentIntentId: { type: String, default: null },
    triggeringChargeId: { type: String, default: null },
    stripeListItemId: { type: String, default: null },
    source: {
      type: String,
      required: true,
      enum: ["webhook", "admin_bulk", "admin_reversal"],
    },
    performedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    collection: "allowlistactions",
  }
);

AllowlistActionSchema.index({ cardFingerprint: 1, action: 1, createdAt: -1 });
AllowlistActionSchema.index({ stripeCustomerId: 1, createdAt: -1 });
AllowlistActionSchema.index({ action: 1, createdAt: -1 });

const modelName = "AllowlistAction";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IAllowlistAction>(modelName, AllowlistActionSchema);
