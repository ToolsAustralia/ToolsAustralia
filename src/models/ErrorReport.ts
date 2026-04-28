import mongoose, { Document, Schema } from "mongoose";
import type { IErrorReport } from "@/types/error-reporting";

/**
 * Error Report Model
 * 
 * Stores error reports submitted by users from toast error notifications.
 * Includes automatic context collection, deduplication, and admin workflow management.
 * 
 * Features:
 * - Automatic TTL cleanup (90 days)
 * - Deduplication to prevent spam
 * - Privacy-protected IP addresses (hashed)
 * - Comprehensive error context capture
 * - Admin workflow status tracking
 */
export interface IErrorReportDocument extends IErrorReport, Document {
  _id: string;
}

const ConsoleErrorSchema = new Schema(
  {
    message: { type: String, required: true },
    source: { type: String },
    line: { type: Number },
    column: { type: Number },
    timestamp: { type: Number, required: true },
  },
  { _id: false }
);

const BrowserInfoSchema = new Schema(
  {
    name: { type: String },
    version: { type: String },
    os: { type: String },
  },
  { _id: false }
);

const ErrorReportSchema = new Schema<IErrorReportDocument>(
  {
    // User information
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      // No index: true - redundant with compound index userId_1_createdAt_-1
    },
    userEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, "Email cannot be more than 255 characters"],
    },
    guestEmail: {
      // ✅ NEW: Guest user email (for non-authenticated users)
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [255, "Email cannot be more than 255 characters"],
      // No index: true - redundant with compound index guestEmail_1_createdAt_-1
    },
    isAuthenticated: {
      type: Boolean,
      required: true,
      default: false,
    },

    // Error details
    errorMessage: {
      type: String,
      required: [true, "Error message is required"],
      trim: true,
      maxlength: [2000, "Error message cannot be more than 2000 characters"],
    },
    errorStack: {
      type: String,
      trim: true,
      maxlength: [10000, "Error stack cannot be more than 10000 characters"],
    },
    errorName: {
      type: String,
      trim: true,
      maxlength: [200, "Error name cannot be more than 200 characters"],
    },
    // ✅ NEW: Error category and severity for better filtering and analytics
    category: {
      type: String,
      enum: ["payment", "network", "api", "system", "recovery"],
      // No index: true - redundant with compound indexes category_1_createdAt_-1, category_1_severity_1_createdAt_-1
    },
    severity: {
      type: String,
      enum: ["critical", "high", "medium"],
      // No index: true - redundant with compound index severity_1_createdAt_-1
    },
    autoLogged: {
      type: Boolean,
      default: false,
      // No index: true - redundant with compound index autoLogged_1_createdAt_-1
    },

    // Request/Response information
    apiEndpoint: {
      type: String,
      trim: true,
      maxlength: [500, "API endpoint cannot be more than 500 characters"],
    },
    httpMethod: {
      type: String,
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
      uppercase: true,
    },
    httpStatus: {
      type: Number,
      min: [100, "HTTP status must be at least 100"],
      max: [599, "HTTP status cannot exceed 599"],
    },
    requestUrl: {
      type: String,
      trim: true,
      maxlength: [2000, "Request URL cannot be more than 2000 characters"],
    },

    // User-provided notes (optional)
    userNotes: {
      type: String,
      trim: true,
      maxlength: [2000, "User notes cannot be more than 2000 characters"],
    },

    // Browser/environment information
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, "User agent cannot be more than 500 characters"],
    },
    browserInfo: {
      type: BrowserInfoSchema,
    },

    // Page/route information
    currentUrl: {
      type: String,
      trim: true,
      maxlength: [2000, "Current URL cannot be more than 2000 characters"],
    },
    route: {
      type: String,
      trim: true,
      maxlength: [500, "Route cannot be more than 500 characters"],
    },
    referrer: {
      type: String,
      trim: true,
      maxlength: [2000, "Referrer cannot be more than 2000 characters"],
    },

    // Network and console information
    consoleErrors: {
      type: [ConsoleErrorSchema],
      default: [],
    },

    // Privacy-protected information
    ipAddressHash: {
      type: String,
      trim: true,
      maxlength: [64, "IP address hash cannot be more than 64 characters"],
    },

    // Status and admin management
    status: {
      type: String,
      enum: ["new", "investigating", "resolved", "dismissed"],
      default: "new",
      required: true,
      // No index: true - redundant with compound index status_1_createdAt_-1
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [2000, "Admin notes cannot be more than 2000 characters"],
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    archiveReason: {
      type: String,
      trim: true,
      maxlength: [500, "Archive reason cannot be more than 500 characters"],
    },

    // Deduplication
    deduplicationHash: {
      type: String,
      required: [true, "Deduplication hash is required"],
      unique: true,
      index: true,
      trim: true,
      maxlength: [64, "Deduplication hash cannot be more than 64 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
// Compound index for user history queries
ErrorReportSchema.index({ userId: 1, createdAt: -1 });

// ✅ NEW: Compound index for guest email queries
ErrorReportSchema.index({ guestEmail: 1, createdAt: -1 });

// Compound index for admin filtering by status and date
ErrorReportSchema.index({ status: 1, createdAt: -1 });

// ✅ NEW: Compound indexes for advanced filtering
ErrorReportSchema.index({ category: 1, createdAt: -1 });
ErrorReportSchema.index({ severity: 1, createdAt: -1 });
ErrorReportSchema.index({ autoLogged: 1, createdAt: -1 });
ErrorReportSchema.index({ category: 1, severity: 1, createdAt: -1 });
ErrorReportSchema.index({ archivedAt: 1, createdAt: -1 });

// Index for API endpoint queries (useful for debugging specific endpoints)
ErrorReportSchema.index({ apiEndpoint: 1, createdAt: -1 });

// Index for searching error messages
ErrorReportSchema.index({ errorMessage: "text" });

// TTL index: Automatically delete reports older than 90 days
ErrorReportSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days in seconds
    name: "error_reports_ttl",
  }
);

// Virtual for formatted error display
ErrorReportSchema.virtual("formattedError").get(function () {
  return `${this.errorName || "Error"}: ${this.errorMessage}`;
});

// Ensure virtuals are included in JSON output
ErrorReportSchema.set("toJSON", { virtuals: true });
ErrorReportSchema.set("toObject", { virtuals: true });

export default mongoose.models.ErrorReport ||
  mongoose.model<IErrorReportDocument>("ErrorReport", ErrorReportSchema);

