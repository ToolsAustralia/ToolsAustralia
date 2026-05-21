import mongoose, { Document, Schema, Types } from "mongoose";

/**
 * One row per mutation made by a staff or admin user, plus one row per
 * forbidden attempt (status 403). See:
 *   - docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md
 *   - docs/admin/staff-activity-log.md
 *
 * Snapshotting `actorEmail` and `actorRoleName` is deliberate — historical
 * rows must remain readable after a staff member is removed or their role
 * is renamed.
 */
export type StaffActivityMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface IStaffActivity extends Document {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorEmail: string;
  actorRoleName: string;
  action: string;
  method: StaffActivityMethod;
  path: string;
  resourceType?: string;
  resourceId?: string;
  status: number;
  timestamp: Date;
}

const RETENTION_DAYS = 180;

const StaffActivitySchema = new Schema<IStaffActivity>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorEmail: { type: String, required: true },
    actorRoleName: { type: String, required: true },
    action: { type: String, required: true },
    method: {
      type: String,
      enum: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      required: true,
    },
    path: { type: String, required: true },
    resourceType: { type: String },
    resourceId: { type: String },
    status: { type: Number, required: true },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  {
    // We control `timestamp` ourselves (see field above), so disable the
    // auto-generated createdAt/updatedAt pair.
    timestamps: false,
    strict: true,
    strictQuery: true,
  }
);

// 180-day TTL — Mongo prunes expired rows in the background.
StaffActivitySchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 }
);

// Per-actor history ("what did Maya do?")
StaffActivitySchema.index({ actorId: 1, timestamp: -1 });

// Per-resource history ("what happened to user X?") — drives the embedded
// Activity tab in UserDetailModal.
StaffActivitySchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });

// Per-action filter ("who's been charging?")
StaffActivitySchema.index({ action: 1, timestamp: -1 });

// Next.js HMR quirk: clear cached model so schema edits take effect on reload.
if (mongoose.models.StaffActivity) {
  delete mongoose.models.StaffActivity;
}

export default mongoose.model<IStaffActivity>(
  "StaffActivity",
  StaffActivitySchema
);
