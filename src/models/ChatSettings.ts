import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatSettings extends Document {
  key: string;
  activeProvider: "anthropic" | "google";
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
  },
  { timestamps: true }
);

const ChatSettings: Model<IChatSettings> =
  (mongoose.models.ChatSettings as Model<IChatSettings>) ||
  mongoose.model<IChatSettings>("ChatSettings", ChatSettingsSchema);

export default ChatSettings;
