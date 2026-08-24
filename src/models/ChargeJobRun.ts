import mongoose, { Document, Schema } from "mongoose";

export type ChargeJobRunStatus = "running" | "completed" | "failed" | "aborted";

export interface ChargeJobRunSkippedBreakdown {
  total: number;
  /** Held back by the proactive per-invoice attempt cap (card submitted to Stripe too recently). */
  attemptSpacing: number;
  recentlyAttempted: number;
  noLongerPastDue: number;
  alreadyPaid: number;
  missingPaymentMethod: number;
  /** Stranded past-due member with no re-billable held draft yet (self-heals next cycle). */
  noHeldDraft: number;
  /** No payable attempt right now, but Stripe still has a scheduled retry (auto-retries). */
  awaitingRetry: number;
  /** Card is inside the Stripe excessive-retry block window — sat out, retried later. */
  excessiveRetryCooldown: number;
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
  /** What started the run. Lets the cron resume its OWN run without ever
   *  touching a run an admin kicked off by hand. Legacy rows have no value
   *  and are treated as "admin". */
  trigger?: "admin" | "cron";
  startedAt: Date;
  /**
   * Heartbeat — when this run last made REAL progress (a chunk that logged at
   * least one new worklist item). The orphan sweep keys on this, not on
   * `startedAt`: a run that is still charging is alive however long it has been
   * going, and a run that has stopped advancing is dead however recently it began.
   *
   * OPTIONAL on purpose — runs written before 2026-08-24 have no value, and
   * readers must fall back to `startedAt` (see `isOrphanRun`) so a legacy row can
   * never stick `running` forever. Deliberately NOT stamped on every chunk: a
   * chunk that logs nothing is not progress, so a permanently-failing loop cannot
   * refresh its own liveness and evade the sweep.
   */
  lastProgressAt?: Date | null;
  finishedAt: Date | null;
  status: ChargeJobRunStatus;
  totals: ChargeJobRunTotals;
  error: string | null;
}

const SkippedBreakdownSchema = new Schema<ChargeJobRunSkippedBreakdown>(
  {
    total: { type: Number, required: true, default: 0 },
    // Not `required`, for the same reason excessiveRetryCooldown is not: runs
    // finalized before this bucket existed have no key, and normalizeRunTotals
    // back-fills it to 0 at the read boundary.
    attemptSpacing: { type: Number, default: 0 },
    recentlyAttempted: { type: Number, required: true, default: 0 },
    noLongerPastDue: { type: Number, required: true, default: 0 },
    alreadyPaid: { type: Number, required: true, default: 0 },
    missingPaymentMethod: { type: Number, required: true, default: 0 },
    noHeldDraft: { type: Number, required: true, default: 0 },
    awaitingRetry: { type: Number, required: true, default: 0 },
    excessiveRetryCooldown: { type: Number, default: 0 },
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
    trigger: { type: String, enum: ["admin", "cron"], default: "admin", index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    // No default: absent means "no chunk has advanced yet" and readers fall back
    // to startedAt. A default would silently make every legacy row look fresh.
    lastProgressAt: { type: Date },
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
