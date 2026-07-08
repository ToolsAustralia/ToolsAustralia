import mongoose, { Document, Schema, model, models } from 'mongoose';

/**
 * ChatAuditLog Model
 *
 * Per-request audit trail for the AI support chatbot. Mirrors NormCallLog discipline:
 * stores hashed/metadata fields only — never raw message content or PII.
 * TTL index on createdAt purges entries after 90 days.
 */

export interface IChatAuditLog extends Document {
  requestId: string;
  conversationId?: mongoose.Types.ObjectId;
  actorKind: 'member' | 'anonymous';
  modelTier?: string;
  tokensIn?: number;
  tokensOut?: number;
  deflected: boolean;
  escalated: boolean;
  status: number;
  durationMs?: number;
  ipHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ChatAuditLogSchema = new Schema<IChatAuditLog>(
  {
    requestId: {
      type: String,
      required: [true, 'requestId is required'],
      index: true,
      trim: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatConversation',
    },
    actorKind: {
      type: String,
      enum: ['member', 'anonymous'],
      required: [true, 'actorKind is required'],
    },
    modelTier: {
      type: String,
      trim: true,
    },
    tokensIn: {
      type: Number,
    },
    tokensOut: {
      type: Number,
    },
    deflected: {
      type: Boolean,
      required: [true, 'deflected is required'],
    },
    escalated: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Number,
      required: [true, 'status is required'],
    },
    durationMs: {
      type: Number,
    },
    ipHash: {
      type: String,
      trim: true,
      maxlength: [64, 'ipHash cannot be more than 64 characters'],
    },
  },
  { timestamps: true }
);

// TTL index: auto-purge audit entries after 90 days
ChatAuditLogSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    name: 'chat_audit_log_ttl',
  }
);

export default (models.ChatAuditLog as mongoose.Model<IChatAuditLog>) ||
  model<IChatAuditLog>('ChatAuditLog', ChatAuditLogSchema);
