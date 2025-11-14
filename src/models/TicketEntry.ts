import mongoose, { Document, Schema } from "mongoose";

export interface ITicketEntry extends Document {
  userId: mongoose.Types.ObjectId;
  miniDrawId: mongoose.Types.ObjectId;
  ticketNumber: number;
  source: "purchase" | "membership" | "one-time-package" | "entry-wallet" | "upsell";
  purchaseDate: Date;
  amount?: number; // Amount paid if purchased directly
  isWinner: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TicketEntrySchema = new Schema<ITicketEntry>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    miniDrawId: {
      type: Schema.Types.ObjectId,
      ref: "MiniDraw",
      required: [true, "Mini draw ID is required"],
    },
    ticketNumber: {
      type: Number,
      required: [true, "Ticket number is required"],
      min: [1, "Ticket number must be at least 1"],
    },
    source: {
      type: String,
      enum: ["purchase", "membership", "one-time-package", "entry-wallet"],
      required: [true, "Entry source is required"],
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    amount: {
      type: Number,
      min: [0, "Amount cannot be negative"],
    },
    isWinner: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
TicketEntrySchema.index({ userId: 1 });
TicketEntrySchema.index({ miniDrawId: 1 });
TicketEntrySchema.index({ userId: 1, miniDrawId: 1 });
TicketEntrySchema.index({ isWinner: 1 });
TicketEntrySchema.index({ source: 1 });
TicketEntrySchema.index({ purchaseDate: -1 });

export default mongoose.models.TicketEntry || mongoose.model<ITicketEntry>("TicketEntry", TicketEntrySchema);
