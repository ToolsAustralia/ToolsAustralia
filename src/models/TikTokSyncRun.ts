import mongoose, { Document, Schema } from "mongoose";

/**
 * Latest outcome of the TikTok Marketing-API insights sync — ONE document per job,
 * upserted by /api/cron/sync-tiktok-ads on every run (success AND failure).
 *
 * Exists so the admin UI can tell "configured but the sync is FAILING" apart from
 * "genuinely no spend yet" (panel F-002): serverless invocations share no memory, so
 * the last run's outcome + TikTok's own error code/message must be persisted to be
 * shown. Read via getTikTokSyncHealth (src/services/admin/tiktok/tiktokSyncStatus.ts).
 * Naming mirrors ChargeJobRun (<job>Run).
 */
export interface ITikTokSyncRun extends Document {
  /** Job identity — currently always "sync-tiktok-ads"; unique (one doc per job). */
  jobKey: string;
  outcome: "ok" | "error";
  /** TikTok's own error code (e.g. 40001) when outcome is "error". */
  errorCode?: number | null;
  errorMessage?: string | null;
  rowsUpserted?: number | null;
  /** Synced window (YYYY-MM-DD, inclusive). */
  since?: string;
  until?: string;
  durationMs?: number;
  finishedAt: Date;
}

const TikTokSyncRunSchema = new Schema<ITikTokSyncRun>(
  {
    jobKey: { type: String, required: true, unique: true },
    outcome: { type: String, required: true, enum: ["ok", "error"] },
    errorCode: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    rowsUpserted: { type: Number, default: null },
    since: { type: String },
    until: { type: String },
    durationMs: { type: Number },
    finishedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

export default mongoose.models.TikTokSyncRun ||
  mongoose.model<ITikTokSyncRun>("TikTokSyncRun", TikTokSyncRunSchema);
