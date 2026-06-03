import { Schema, models, model } from "mongoose";

const PENDING_STATUSES = ["pending", "approved", "denied", "expired"] as const;

const normPendingActionSchema = new Schema(
  {
    receiptId: { type: String, required: true, index: true },
    registryKey: { type: String, required: true, index: true },
    originalBody: { type: Schema.Types.Mixed, required: true },
    plan: { type: Schema.Types.Mixed, required: true },
    reasonText: String,
    status: { type: String, enum: PENDING_STATUSES, default: "pending", index: true },
    resolvedAt: Date,
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolutionNote: String,
    resolutionOutcome: { ok: Boolean, errorCode: String },
    createdAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { collection: "normpendingactions" }
);

const NormPendingAction =
  models.NormPendingAction || model("NormPendingAction", normPendingActionSchema);
export default NormPendingAction;
