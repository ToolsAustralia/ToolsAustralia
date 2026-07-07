import mongoose, { Schema } from "mongoose";

/**
 * Per-subscription recovery lock. Serializes stranded past-due recovery (void stranded +
 * finalize held draft + collect) so concurrent member clicks and cross-tool attempts
 * (member Pay-Now / member Force-Charge / admin Charge / admin Force-Charge / switch-tier
 * teardown) cannot finalize+pay two different held drafts for the same subscription.
 *
 * NOT the global `ChargeJobLock` singleton — that is a single-run mutex for the bulk cron.
 * This is a fine-grained, per-subscription claim keyed `_id: "recover:<subscriptionId>"`.
 *
 * Crash-release: a TTL index expires abandoned claims; the active-reclaim path in
 * `src/utils/payment/recovery/recovery-claim.ts` reclaims a stale claim before the TTL fires.
 */
export interface IRecoveryClaim {
  _id: string; // "recover:<subscriptionId>"
  claimedAt: Date;
  claimedBy: string; // path label, e.g. "pay-failed-invoice", "force-charge:user", "admin-recover"
}

const RecoveryClaimSchema = new Schema<IRecoveryClaim>(
  {
    _id: { type: String, required: true },
    claimedAt: { type: Date, required: true },
    claimedBy: { type: String, required: true },
  },
  { timestamps: false }
);

// TTL cleanup for abandoned claims (crash-release safety net). 300s is intentionally LONGER
// than the active-reclaim window (RECOVERY_CLAIM_STALE_MS = 120s) so the deterministic
// filter-based reclaim is the primary release path and TTL is only a backstop.
RecoveryClaimSchema.index({ claimedAt: 1 }, { expireAfterSeconds: 300 });

const modelName = "RecoveryClaim";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IRecoveryClaim>(modelName, RecoveryClaimSchema);
