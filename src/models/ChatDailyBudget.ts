import mongoose, { Document, Schema, model, models } from 'mongoose';

/**
 * ChatDailyBudget Model
 *
 * Tracks aggregate daily LLM cost counters for the app-level spend ceiling.
 * dayKey is a UTC date string (e.g. '2026-06-24'). Unique ensures one document
 * per day; spentUsd/tokensIn/tokensOut are atomically incremented before each
 * model call via $inc to prevent over-budget requests.
 * TTL index on createdAt auto-purges records after 35 days (cost history).
 */

export interface IChatDailyBudget extends Document {
  dayKey: string;
  spentUsd: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: Date;
  updatedAt: Date;
}

const ChatDailyBudgetSchema = new Schema<IChatDailyBudget>(
  {
    dayKey: {
      type: String,
      required: [true, 'dayKey is required'],
      unique: true,
      trim: true,
      maxlength: [10, 'dayKey must be a UTC date string (YYYY-MM-DD)'],
    },
    spentUsd: {
      type: Number,
      default: 0,
    },
    tokensIn: {
      type: Number,
      default: 0,
    },
    tokensOut: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// TTL index: auto-purge budget records after 35 days
ChatDailyBudgetSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 35 * 24 * 60 * 60, // 35 days
    name: 'chat_daily_budget_ttl',
  }
);

export default (models.ChatDailyBudget as mongoose.Model<IChatDailyBudget>) ||
  model<IChatDailyBudget>('ChatDailyBudget', ChatDailyBudgetSchema);
