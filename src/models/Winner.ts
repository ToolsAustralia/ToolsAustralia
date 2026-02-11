import mongoose, { Document, Schema } from "mongoose";

type WinnerDrawType = "mini" | "major";

export interface IWinner extends Document {
  drawId: mongoose.Types.ObjectId;
  drawType: WinnerDrawType;
  userId: mongoose.Types.ObjectId;
  entryNumber?: number;
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
  // Testimony from the winner (optional, can be added later)
  testimony?: string;
  // Selected prize text for major draws (optional, only for major draw winners)
  // This is a free-form text field to allow flexibility as prize values change
  selectedPrize?: string;
  // Legacy field - kept for backward compatibility, will be migrated to selectedPrize
  selectedPrizeSlug?: string;
  cycle: number;
  createdAt: Date;
  updatedAt: Date;
}

const WinnerSchema = new Schema<IWinner>(
  {
    drawId: {
      type: Schema.Types.ObjectId,
      required: true,
      // No index: true - redundant with compound index drawId_1_cycle_-1
    },
    drawType: {
      type: String,
      required: true,
      enum: ["mini", "major"],
      // No index: true - redundant with compound index drawType_1_createdAt_-1
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    entryNumber: {
      type: Number,
      required: false,
      default: 0,
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
    // Testimony from the winner (optional, can be added later)
    testimony: {
      type: String,
      trim: true,
    },
    // Selected prize text for major draws (optional, only for major draw winners)
    // Free-form text field to allow flexibility as prize values change
    selectedPrize: {
      type: String,
      trim: true,
    },
    // Legacy field - kept for backward compatibility
    selectedPrizeSlug: {
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

// Clear cached model if it exists to ensure schema changes are applied
if (mongoose.models.Winner) {
  delete mongoose.models.Winner;
}

export default mongoose.model<IWinner>("Winner", WinnerSchema);
