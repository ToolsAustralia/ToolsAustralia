import mongoose, { Document, Schema } from "mongoose";

export interface IMiniDraw extends Document {
  name: string;
  description: string;
  prize: {
    name: string;
    description: string;
    value: number;
    images: string[];
    category: string; // e.g., "vehicle", "electronics", "travel", "cash", "experience"
  };
  isActive: boolean; // Backward compatibility - should use status instead

  // Status management for mini draw lifecycle
  status: "active" | "completed" | "cancelled";

  // Configuration lock (prevents prize editing during freeze)
  configurationLocked: boolean;
  lockedAt?: Date; // When configuration was locked

  winner?: {
    userId: mongoose.Types.ObjectId;
    entryNumber: number;
    selectedDate: Date;
    notified: boolean;
    // Winner selection tracking
    selectedBy?: mongoose.Types.ObjectId; // Admin who recorded the winner
    selectionMethod?: "manual" | "government-app";
  };

  // Aggregated entries per user - much more efficient than storing individual entries
  entries: Array<{
    userId: mongoose.Types.ObjectId;
    totalEntries: number; // Total entries for this user in this mini draw
    entriesBySource: {
      "mini-draw-package"?: number;
      "free-entry"?: number; // Reserved for future use
    };
    firstAddedDate: Date; // When user first got entries
    lastUpdatedDate: Date; // When entries were last updated
  }>;
  totalEntries: number;
  minimumEntries: number; // Required minimum entries - when reached, draw auto-closes
  latestWinnerId?: mongoose.Types.ObjectId;
  winnerHistory?: mongoose.Types.ObjectId[];
  cycle: number;
  createdAt: Date;
  updatedAt: Date;
}

const MiniDrawSchema = new Schema<IMiniDraw>(
  {
    name: {
      type: String,
      required: [true, "Mini draw name is required"],
      trim: true,
      maxlength: [200, "Mini draw name cannot be more than 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Mini draw description is required"],
      trim: true,
      maxlength: [2000, "Description cannot be more than 2000 characters"],
    },
    prize: {
      name: {
        type: String,
        required: [true, "Prize name is required"],
        trim: true,
      },
      description: {
        type: String,
        required: [true, "Prize description is required"],
        trim: true,
      },
      value: {
        type: Number,
        required: [true, "Prize value is required"],
        min: [0, "Prize value cannot be negative"],
      },
      images: [
        {
          type: String,
          required: true,
        },
      ],
      category: {
        type: String,
        required: [true, "Prize category is required"],
        trim: true,
        enum: ["vehicle", "electronics", "travel", "cash", "experience", "home", "fashion", "sports", "other"],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Status field for draw lifecycle management
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
      required: [true, "Status is required"],
    },
    // Configuration lock flag
    configurationLocked: {
      type: Boolean,
      default: false,
    },
    lockedAt: {
      type: Date,
    },
    winner: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      entryNumber: {
        type: Number,
        min: [1, "Entry number must be at least 1"],
      },
      selectedDate: Date,
      notified: {
        type: Boolean,
        default: false,
      },
      // Winner selection tracking
      selectedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      selectionMethod: {
        type: String,
        enum: ["manual", "government-app"],
      },
    },
    entries: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        totalEntries: {
          type: Number,
          required: true,
          min: [0, "Total entries cannot be negative"],
        },
        entriesBySource: {
          "mini-draw-package": {
            type: Number,
            default: 0,
            min: [0, "Mini-draw package entries cannot be negative"],
          },
          "free-entry": {
            type: Number,
            default: 0,
            min: [0, "Free entries cannot be negative"],
          },
        },
        firstAddedDate: {
          type: Date,
          default: Date.now,
        },
        lastUpdatedDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    totalEntries: {
      type: Number,
      default: 0,
      min: [0, "Total entries cannot be negative"],
    },
    minimumEntries: {
      type: Number,
      required: [true, "Minimum entries is required"],
      min: [1, "Minimum entries must be at least 1"],
    },
    latestWinnerId: {
      type: Schema.Types.ObjectId,
      ref: "Winner",
    },
    winnerHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Winner",
      },
    ],
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

// Indexes for better query performance
MiniDrawSchema.index({ isActive: 1 });
MiniDrawSchema.index({ "entries.userId": 1 });
MiniDrawSchema.index({ "winner.userId": 1 });
MiniDrawSchema.index({ createdAt: -1 }); // For getting latest mini draw

// Indexes for status-based queries
MiniDrawSchema.index({ status: 1 }); // For status-based queries
MiniDrawSchema.index({ configurationLocked: 1 }); // For admin UI

// Pre-save middleware to update totalEntries count from aggregated entries
MiniDrawSchema.pre("save", function (next) {
  this.totalEntries = this.entries.reduce((sum, entry) => sum + entry.totalEntries, 0);
  next();
});

// NOTE: Middleware must be attached to the schema BEFORE compiling the model.
// We will compile the model at the very end of the file.

// Compile and export the model AFTER all middleware is attached
export default mongoose.models.MiniDraw || mongoose.model<IMiniDraw>("MiniDraw", MiniDrawSchema);
