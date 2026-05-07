import mongoose, { Document, Schema } from "mongoose";

/**
 * One row per Stripe `payment_intent.payment_failed` whose charge had
 * `outcome.type === "blocked"` or `outcome.network_status === "declined_by_network"`.
 *
 * Captured at webhook time (and backfilled for history). The admin
 * `/admin/blocked-transactions` page reads from this collection rather than
 * paginating Stripe at request-time. See docs/billing-stripe/gotchas.md.
 *
 * `_id` is the PaymentIntent id — natural idempotency for Stripe webhook
 * retries. Decline-code classification (fraud / permanent / recoverable) is
 * deliberately NOT stored: it's computed at read time so changing the rules
 * doesn't require a backfill.
 */
export interface IBlockedTransaction extends Document {
  _id: string;
  paymentIntentId: string;
  chargeId: string;
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  outcomeType: string | null;
  outcomeNetworkStatus: string | null;
  outcomeReason: string | null;
  amount: number;
  currency: string;
  rawOutcome: unknown;
  createdAt: Date;
  capturedAt: Date;
}

const BlockedTransactionSchema = new Schema<IBlockedTransaction>(
  {
    _id: { type: String, required: true },
    paymentIntentId: { type: String, required: true },
    chargeId: { type: String, required: true },
    cardFingerprint: { type: String, required: true },
    cardLast4: { type: String, required: true, default: "" },
    cardBrand: { type: String, required: true, default: "unknown" },
    stripeCustomerId: { type: String, default: null },
    customerEmail: { type: String, default: null },
    declineCode: { type: String, default: null },
    failureCode: { type: String, default: null },
    outcomeType: { type: String, default: null },
    outcomeNetworkStatus: { type: String, default: null },
    outcomeReason: { type: String, default: null },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    rawOutcome: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true },
    capturedAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: false,
    collection: "blockedtransactions",
  }
);

BlockedTransactionSchema.index({ createdAt: -1 });
BlockedTransactionSchema.index({ cardFingerprint: 1 });
BlockedTransactionSchema.index({ stripeCustomerId: 1, createdAt: -1 });
BlockedTransactionSchema.index({ declineCode: 1, createdAt: -1 });
BlockedTransactionSchema.index({ customerEmail: 1 }, { sparse: true });

const modelName = "BlockedTransaction";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IBlockedTransaction>(modelName, BlockedTransactionSchema);
