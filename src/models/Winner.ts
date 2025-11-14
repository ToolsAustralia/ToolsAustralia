import mongoose, { Document, Schema } from "mongoose";

type WinnerDrawType = "mini" | "major";

export interface IWinner extends Document {
  drawId: mongoose.Types.ObjectId;
  drawType: WinnerDrawType;
  userId: mongoose.Types.ObjectId;
  entryNumber: number;
  selectedDate: Date;
  selectionMethod?: "manual" | "government-app";
  notified: boolean;
  selectedBy?: mongoose.Types.ObjectId;
  prizeSnapshot: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category?: string;
  };
  imageUrl?: string;
  cycle: number;
  createdAt: Date;
  updatedAt: Date;
}

const WinnerSchema = new Schema<IWinner>(
  {
    drawId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    drawType: {
      type: String,
      required: true,
      enum: ["mini", "major"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    entryNumber: {
      type: Number,
      required: true,
      min: [1, "Entry number must be at least 1"],
    },
    selectedDate: {
      type: Date,
      required: true,
    },
    selectionMethod: {
      type: String,
      enum: ["manual", "government-app"],
    },
    notified: {
      type: Boolean,
      default: false,
    },
    selectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    prizeSnapshot: {
      name: { type: String, required: true },
      description: { type: String, required: true },
      value: { type: Number, required: true, min: 0 },
      images: [{ type: String, required: true }],
      category: { type: String },
    },
    imageUrl: {
      type: String,
    },
    cycle: {
      type: Number,
      default: 1,
      min: [1, "Cycle must be at least 1"],
    },
  },
  {
    timestamps: true,
  }
);

WinnerSchema.index({ drawId: 1, cycle: -1 });
WinnerSchema.index({ drawType: 1, createdAt: -1 });

export default mongoose.models.Winner || mongoose.model<IWinner>("Winner", WinnerSchema);
