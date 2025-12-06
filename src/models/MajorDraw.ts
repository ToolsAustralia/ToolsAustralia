import mongoose, { Document, Schema } from "mongoose";

export interface IMajorDraw extends Document {
  name: string;
  description: string;
  /**
   * @deprecated Prize presentation is now handled via static frontend configs.
   * The field remains optional for legacy records and admin history views.
   */
  prize?: {
    name?: string;
    description?: string;
    value?: number;
    images?: string[];
    brand?: string;
    specifications?: Record<string, string | number | string[]>;
    components?: Array<{
      title: string;
      description: string;
      icon?: string;
    }>;
    terms?: string[];
  };
  isActive: boolean; // Backward compatibility - should use status instead

  // NEW: Status management for major draw lifecycle
  status: "queued" | "active" | "frozen" | "completed" | "cancelled";

  // NEW: Critical timestamps (all stored in UTC, display in AEST)
  freezeEntriesAt: Date; // When entries freeze (30 minutes before drawDate)
  drawDate: Date; // When the draw happens and old draw should be deactivated
  activationDate: Date; // When the draw becomes publicly visible (usually midnight after previous draw)

  // NEW: Configuration lock (prevents prize editing during freeze)
  configurationLocked: boolean;
  lockedAt?: Date; // When configuration was locked

  winner?: {
    userId: mongoose.Types.ObjectId;
    entryNumber: number;
    selectedDate: Date;
    notified: boolean;
    // NEW: Winner selection tracking
    selectedBy?: mongoose.Types.ObjectId; // Admin who recorded the winner
    selectionMethod?: "manual" | "government-app";
  };

  // Aggregated entries per user - much more efficient than storing individual entries
  entries: Array<{
    userId: mongoose.Types.ObjectId;
    totalEntries: number; // Total entries for this user in this major draw
    entriesBySource: {
      membership?: number;
      "one-time-package"?: number;
      upsell?: number;
      "mini-draw"?: number;
      referral?: number;
    };
    firstAddedDate: Date; // When user first got entries
    lastUpdatedDate: Date; // When entries were last updated
  }>;
  totalEntries: number;
  latestWinnerId?: mongoose.Types.ObjectId;
  winnerHistory?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const MajorDrawSchema = new Schema<IMajorDraw>(
  {
    name: {
      type: String,
      required: [true, "Major draw name is required"],
      trim: true,
      maxlength: [200, "Major draw name cannot be more than 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Major draw description is required"],
      trim: true,
      maxlength: [2000, "Description cannot be more than 2000 characters"],
    },
    prize: {
      name: {
        type: String,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      value: {
        type: Number,
        min: [0, "Prize value cannot be negative"],
      },
      images: {
        type: [String],
        default: undefined,
      },
      brand: {
        type: String,
        trim: true,
      },
      specifications: {
        type: Schema.Types.Mixed, // Flexible object for any specifications
        default: {},
      },
      components: {
        type: [
          {
            title: {
              type: String,
              required: true,
              trim: true,
            },
            description: {
              type: String,
              required: true,
              trim: true,
            },
            icon: {
              type: String,
              trim: true,
            },
          },
        ],
        default: [],
      },
      terms: [
        {
          type: String,
          trim: true,
        },
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // NEW: Status field for draw lifecycle management
    status: {
      type: String,
      enum: ["queued", "active", "frozen", "completed", "cancelled"],
      default: function (this: IMajorDraw) {
        // Backward compatibility: derive from isActive if not set
        return this.isActive ? "active" : "completed";
      },
      required: [true, "Status is required"],
    },
    // NEW: Freeze entries timestamp (30 minutes before draw date)
    freezeEntriesAt: {
      type: Date,
      required: function (this: IMajorDraw) {
        // Required if drawDate is set
        return !!this.drawDate;
      },
    },
    // NEW: Draw date (when draw happens and old draw deactivates)
    drawDate: {
      type: Date,
      required: function (this: IMajorDraw) {
        // Required for new draws, optional for legacy draws
        return this.status === "queued" || this.status === "active";
      },
    },
    // NEW: Activation date (when draw becomes publicly visible)
    activationDate: {
      type: Date,
      required: function (this: IMajorDraw) {
        // Required for new draws, optional for legacy draws
        return this.status === "queued" || this.status === "active";
      },
    },
    // NEW: Configuration lock flag
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
      // NEW: Winner selection tracking
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
          membership: {
            type: Number,
            default: 0,
            min: [0, "Membership entries cannot be negative"],
          },
          "one-time-package": {
            type: Number,
            default: 0,
            min: [0, "One-time package entries cannot be negative"],
          },
          upsell: {
            type: Number,
            default: 0,
            min: [0, "Upsell entries cannot be negative"],
          },
          "mini-draw": {
            type: Number,
            default: 0,
            min: [0, "Mini-draw entries cannot be negative"],
          },
          referral: {
            type: Number,
            default: 0,
            min: [0, "Referral entries cannot be negative"],
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
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
MajorDrawSchema.index({ isActive: 1 });
MajorDrawSchema.index({ "entries.userId": 1 });
MajorDrawSchema.index({ "winner.userId": 1 });
MajorDrawSchema.index({ drawDate: 1, isActive: 1 });
MajorDrawSchema.index({ createdAt: -1 }); // For getting latest major draw

// NEW: Indexes for status-based queries
MajorDrawSchema.index({ status: 1, activationDate: -1 }); // For finding active/queued draws
MajorDrawSchema.index({ status: 1, drawDate: 1 }); // For cron job transition queries
MajorDrawSchema.index({ freezeEntriesAt: 1 }); // For checking freeze period
MajorDrawSchema.index({ configurationLocked: 1 }); // For admin UI

// Pre-save middleware to update totalEntries count from aggregated entries
MajorDrawSchema.pre("save", function (next) {
  this.totalEntries = this.entries.reduce((sum, entry) => sum + entry.totalEntries, 0);
  next();
});

// NOTE: Middleware must be attached to the schema BEFORE compiling the model.
// We will compile the model at the very end of the file.

// ========================================
// Auto-Transition Middleware
// ========================================
// Similar to promo middleware - automatically transitions major draw statuses
// without needing cron jobs. Uses atomic updateMany operations for safety.

// Pre-hook middleware that runs before any find query
MajorDrawSchema.pre(/^find/, async function (next) {
  const currentDate = new Date();

  try {
    // Get the compiled model safely from mongoose registry
    const MajorDrawModel = (mongoose.models.MajorDraw ||
      mongoose.model<IMajorDraw>("MajorDraw")) as mongoose.Model<IMajorDraw>;

    await MajorDrawModel.updateMany(
      {
        status: { $in: ["active", "frozen"] },
        drawDate: { $lte: currentDate }, // Draw date has passed
      },
      {
        $set: {
          status: "completed",
          isActive: false, // Backward compatibility
          configurationLocked: true,
          lockedAt: currentDate,
        },
      }
    );

    // ========================================
    // STEP 2: Activate queued draws (atomic operation)
    // ========================================
    // Activate queued draws that reached their activation date
    // Happens after completing draws to avoid status conflicts
    await MajorDrawModel.updateMany(
      {
        status: "queued",
        activationDate: { $lte: currentDate }, // Activation time has arrived
      },
      {
        $set: {
          status: "active",
          isActive: true, // Backward compatibility
        },
      }
    );

    // ========================================
    // STEP 3: Freeze active draws (atomic operation)
    // ========================================
    // Freeze active draws that reached freeze time but haven't completed yet
    // Happens last since it only affects active draws
    await MajorDrawModel.updateMany(
      {
        status: "active",
        freezeEntriesAt: { $lte: currentDate }, // Freeze time has arrived
        drawDate: { $gt: currentDate }, // Draw hasn't happened yet
      },
      {
        $set: {
          status: "frozen",
          configurationLocked: true,
          lockedAt: currentDate,
        },
      }
    );
  } catch (error) {
    // Log error but don't block the query - middleware failures shouldn't
    // prevent data retrieval. The cron job backup will handle any missed transitions.
    console.error("❌ Error in major draw transition middleware:", error);
  }

  // Continue with the original query
  next();
});

// Compile and export the model AFTER all middleware is attached
export default mongoose.models.MajorDraw || mongoose.model<IMajorDraw>("MajorDraw", MajorDrawSchema);
