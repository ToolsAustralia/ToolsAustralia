import mongoose, { Document, Schema } from "mongoose";

export interface IInvoiceChargeLog extends Document {
  invoiceId: string;
  customerId: string;
  userId: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  status: "success" | "failed" | "skipped";
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
  amount: number;
  attemptedAt: Date;
  canRetryAt?: Date;
  nextPaymentAttempt?: Date;
  result?: Record<string, unknown>; // Sanitized Stripe response/error
  chargeRunId?: mongoose.Types.ObjectId | null; // null/absent for per-user manual retries
}

const InvoiceChargeLogSchema = new Schema<IInvoiceChargeLog>(
  {
    invoiceId: {
      type: String,
      required: true,
      index: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["success", "failed", "skipped"],
      index: true,
    },
    errorCode: {
      type: String,
      required: false,
    },
    declineCode: {
      type: String,
      required: false,
    },
    errorMessage: {
      type: String,
      required: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    canRetryAt: {
      type: Date,
      required: false,
      // Index is created explicitly below (line 103) to avoid duplicate index warning
    },
    nextPaymentAttempt: {
      type: Date,
      required: false,
    },
    result: {
      type: Schema.Types.Mixed,
      required: false,
    },
    chargeRunId: {
      type: Schema.Types.ObjectId,
      ref: "ChargeJobRun",
      required: false,
      default: null,
    },
  },
  {
    timestamps: false, // We use custom attemptedAt field
  }
);

// Compound unique index on invoiceId + attemptedAt day (prevents duplicate charges within 24h, allows future retries)
InvoiceChargeLogSchema.index(
  { invoiceId: 1, attemptedAt: 1 },
  {
    unique: false, // Not unique, but we'll check manually for 24h window
  }
);

// Compound index for customer history
InvoiceChargeLogSchema.index({ customerId: 1, attemptedAt: -1 });

// Compound index for admin audit trail
InvoiceChargeLogSchema.index({ adminId: 1, attemptedAt: -1 });

// Compound index for analytics
InvoiceChargeLogSchema.index({ status: 1, attemptedAt: -1 });

// Index for retry eligibility checks
InvoiceChargeLogSchema.index({ canRetryAt: 1 });

// Sparse index for run drill-in (chargeRunId set) and manual-retries filter (chargeRunId null)
InvoiceChargeLogSchema.index(
  { chargeRunId: 1, attemptedAt: -1 },
  { sparse: true }
);

// Clear cached model to ensure schema updates are applied
const modelName = "InvoiceChargeLog";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IInvoiceChargeLog>(modelName, InvoiceChargeLogSchema);
