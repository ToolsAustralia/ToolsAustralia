import mongoose, { Document, Schema } from "mongoose";

export type ChargeJobRunStatus = "running" | "completed" | "failed" | "aborted";

export interface ChargeJobRunSkippedBreakdown {
  total: number;
  recentlyAttempted: number;
  noLongerPastDue: number;
  alreadyPaid: number;
  missingPaymentMethod: number;
  /** Stranded past-due member with no re-billable held draft yet (self-heals next cycle). */
  noHeldDraft: number;
  /** No payable attempt right now, but Stripe still has a scheduled retry (auto-retries). */
  awaitingRetry: number;
  other: number;
}

export interface ChargeJobRunTotals {
  eligibleCount: number;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: ChargeJobRunSkippedBreakdown;
  revenueCents: number;
}

export interface IChargeJobRun extends Document {
  adminId: mongoose.Types.ObjectId;
  kind: "charge" | "recover";
  startedAt: Date;
  finishedAt: Date | null;
  status: ChargeJobRunStatus;
  totals: ChargeJobRunTotals;
  error: string | null;
}

const SkippedBreakdownSchema = new Schema<ChargeJobRunSkippedBreakdown>(
  {
    total: { type: Number, required: true, default: 0 },
    recentlyAttempted: { type: Number, required: true, default: 0 },
    noLongerPastDue: { type: Number, required: true, default: 0 },
    alreadyPaid: { type: Number, required: true, default: 0 },
    missingPaymentMethod: { type: Number, required: true, default: 0 },
    noHeldDraft: { type: Number, required: true, default: 0 },
    awaitingRetry: { type: Number, required: true, default: 0 },
    other: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const TotalsSchema = new Schema<ChargeJobRunTotals>(
  {
    eligibleCount: { type: Number, required: true, default: 0 },
    attempted: { type: Number, required: true, default: 0 },
    succeeded: { type: Number, required: true, default: 0 },
    failed: { type: Number, required: true, default: 0 },
    skipped: { type: SkippedBreakdownSchema, required: true, default: () => ({}) },
    revenueCents: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const ChargeJobRunSchema = new Schema<IChargeJobRun>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["charge", "recover"], required: true, default: "charge", index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["running", "completed", "failed", "aborted"],
      required: true,
      default: "running",
    },
    totals: { type: TotalsSchema, required: true, default: () => ({}) },
    error: { type: String, default: null },
  },
  { timestamps: false }
);

ChargeJobRunSchema.index({ startedAt: -1 });
ChargeJobRunSchema.index({ adminId: 1, startedAt: -1 });
ChargeJobRunSchema.index({ status: 1, startedAt: 1 });

const modelName = "ChargeJobRun";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IChargeJobRun>(modelName, ChargeJobRunSchema);
