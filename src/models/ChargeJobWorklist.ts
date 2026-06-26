import mongoose, { Document, Schema } from "mongoose";

/**
 * Snapshot of the eligible invoices for ONE bulk past-due charge run, captured
 * once at job kickoff so the cron-free chunked worker never has to re-list every
 * open Stripe invoice per chunk. One document per `ChargeJobRun`.
 *
 * The worklist is the candidate set only — NOT a "safe to charge" assertion. Each
 * chunk re-verifies eligibility live via `payOpenInvoiceAsPastDueAdmin`'s own
 * guards (6h recent-attempt lock, late still-past-due re-check, already-paid
 * catch, stable Stripe idempotency key). Progress/resumability is derived from
 * which worklist invoices already have an `InvoiceChargeLog` row for the run, so
 * a killed chunk resumes safely from the unlogged remainder.
 *
 * Auto-expires 7 days after creation (TTL) — long past any run's lifetime.
 */
export interface ChargeWorklistItem {
  invoiceId: string;
  customerId: string;
  userId: mongoose.Types.ObjectId;
  /** Stripe minor-unit (cents) at snapshot time — display/estimate only; the live charge re-reads amount_remaining. */
  amount: number;
}

export interface IChargeJobWorklist extends Document {
  runId: mongoose.Types.ObjectId;
  items: ChargeWorklistItem[];
  createdAt: Date;
}

const WorklistItemSchema = new Schema<ChargeWorklistItem>(
  {
    invoiceId: { type: String, required: true },
    customerId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const ChargeJobWorklistSchema = new Schema<IChargeJobWorklist>(
  {
    runId: { type: Schema.Types.ObjectId, ref: "ChargeJobRun", required: true, unique: true },
    items: { type: [WorklistItemSchema], required: true, default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL — clean up the snapshot a week after kickoff (runs finish in minutes).
ChargeJobWorklistSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const modelName = "ChargeJobWorklist";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IChargeJobWorklist>(modelName, ChargeJobWorklistSchema);
