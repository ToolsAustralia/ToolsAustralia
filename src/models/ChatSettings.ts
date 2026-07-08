import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatSettings extends Document {
  key: string;
  activeProvider: "anthropic" | "google";
  /**
   * Admin-controlled pause switch for Cobber. When true, the chat bubble is
   * hidden site-wide (via GET /api/chat/config) and the generative path is
   * blocked in costGuard (canned reply). This is the operator-facing "Paused"
   * toggle; the CHAT_KILL_SWITCH env var is an independent break-glass override
   * that wins over this field. Default false = Cobber live.
   */
  killSwitch: boolean;
  updatedAt: Date;
  createdAt: Date;
}

const ChatSettingsSchema = new Schema<IChatSettings>(
  {
    key: { type: String, default: "chat", unique: true },
    activeProvider: {
      type: String,
      enum: ["anthropic", "google"],
      default: "anthropic",
    },
    killSwitch: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const ChatSettings: Model<IChatSettings> =
  (mongoose.models.ChatSettings as Model<IChatSettings>) ||
  mongoose.model<IChatSettings>("ChatSettings", ChatSettingsSchema);

export default ChatSettings;
