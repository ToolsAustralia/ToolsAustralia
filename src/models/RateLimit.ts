import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Shared rate-limit counter, used by `createDistributedRateLimiter`.
 *
 * Unlike the in-memory limiter, this is shared across all serverless instances,
 * so an attacker can't bypass auth brute-force limits by spreading requests
 * across Vercel lambda instances. One document per `${bucketKey}:${identifier}`
 * window; a TTL index removes each window automatically once it elapses.
 */
export interface IRateLimit extends Document {
  _id: string;
  count: number;
  resetAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    _id: { type: String, required: true }, // `${bucketKey}:${identifier}`
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false }
);

// TTL: Mongo deletes each window document once `resetAt` has passed.
RateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const RateLimit: Model<IRateLimit> =
  (mongoose.models.RateLimit as Model<IRateLimit>) ||
  mongoose.model<IRateLimit>("RateLimit", RateLimitSchema);

export default RateLimit;
