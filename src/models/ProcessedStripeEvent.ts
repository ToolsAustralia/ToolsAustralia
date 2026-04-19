import mongoose, { Schema, models, model } from "mongoose";

const processedStripeEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String },
    processedAt: { type: Date, default: Date.now, expires: 2592000 },
  },
  { collection: "processedstripeevents" }
);

const ProcessedStripeEvent =
  models.ProcessedStripeEvent || model("ProcessedStripeEvent", processedStripeEventSchema);

export default ProcessedStripeEvent;
