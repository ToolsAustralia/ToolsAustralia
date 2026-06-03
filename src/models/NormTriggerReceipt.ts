import { Schema, models, model } from "mongoose";

const normTriggerReceiptSchema = new Schema(
  {
    receiptId: { type: String, required: true, unique: true, index: true },
    registryKey: { type: String, required: true },
    inputsHash: { type: String, required: true },
    plan: {
      summary: String,
      affectedEntities: [{ type: { type: String }, id: String }],
      moneyDelta: { currency: String, amount: Number },
      warnings: [String],
    },
    signature: { type: String, required: true },
    used: { type: Boolean, default: false, index: true },
    usedAt: Date,
    // TTL: doc removed when expiresAt reached
    expiresAt: { type: Date, required: true, expires: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "normtriggerreceipts" }
);

const NormTriggerReceipt =
  models.NormTriggerReceipt || model("NormTriggerReceipt", normTriggerReceiptSchema);
export default NormTriggerReceipt;
