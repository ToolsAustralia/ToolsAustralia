import mongoose, { Document, Schema, Types } from "mongoose";
import { isValidPermission } from "@/lib/permissions";

export interface IRole extends Document {
  _id: Types.ObjectId;
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      trim: true,
      maxlength: [60, "Role name cannot be more than 60 characters"],
      unique: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (perms: string[]) => perms.every(isValidPermission),
        message: (props) =>
          `Permission list contains unknown values: ${JSON.stringify(props.value)}`,
      },
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    strict: true,
    strictQuery: true,
  }
);

// Note: unique index on `name` is automatically created by Mongoose because `unique: true` is set above.

if (mongoose.models.Role) {
  delete mongoose.models.Role;
}

export default mongoose.model<IRole>("Role", RoleSchema);
