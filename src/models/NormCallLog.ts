import { Schema, models, model } from "mongoose";

const NORM_TIERS = ["read", "write_safe", "trigger_norm_confirm", "trigger_human_approve"] as const;

const normCallLogSchema = new Schema(
  {
    requestId: { type: String, required: true, index: true },
    registryKey: { type: String, required: true, index: true },
    tier: { type: String, required: true, enum: NORM_TIERS },
    method: { type: String, required: true },
    path: { type: String, required: true },
    queryHash: String,
    bodyHash: String,
    ip: String,
    userAgent: String,
    signatureValid: { type: Boolean, required: true },
    rateLimitState: {
      remaining: Number,
      limit: Number,
      windowMs: Number,
    },
    /**
     * The permission catalog entry this endpoint is registered against.
     * For tier=="read" this is always populated but the per-grant check
     * is bypassed in `withNorm` (reads are inherently safe; PII safety
     * lives in the route's responseSchema projection). For non-read
     * tiers the value reflects the permission that was actually checked.
     */
    permissionChecked: String,
    /**
     * Whether Norm was permitted to proceed past the permission step.
     * For tier=="read" this is always `true` (bypass) — the field does
     * NOT imply Norm's role explicitly holds `permissionChecked`. For
     * non-read tiers it reflects the actual `hasNormPermission()` result
     * at request time (false here = 403 response).
     */
    permissionGranted: Boolean,
    tierContext: {
      dryRunReceiptId: String,
      confirmedFromReceiptId: String,
      pendingActionId: { type: Schema.Types.ObjectId, ref: "NormPendingAction" },
      humanApproverId: { type: Schema.Types.ObjectId, ref: "User" },
    },
    responseStatus: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    responseHash: String,
    errorCode: String,
    // TTL: 90 days
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
  },
  { collection: "normcalllogs" }
);

normCallLogSchema.index({ registryKey: 1, createdAt: -1 });
normCallLogSchema.index({ responseStatus: 1, createdAt: -1 });

const NormCallLog = models.NormCallLog || model("NormCallLog", normCallLogSchema);
export default NormCallLog;
