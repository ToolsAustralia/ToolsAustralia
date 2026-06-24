import mongoose, { Document, Schema, model, models } from 'mongoose';

/**
 * ChatConversation Model
 *
 * Tracks a single chat session — either authenticated (userId) or anonymous (anonId).
 * TTL index on updatedAt purges conversations after 90 days.
 * Escalated conversations link to a ContactSubmission for human follow-up.
 */

export interface IChatTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface IChatConversation extends Document {
  userId?: mongoose.Types.ObjectId;
  anonId?: string;
  status: 'open' | 'escalated' | 'closed';
  escalatedSubmissionId?: mongoose.Types.ObjectId;
  modelTier: string[];
  tokenUsage: IChatTokenUsage;
  ipHash?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TokenUsageSchema = new Schema<IChatTokenUsage>(
  {
    input: { type: Number, default: 0 },
    output: { type: Number, default: 0 },
    cacheRead: { type: Number, default: 0 },
    cacheWrite: { type: Number, default: 0 },
  },
  { _id: false }
);

const ChatConversationSchema = new Schema<IChatConversation>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    anonId: {
      type: String,
      trim: true,
      maxlength: [128, 'anonId cannot be more than 128 characters'],
    },
    status: {
      type: String,
      enum: ['open', 'escalated', 'closed'],
      default: 'open',
      required: true,
    },
    escalatedSubmissionId: {
      type: Schema.Types.ObjectId,
      ref: 'ContactSubmission',
    },
    modelTier: {
      type: [String],
      default: [],
    },
    tokenUsage: {
      type: TokenUsageSchema,
      default: () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    },
    ipHash: {
      type: String,
      trim: true,
      maxlength: [64, 'ipHash cannot be more than 64 characters'],
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'userAgent cannot be more than 500 characters'],
    },
  },
  { timestamps: true }
);

// Query indexes
ChatConversationSchema.index({ userId: 1 });
ChatConversationSchema.index({ status: 1 });

// TTL index: auto-purge conversations after 90 days of inactivity
ChatConversationSchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    name: 'chat_conversations_ttl',
  }
);

export default (models.ChatConversation as mongoose.Model<IChatConversation>) ||
  model<IChatConversation>('ChatConversation', ChatConversationSchema);
