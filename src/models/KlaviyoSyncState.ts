import mongoose, { Document, Schema } from "mongoose";

export const KLAVIYO_SWEEP_STATE_ID = "klaviyo-profile-sweep";

/**
 * Single-document state for the Klaviyo profile reconciliation sweep.
 *
 * The sweep selects users by `updatedAt > watermark`, so the watermark must survive across
 * serverless invocations — there is no other singleton-state model in the repo to reuse.
 *
 * It advances ONLY after a fully clean run. That is what makes a failed run self-healing:
 * the next run simply re-covers the same window rather than skipping it forever, which is
 * the failure mode this whole subsystem exists to remove.
 *
 * `timestamps: false` — this document's own mtime carries no meaning and is never queried.
 */
export interface IKlaviyoSyncState extends Document {
  _id: string;
  /** Newest `user.updatedAt` this sweep has successfully covered. */
  watermark: Date;
  /**
   * Rotating cursor for the scheduled FULL pass, which refreshes purely time-derived
   * properties (`membership_active_duration_months`) that dirty no document and so are
   * invisible to the incremental watermark.
   *
   * Separate from `watermark` on purpose: a repair pass must never rewind the live cursor.
   * Advances each scheduled run and wraps to epoch when a circuit completes, so the whole
   * population is covered over time rather than the same first page forever.
   *
   * NOT used when a caller passes `afterUpdatedAt` explicitly (the ops backfill), which
   * manages its own cursor in-process and must not disturb this one.
   */
  fullPassCursor?: Date;
  lastRunAt?: Date;
  lastRunProcessed?: number;
  lastRunFailed?: number;
}

const KlaviyoSyncStateSchema = new Schema<IKlaviyoSyncState>(
  {
    _id: { type: String, default: KLAVIYO_SWEEP_STATE_ID },
    watermark: { type: Date, required: true, default: () => new Date(0) },
    fullPassCursor: { type: Date, required: false },
    lastRunAt: { type: Date, required: false },
    lastRunProcessed: { type: Number, required: false },
    lastRunFailed: { type: Number, required: false },
  },
  { timestamps: false }
);

const KlaviyoSyncState =
  (mongoose.models.KlaviyoSyncState as mongoose.Model<IKlaviyoSyncState>) ||
  mongoose.model<IKlaviyoSyncState>("KlaviyoSyncState", KlaviyoSyncStateSchema);

export default KlaviyoSyncState;
