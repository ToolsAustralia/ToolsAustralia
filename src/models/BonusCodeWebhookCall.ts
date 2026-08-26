import mongoose, { Document, Schema, model, models } from "mongoose";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";

/**
 * BonusCodeWebhookCall
 *
 * One durable row per inbound call to POST /api/bonus-codes/v1/issue — the
 * webhook a Klaviyo flow fires immediately before its discount email.
 *
 * A row is written for EVERY call: accepted, refused and errored. The refused
 * ones are the point. Without them, an enumeration sweep against a leaked
 * shared secret is invisible; with them it is a query. This is also the only
 * place that can answer "why did this customer not get their code?", because
 * `grep -rn "RedeemableIssuance" src/app/api/admin/ src/services/admin/`
 * returns zero hits — there is no admin surface for bonus codes at all, and
 * `console.error` in Vercel lives in finite log retention.
 *
 * NOT `NormCallLog`. That model requires a `registryKey` and a Norm-tier enum
 * (`src/models/NormCallLog.ts:5-52`), so reusing it would file a marketing
 * endpoint inside the internal admin gateway and drag this route into that
 * gateway's rule-10 lockstep obligations for no benefit.
 *
 * PII discipline, mirroring NormCallLog / ChatAuditLog: the raw client IP is
 * NEVER stored — only a sha256 hex digest. No email, no code string, no
 * request body. The shared secret never reaches this model in any form,
 * hashed or truncated.
 *
 * TTL index on `createdAt` purges rows after 90 days.
 */

/**
 * The full outcome vocabulary.
 *
 * The first seven are `StampedIssuanceResult["outcome"]` verbatim (see
 * `src/services/redeemables/CampaignService.ts`) — one concept, one name, so an
 * audit row can be read straight against the service that produced it. The rest
 * are refusals the route makes before or around the service call.
 */
export const BONUS_CODE_CALL_OUTCOMES = [
  // --- service outcomes (verbatim from StampedIssuanceResult) ---
  "minted",
  "rearmed",
  "already_active",
  "spent",
  "expired_no_rearm",
  "not_applicable",
  "error",
  // --- route refusals ---
  /** No usable BONUS_CODE_WEBHOOK_SECRET configured — fail-closed 500. */
  "misconfigured",
  /** No secret header presented — 401. */
  "missing_secret",
  /** Secret presented, matched no configured candidate — 401. */
  "bad_secret",
  /** VERCEL_ENV !== "production" — 403. */
  "not_production",
  /** Zod rejected the body, or neither userId nor email was usable — 400. */
  "invalid_body",
  /** userId and email resolved to different users — 409. */
  "identity_conflict",
  /** No such user, or the account is inactive — 200 (not retryable). */
  "user_not_found",
  /** Daily mint cap reached — 429. */
  "daily_cap",
  /** BONUS_CODE_KILL_SWITCH is on — 429. */
  "kill_switch",
] as const;

export type BonusCodeCallOutcome = (typeof BONUS_CODE_CALL_OUTCOMES)[number];

/**
 * The three flows allowed to call the webhook.
 *
 * Derived from `BonusCodeTrigger` through an exhaustive record rather than
 * retyped, so the two CANNOT fork. A fourth trigger added to `BonusCodeTrigger`
 * without a matching key here is a compile error on `TRIGGER_SET`.
 *
 * Why that matters more than it looks: this array is the schema `enum`. A
 * trigger the app accepts but the model rejects makes `create()` throw, the
 * audit writer swallows it, and every `minted` row for that trigger silently
 * vanishes — which makes the daily budget count read low and the cap quietly
 * stop capping. The forcing function is deliberate.
 */
const TRIGGER_SET: Record<BonusCodeTrigger, true> = {
  "cancel-click": true,
  "checkout-start": true,
  "one-time-purchase": true,
};

export const BONUS_CODE_CALL_TRIGGERS = Object.keys(TRIGGER_SET) as [
  BonusCodeTrigger,
  ...BonusCodeTrigger[],
];

export interface IBonusCodeWebhookCall extends Document {
  requestId: string;
  /** UTC day key (YYYY-MM-DD) — the daily mint budget counts on this. */
  dayKey: string;
  outcome: BonusCodeCallOutcome;
  status: number;
  /** Absent when the body never parsed. */
  trigger?: string;
  /** Absent when the customer could not be resolved. */
  userId?: mongoose.Types.ObjectId;
  /** sha256 hex of the client IP. The raw IP is never persisted. */
  ipHash?: string;
  durationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const BonusCodeWebhookCallSchema = new Schema<IBonusCodeWebhookCall>(
  {
    requestId: {
      type: String,
      required: [true, "requestId is required"],
      index: true,
      trim: true,
    },
    dayKey: {
      type: String,
      required: [true, "dayKey is required"],
      trim: true,
    },
    outcome: {
      type: String,
      enum: BONUS_CODE_CALL_OUTCOMES,
      required: [true, "outcome is required"],
    },
    status: {
      type: Number,
      required: [true, "status is required"],
    },
    trigger: {
      type: String,
      enum: BONUS_CODE_CALL_TRIGGERS,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    ipHash: {
      type: String,
      trim: true,
      maxlength: [64, "ipHash cannot be more than 64 characters"],
    },
    durationMs: {
      type: Number,
    },
  },
  { timestamps: true }
);

// The daily mint budget's only query: count today's grant-creating outcomes.
BonusCodeWebhookCallSchema.index(
  { dayKey: 1, outcome: 1 },
  { name: "bonus_code_webhook_call_day_outcome" }
);

// Support lookup: "what happened for this customer?" — the reason this model
// exists at all, since no admin screen reads RedeemableIssuance.
BonusCodeWebhookCallSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "bonus_code_webhook_call_user_recent" }
);

// TTL index: auto-purge audit rows after 90 days.
BonusCodeWebhookCallSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    name: "bonus_code_webhook_call_ttl",
  }
);

export default (models.BonusCodeWebhookCall as mongoose.Model<IBonusCodeWebhookCall>) ||
  model<IBonusCodeWebhookCall>("BonusCodeWebhookCall", BonusCodeWebhookCallSchema);
