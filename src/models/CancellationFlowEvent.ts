import mongoose, { Document, Schema, model, models } from "mongoose";

export const CANCELLATION_REASONS = [
  "too_expensive",
  "prefer_cheaper",
  "dont_use_benefits",
  "too_many_messages",
  "joined_for_giveaway",
  "havent_won",
  "other",
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const OFFER_TYPES = [
  "pause_30d",
  "discount_50_2mo",
  "tier_downgrade",
  "unsubscribe_marketing",
  "bonus_entries_100",
] as const;
export type OfferType = (typeof OFFER_TYPES)[number];

export const OUTCOME_VALUES = ["in_progress", "saved", "cancelled"] as const;
export type CancellationOutcome = (typeof OUTCOME_VALUES)[number];

export interface ICancellationFlowEvent extends Document {
  userId: mongoose.Types.ObjectId;
  reason: CancellationReason;
  reasonText?: string;
  offersShown: OfferType[];
  offerAccepted?: OfferType | null; // null allowed: Mongoose enum validator skips null/undefined
  outcome: CancellationOutcome;
  pastDue: boolean;
  startedAt: Date;
  endedAt?: Date;
  savedAt?: Date;
  retention90?: "retained" | "churned" | null;
  createdAt: Date;
  updatedAt: Date;
}

const CancellationFlowEventSchema = new Schema<ICancellationFlowEvent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, enum: CANCELLATION_REASONS, required: true },
    reasonText: { type: String },
    offersShown: [{ type: String, enum: OFFER_TYPES }],
    offerAccepted: { type: String, enum: OFFER_TYPES, default: null }, // null allowed: Mongoose enum validator skips null/undefined
    outcome: { type: String, enum: OUTCOME_VALUES, required: true, default: "in_progress", index: true },
    pastDue: { type: Boolean, default: false },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    savedAt: { type: Date },
    retention90: { type: String, enum: ["retained", "churned"], default: null, index: true },
  },
  { timestamps: true }
);
CancellationFlowEventSchema.index({ outcome: 1, savedAt: 1, retention90: 1 });

export default (models.CancellationFlowEvent as mongoose.Model<ICancellationFlowEvent>) ||
  model<ICancellationFlowEvent>("CancellationFlowEvent", CancellationFlowEventSchema);
