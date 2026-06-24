import mongoose, { Document, Schema, model, models } from 'mongoose';

/**
 * ChatMessage Model
 *
 * Stores individual messages within a ChatConversation.
 * PII is redacted at the service layer before content reaches this model.
 * toolCalls records names + outcomes only — raw arguments are never stored.
 * TTL index on createdAt purges messages after 90 days (aligned with ChatConversation).
 */

export interface IChatCitation {
  docId: string;
  span?: string;
}

export interface IChatToolCall {
  name: string;
  ok: boolean;
  durationMs?: number;
}

export interface IChatMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  citations?: IChatCitation[];
  toolCalls?: IChatToolCall[];
  createdAt: Date;
  updatedAt: Date;
}

const CitationSchema = new Schema<IChatCitation>(
  {
    docId: { type: String, required: true },
    span: { type: String },
  },
  { _id: false }
);

const ToolCallSchema = new Schema<IChatToolCall>(
  {
    name: { type: String, required: true },
    ok: { type: Boolean, required: true },
    durationMs: { type: Number },
  },
  { _id: false }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatConversation',
      required: [true, 'conversationId is required'],
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'tool'],
      required: [true, 'role is required'],
    },
    content: {
      type: String,
      required: [true, 'content is required'],
    },
    citations: {
      type: [CitationSchema],
    },
    toolCalls: {
      type: [ToolCallSchema],
    },
  },
  { timestamps: true }
);

// TTL index: auto-purge messages after 90 days (aligned with ChatConversation retention)
ChatMessageSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    name: 'chat_messages_ttl',
  }
);

export default (models.ChatMessage as mongoose.Model<IChatMessage>) ||
  model<IChatMessage>('ChatMessage', ChatMessageSchema);
